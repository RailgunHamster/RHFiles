package com.railgunhamster.rhfiles;

import android.app.*;
import android.content.Intent;
import android.os.Bundle;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.util.concurrent.*;

/** No app/Kotlin classes referenced: the same runner can probe old and new R8
 * APKs without linking against a different version's obfuscated runtime. */
public class SmbUpdateInstrumentation extends Instrumentation {
    private Bundle arguments;
    private Activity activity;
    @Override public void onCreate(Bundle args) {super.onCreate(args);arguments=args;start();}
    private WebView find(View v) {
        if(v instanceof WebView)return (WebView)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView found=find(((ViewGroup)v).getChildAt(i));if(found!=null)return found;}
        return null;
    }
    private String eval(String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);String[] result={"null"};
        runOnMainSync(()->{WebView web=find(activity.getWindow().getDecorView());if(web==null){latch.countDown();return;}web.evaluateJavascript(script,value->{result[0]=value;latch.countDown();});});
        if(!latch.await(15,TimeUnit.SECONDS))throw new Exception("JavaScript evaluation timed out");return result[0];
    }
    private JSONObject json(String script) throws Exception {return new JSONObject(new JSONTokener(eval("JSON.stringify("+script+")")).nextValue().toString());}
    private void require(boolean value,String detail) throws Exception {if(!value)throw new Exception(detail);}
    private String accessible(android.view.accessibility.AccessibilityNodeInfo node){
        if(node==null)return "";StringBuilder text=new StringBuilder();if(node.getText()!=null)text.append(node.getText()).append('\n');
        for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo child=node.getChild(i);text.append(accessible(child));if(child!=null)child.recycle();}return text.toString();
    }
    private void ebookProbe(Bundle result) throws Exception {
        String path=arguments.getString("book");require(path!=null&&path.startsWith("/storage/emulated/0/Download/RHFiles-"),"Only owned emulator fixtures allowed");
        eval("void api.native('ebook.open',{path:"+JSONObject.quote(path)+",name:'test.epub',theme:'light'}).catch(e=>window.__ebookQaError=String(e))");
        long end=System.currentTimeMillis()+40000;String text="";
        while(System.currentTimeMillis()<end){android.view.accessibility.AccessibilityNodeInfo node=getUiAutomation().getRootInActiveWindow();text=accessible(node);if(node!=null)node.recycle();if(text.contains("第一章 中文阅读"))break;Thread.sleep(250);}
        require(text.contains("第一章 中文阅读"),"Minified reader did not render book text: "+text.substring(0,Math.min(1500,text.length())));
        android.graphics.Bitmap screenshot=getUiAutomation().takeScreenshot();
        if(screenshot!=null)try(java.io.FileOutputStream output=new java.io.FileOutputStream("/storage/emulated/0/Download/RHFiles-Release-QA-reader.png")){screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);screenshot.recycle();}
        result.putString("readerText",text.substring(0,Math.min(text.length(),1000)));result.putString("pass","true");finish(Activity.RESULT_OK,result);
    }
    private void nearbyProbe(Bundle result) throws Exception {
        String source=arguments.getString("source"),destination=arguments.getString("destination"),host=arguments.getString("host");
        require(source!=null&&destination!=null&&source.startsWith("/storage/emulated/0/Download/RHFiles-")&&destination.startsWith("/storage/emulated/0/Download/RHFiles-")&&host!=null&&host.startsWith("10.0.2.2:"),"Only owned emulator fixtures and emulator host gateway allowed");
        String script="void(async()=>{try{await api.native('nearby.keepAlive',{enabled:true});await api.raw('nearby_start',{alias:'Minified Android QA'});const status=await api.raw('nearby_status');window.__nearbyQa={phase:'listening',port:status.port};"+
          "const peer=await api.raw('nearby_probe',{address:"+JSONObject.quote(host)+"});const sent=await api.raw('nearby_send',{peerId:peer.id,confirmedFingerprint:peer.id,sources:["+JSONObject.quote(source)+"]});"+
          "const until=async check=>{const end=Date.now()+120000;while(Date.now()<end){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,200));}throw Error('Native Nearby probe timed out')};"+
          "await until(async()=>{const job=(await api.raw('nearby_status')).transfers.find(t=>t.id===sent);if(['failed','canceled'].includes(job?.state))throw Error(job.message);return job?.state==='completed'});window.__nearbyQa.phase='sent';"+
          "const incoming=await until(async()=>(await api.raw('nearby_status')).transfers.find(t=>t.direction==='receive'&&t.state==='waiting'));await api.raw('nearby_accept',{id:incoming.id,destination:"+JSONObject.quote(destination)+"});"+
          "const received=await until(async()=>{const job=(await api.raw('nearby_status')).transfers.find(t=>t.id===incoming.id);if(['failed','canceled'].includes(job?.state))throw Error(job.message);return job?.state==='completed'&&job});"+
          "await api.native('nearby.keepAlive',{enabled:false});await until(async()=>!(await api.raw('nearby_status')).running);window.__nearbyQa={phase:'completed',output:received.output};}catch(e){window.__nearbyQa={error:String(e)}}})();";
        eval(script);long end=System.currentTimeMillis()+180000;boolean reported=false;
        while(System.currentTimeMillis()<end){JSONObject marker=json("window.__nearbyQa || {}");require(!marker.has("error"),marker.optString("error"));
            if(!reported&&marker.has("port")){Bundle listening=new Bundle();listening.putString("nearbyPort",String.valueOf(marker.getInt("port")));sendStatus(1,listening);reported=true;}
            if(marker.optString("phase").equals("completed")){result.putString("pass","true");result.putString("nearbyOutput",marker.getString("output"));finish(Activity.RESULT_OK,result);return;}Thread.sleep(250);
        }throw new Exception("Minified Nearby probe timed out");
    }
    private void githubProbe(Bundle result) throws Exception {
        String expected=arguments.getString("expect","available"),version=arguments.getString("version",""),proxy=arguments.getString("proxy","");
        require(expected.equals("available")||expected.equals("latest"),"Unexpected GitHub probe state");
        eval("void(async()=>{try{const end=Date.now()+60000;while(true){await api.native('update.cancel');try{"+
          "await api.native('update.save',{source:'github',github:'https://github.com/RailgunHamster/RHFiles',family:'smb://SERVER-HOME/Public/Software/RHFiles-Releases',connectionId:'',autoCheck:false,proxyEnabled:"+(!proxy.isEmpty())+",proxy:"+JSONObject.quote(proxy)+"});break;}catch(e){if(Date.now()>end)throw e;await new Promise(r=>setTimeout(r,200));}}"+
          "await api.native('update.check',{manual:true,reason:'release-github-probe'});window.__githubQa={started:true};}catch(e){window.__githubQa={error:String(e)}}})();");
        long end=System.currentTimeMillis()+180000;JSONObject status=new JSONObject();
        while(System.currentTimeMillis()<end){JSONObject marker=json("window.__githubQa || {}");require(!marker.has("error"),marker.optString("error"));
            if(marker.optBoolean("started")){eval("void api.native('update.status').then(s=>window.__githubStatus=s)");Thread.sleep(150);status=json("window.__githubStatus || {}");String state=status.optString("state");if(!state.isEmpty()&&!state.equals("checking"))break;}Thread.sleep(200);}
        require(status.optString("state").equals(expected),"GitHub update state: "+status);
        result.putString("state",status.getString("state"));
        if(expected.equals("available")){
            JSONObject release=status.getJSONObject("release");require(version.equals(release.getString("version")),"Unexpected version: "+release);result.putString("version",release.getString("version"));
            eval("void api.native('update.download').catch(e=>window.__githubDownloadError=String(e))");end=System.currentTimeMillis()+180000;
            while(System.currentTimeMillis()<end){eval("void api.native('update.status').then(s=>window.__githubStatus=s)");Thread.sleep(250);status=json("window.__githubStatus || {}");if(status.optString("state").equals("ready")||status.optString("state").equals("failed"))break;Thread.sleep(250);}
            require(status.optString("state").equals("ready"),"APK download/verification failed: "+status);require(status.getLong("bytes")==release.getLong("size"),"APK byte count mismatch");result.putString("downloadState","ready");result.putString("bytes",String.valueOf(status.getLong("bytes")));
        }
        result.putString("pass","true");finish(Activity.RESULT_OK,result);
    }
    private void awaitScript(String script) throws Exception {
        long end=System.currentTimeMillis()+45000;
        while(!eval(script).equals("true")){require(System.currentTimeMillis()<end,"UI condition timed out: "+script);Thread.sleep(150);}
    }
    private void tapCss(String selector) throws Exception {
        tapCss(selector,false);
    }
    private void tapCss(String selector,boolean inPane) throws Exception {
        JSONObject point=json("(()=>{const f="+(inPane?"document.querySelector('.file-pane:not([hidden])')":"null")+",n=(f?f.contentDocument:document).querySelector("+JSONObject.quote(selector)+");if(!n)throw Error('Missing touch target');const r=n.getBoundingClientRect(),o=f?f.getBoundingClientRect():{x:0,y:0};if(!r.width||!r.height)throw Error('Hidden touch target');return{x:o.x+r.x+r.width/2,y:o.y+r.y+r.height/2,width:innerWidth};})()");
        int[] offset=new int[2],width=new int[1];runOnMainSync(()->{WebView web=find(activity.getWindow().getDecorView());web.getLocationOnScreen(offset);width[0]=web.getWidth();});
        float scale=(float)(width[0]/point.getDouble("width")),x=offset[0]+(float)point.getDouble("x")*scale,y=offset[1]+(float)point.getDouble("y")*scale;
        long now=android.os.SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(now,now+80,MotionEvent.ACTION_UP,x,y,0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try{require(getUiAutomation().injectInputEvent(down,true),"Touch down rejected");Thread.sleep(80);require(getUiAutomation().injectInputEvent(up,true),"Touch up rejected");}finally{down.recycle();up.recycle();}Thread.sleep(200);
    }
    private void screenshot(String name) throws Exception {
        CountDownLatch painted=new CountDownLatch(1);
        runOnMainSync(()->{WebView web=find(activity.getWindow().getDecorView());web.postVisualStateCallback(1,new WebView.VisualStateCallback(){@Override public void onComplete(long id){painted.countDown();}});});
        require(painted.await(10,TimeUnit.SECONDS),"WebView paint did not settle");Thread.sleep(400);
        android.graphics.Bitmap image=getUiAutomation().takeScreenshot();require(image!=null,"Screenshot unavailable");
        try(java.io.FileOutputStream stream=new java.io.FileOutputStream("/storage/emulated/0/Download/RHFiles-Release-QA-phone-"+name+".png")){image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream);}finally{image.recycle();}
    }
    private void panesProbe(Bundle result) throws Exception {
        awaitScript("!!window.RHFilesWorkbench&&!!document.querySelector('.file-pane')?.contentWindow.rhfilesPane");
        require(json("({width:innerWidth})").getInt("width")<480,"Ordinary narrow phone viewport required");
        eval("window.RHFilesWorkbench.openLayout(document.querySelector('.file-pane').contentWindow);document.querySelector('[data-layout=single]').click()");
        awaitScript("document.getElementById('workbench').dataset.mode==='single'");
        require(eval("!document.querySelector('.single-layout-toggle')").equals("true"),"Floating split control must be removed");
        tapCss("#btn-overflow",true);tapCss("[data-command=pane-layout]",true);
        awaitScript("!document.getElementById('sheet').hidden&&!!document.querySelector('[data-layout=rows]')");
        require(eval("getComputedStyle(document.querySelector('#sheet-panel button')).outlineStyle==='none'").equals("true"),"Touch-opened layout sheet must not show a keyboard focus rectangle");
        screenshot("layout-menu");tapCss("[data-layout=rows]");
        awaitScript("document.getElementById('workbench').dataset.mode==='rows'&&document.querySelectorAll('.file-pane').length===2&&[...document.querySelectorAll('.file-pane')].every(f=>!!f.contentWindow.rhfilesPane)");
        awaitScript("!!document.querySelectorAll('.file-pane')[0].contentDocument.querySelector('[data-tile=downloads]')");
        eval("document.querySelectorAll('.file-pane')[0].contentDocument.querySelector('[data-tile=downloads]').click()");
        awaitScript("document.querySelectorAll('.file-pane')[0].contentWindow.rhfilesPane.snapshot().route.screen==='folder'&&!document.querySelectorAll('.file-pane')[0].contentWindow.rhfilesPane.snapshot().busy&&!document.querySelectorAll('.file-pane')[0].contentDocument.getElementById('filelist').hidden&&!!document.querySelectorAll('.file-pane')[1].contentDocument.querySelector('[data-tile=downloads]')");
        requireCenteredDivider();screenshot("rows");tapCss(".pane-divider button");tapCss("[data-layout=columns]");
        awaitScript("document.getElementById('workbench').dataset.mode==='columns'&&(()=>{const frames=[...document.querySelectorAll('.file-pane')].map(f=>f.getBoundingClientRect());return frames[0].width<innerWidth*.6&&frames[1].left>=frames[0].right;})()");
        require(eval("document.querySelectorAll('.file-pane')[0].contentWindow.rhfilesPane.snapshot().route.screen==='folder'&&document.querySelectorAll('.file-pane')[1].contentWindow.rhfilesPane.snapshot().route.screen==='home'").equals("true"),"Switching layout lost independent routes");
        requireCenteredDivider();screenshot("columns");tapCss(".pane-divider button");tapCss("[data-layout=single]");
        awaitScript("document.getElementById('workbench').dataset.mode==='single'&&document.querySelector('.pane-divider').hidden");
        screenshot("single");result.putString("layouts","toolbar layout sheet; centered non-overlapping grips; narrow-phone rows, columns, single; independent routes; real taps");result.putString("pass","true");finish(Activity.RESULT_OK,result);
    }
    private void requireCenteredDivider() throws Exception {
        require(eval("(()=>{const b=document.querySelector('.pane-divider button'),r=b.getBoundingClientRect(),d=b.parentNode.getBoundingClientRect(),g=getComputedStyle(b,'::before');return Math.abs(r.x+r.width/2-d.x-d.width/2)<.5&&Math.abs(r.y+r.height/2-d.y-d.height/2)<.5&&Math.abs(parseFloat(g.left)-r.width/2)<.5&&Math.abs(parseFloat(g.top)-r.height/2)<.5&&parseFloat(g.width)<=d.width&&parseFloat(g.height)<=d.height;})()").equals("true"),"Divider grip must be centered and contained in its reserved strip");
    }
    @Override public void onStart() {
        Bundle result=new Bundle();
        try {
            require(android.os.Build.FINGERPRINT.contains("generic") || android.os.Build.MODEL.contains("sdk"),"Emulator required");
            Intent intent=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);activity=startActivitySync(intent);
            long deadline=System.currentTimeMillis()+60000;
            while(!eval("typeof api!=='undefined' && !!window.rhfilesHandleBack").equals("true")){require(System.currentTimeMillis()<deadline,"Frontend not ready");Thread.sleep(150);}
            if(arguments.getString("mode","").equals("ebook")){ebookProbe(result);return;}
            if(arguments.getString("mode","").equals("nearby")){nearbyProbe(result);return;}
            if(arguments.getString("mode","").equals("github")){githubProbe(result);return;}
            if(arguments.getString("mode","").equals("panes")){panesProbe(result);return;}
            eval("void(async()=>{try{const id=await api.native('connection.save',{type:'smb',name:'QA loopback fixture',host:'127.0.0.1',port:1445,share:'QA',username:'QA\\\\qa',password:'qa-pass',domain:''});"+
                "await api.native('update.save',{source:'family',github:'https://github.com/RailgunHamster/RHFiles',family:'smb://127.0.0.1/QA',connectionId:id,autoCheck:false,proxyEnabled:false,proxy:''});"+
                "await api.native('update.check',{manual:true,reason:'release-smb-probe'});window.__smbQa={started:true};}catch(e){window.__smbQa={error:String(e)}}})();");
            JSONObject status=new JSONObject();
            while(System.currentTimeMillis()<deadline){
                JSONObject marker=json("window.__smbQa || {}");require(!marker.has("error"),marker.optString("error"));
                if(marker.optBoolean("started")){
                    eval("void api.native('update.status').then(s=>window.__smbStatus=s)");Thread.sleep(150);status=json("window.__smbStatus || {}");
                    String state=status.optString("state");if(!state.isEmpty()&&!state.equals("checking"))break;
                }
                Thread.sleep(200);
            }
            result.putString("status",status.toString());
            if(arguments.getString("expect","available").equals("constructor"))require(status.optString("message").contains("provided handler invocation"),"Expected old constructor failure: "+status);
            else {
                require(status.optString("state").equals("available"),"SMB feed failed: "+status);
                eval("void api.native('update.download').catch(e=>window.__smbDownloadError=String(e))");
                long downloadEnd=System.currentTimeMillis()+90000;
                while(System.currentTimeMillis()<downloadEnd){
                    eval("void api.native('update.status').then(s=>window.__smbStatus=s)");Thread.sleep(350);status=json("window.__smbStatus || {}");
                    if(status.optString("state").equals("failed"))break;Thread.sleep(300);
                }
                // Metadata intentionally advertises one code newer than the real
                // APK. Verify full SMB transfer then reject before installation.
                require(status.optString("state").equals("failed")&&status.optString("message").contains("版本"),"Expected identity rejection after transfer: "+status);
                require(status.getLong("bytes")==status.getJSONObject("release").getLong("size"),"APK not fully transferred");
                result.putString("downloadStatus",status.toString());
            }
            result.putString("pass","true");finish(Activity.RESULT_OK,result);
        }catch(Throwable error){try{screenshot("failure");}catch(Throwable ignored){}result.putString("pass","false");result.putString("error",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,result);}
    }
}
