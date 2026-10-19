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
    private void networkProfileProbe(Bundle result) throws Exception {
        Class<?> packet=Class.forName("com.rapid7.client.dcerpc.io.PacketInput",true,getTargetContext().getClassLoader());
        Object input=packet.getConstructor(java.io.InputStream.class).newInstance(new java.io.ByteArrayInputStream(new byte[]{-1,-1,-1,-1}));
        try{packet.getMethod("readIndex",String.class).invoke(input,"QA");throw new Exception("RPC codec accepted a negative index");}
        catch(java.lang.reflect.InvocationTargetException error){require(error.getCause() instanceof java.io.IOException,"Android RPC codec error type missing: "+error.getCause());}
        eval("void(async()=>{let id,scan;try{const p={type:'smb',name:'QA host profile',host:'192.0.2.20',share:'',username:'qa',password:'fixture-only'};"+
          "id=await api.native('connection.save',p);let edit=await api.native('connection.get',{id});if('password' in edit||!edit.hasPassword)throw Error('Password disclosure or missing password');"+
          "if(edit.share!=='')throw Error('Host-only profile rejected');edit.name='QA edited profile';edit.password='';if(await api.native('connection.save',edit)!==id)throw Error('Identity changed');"+
          "edit=await api.native('connection.get',{id});if(edit.name!=='QA edited profile'||!edit.hasPassword)throw Error('Edit did not preserve encrypted password');"+
          "edit.clearPassword=true;await api.native('connection.save',edit);if((await api.native('connection.get',{id})).hasPassword)throw Error('Password clear failed');"+
          "scan=await api.native('lan.start');await api.native('lan.stop',{id:scan});const end=Date.now()+12000;while((await api.native('lan.state',{id:scan})).running){if(Date.now()>end)throw Error('Discovery cancellation timed out');await new Promise(r=>setTimeout(r,100));}"+
          "const license=await(await fetch('SMBJ-RPC-LICENSE.txt')).text();if(!license.includes('Rapid7')||!license.includes('BSD-3-clause'))throw Error('Offline RPC notice missing');"+
          "window.__networkQa={pass:true};}catch(e){window.__networkQa={error:String(e)}}finally{if(scan)await api.native('lan.stop',{id:scan}).catch(()=>{});if(id)await api.native('connection.delete',{id}).catch(()=>{});}})();");
        long end=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<end){JSONObject marker=json("window.__networkQa || {}");require(!marker.has("error"),marker.optString("error"));if(marker.optBoolean("pass")){result.putString("pass","true");result.putString("checks","Android RPC codec error, host-only profile, edit identity/password retention, clear password, cancel native discovery, offline RPC notice");finish(Activity.RESULT_OK,result);return;}Thread.sleep(150);}
        throw new Exception("Minified network-profile probe timed out");
    }
    private void networkSmbProbe(Bundle result) throws Exception {
        // adb reverse points this emulator loopback port at the read-only .NET
        // fixture. Never take an arbitrary host or real account from arguments.
        eval("void(async()=>{const ids=[],times=[];const list=async(phase,path)=>{window.__networkSmbQa={phase};const start=Date.now();try{return await api.native('list',{path});}finally{times.push({phase,ms:Date.now()-start});}};try{const profile={type:'smb',name:'QA SMB host',host:'127.0.0.1',port:1445,share:'',username:'qa',password:'qa-pass'};"+
          "const id=await api.native('connection.save',profile);ids.push(id);const root='remote://'+id+'/';const shares=(await list('enumerate',root)).entries;"+
          "const qa=shares.find(e=>e.name==='QA');if(!qa?.isDir||shares.some(e=>e.name==='IPC$'))throw Error('Missing disk share or exposed IPC$: '+JSON.stringify(shares));"+
          "const files=(await list('share',qa.path)).entries;const folder=files.find(e=>e.name==='子目录');if(!folder?.isDir)throw Error('Unicode folder missing');"+
          "if(!(await list('nested',folder.path)).entries.some(e=>e.name==='测试.txt'&&!e.isDir))throw Error('Nested Unicode file missing');"+
          "const pinned=await api.native('connection.save',{...profile,name:'QA pinned share',share:'QA'});ids.push(pinned);if(!(await list('pinned','remote://'+pinned+'/')).entries.some(e=>e.name==='子目录'))throw Error('Pinned-share compatibility failed');"+
          "const denied=await api.native('connection.save',{...profile,name:'QA wrong password',password:'wrong-fixture-password'});ids.push(denied);let rejected=false;try{await list('denied','remote://'+denied+'/');}catch(e){rejected=true;}if(!rejected)throw Error('Authentication failure returned an empty/successful listing');"+
          "if(times.some(t=>t.ms>=8000))throw Error('Loopback browse/logout latency regression');window.__networkSmbQa={pass:true,times};}catch(e){window.__networkSmbQa={error:String(e),times}}finally{for(const id of ids)await api.native('connection.delete',{id}).catch(()=>{});}})();");
        long end=System.currentTimeMillis()+90000,phaseStart=0;String phase="";boolean diagnosed=false;
        while(System.currentTimeMillis()<end){JSONObject marker=json("window.__networkSmbQa || {}");require(!marker.has("error"),marker.toString());if(marker.optBoolean("pass")){result.putString("pass","true");result.putString("timings",marker.optJSONArray("times").toString());result.putString("checks","real SMB2 SRVSVC share enumeration, IPC filtering, nested Unicode folder/file, pinned-share compatibility, wrong-password rejection");finish(Activity.RESULT_OK,result);return;}
            if(!marker.optString("phase").equals(phase)){phase=marker.optString("phase");phaseStart=System.currentTimeMillis();diagnosed=false;Bundle progress=new Bundle();progress.putString("phase",phase);sendStatus(1,progress);}
            if(arguments.getString("diagnose","").equals("true")&&!phase.isEmpty()&&!diagnosed&&System.currentTimeMillis()-phaseStart>8000){diagnosed=true;StringBuilder stacks=new StringBuilder();for(java.util.Map.Entry<Thread,StackTraceElement[]> entry:Thread.getAllStackTraces().entrySet())if(entry.getKey().getName().contains("pool")||entry.getKey().getName().contains("Packet")){stacks.append(entry.getKey().getName()).append('\n');for(int i=0;i<Math.min(12,entry.getValue().length);i++)stacks.append(entry.getValue()[i]).append('\n');}Bundle progress=new Bundle();progress.putString("waiting",phase);progress.putString("stacks",stacks.toString());sendStatus(1,progress);}
            Thread.sleep(150);}
        throw new Exception("Minified live SMB fixture probe timed out");
    }
    private boolean hasVideoFrame() {return hasVideoFrame(false);}
    private boolean hasVideoFrame(boolean blueOnly) {
        android.graphics.Bitmap image=getUiAutomation().takeScreenshot();if(image==null)return false;
        // The testsrc pattern remains saturated beneath Media3's 60%-black
        // control scrim (channel delta about 102); the OS tutorial is below 70.
        int colorful=0,blue=0,total=0;try{for(int y=image.getHeight()/3;y<image.getHeight()*2/3;y+=6)for(int x=image.getWidth()/8;x<image.getWidth()*7/8;x+=6){int c=image.getPixel(x,y),r=android.graphics.Color.red(c),g=android.graphics.Color.green(c),b=android.graphics.Color.blue(c);total++;if(b>80&&r<50&&g<60)blue++;if(Math.max(r,Math.max(g,b))-Math.min(r,Math.min(g,b))>90)colorful++;}}finally{image.recycle();}return blueOnly?blue>total*.65:colorful>150;
    }
    private void dismissSystemFullscreenEducation() {
        android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();if(root==null)return;
        try{for(android.view.accessibility.AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText("Got it"))try{String owner=String.valueOf(node.getPackageName());if((owner.equals("android")||owner.equals("com.android.systemui"))&&String.valueOf(node.getText()).equals("Got it"))node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);}finally{node.recycle();}}finally{root.recycle();}
    }
    private void playbackProbe(String path,String second) throws Exception {
        ActivityMonitor monitor=addMonitor("com.railgunhamster.rhfiles.PlaybackActivity",null,false);
        Activity playerActivity=null;
        try {
            eval("void api.native('media.play',{path:"+JSONObject.quote(path)+",name:'QA video 1',kind:'video',queue:[{path:"+JSONObject.quote(path)+",name:'QA video 1'},{path:"+JSONObject.quote(second)+",name:'QA video 2'}]}).catch(e=>window.__mediaError=String(e))");
            playerActivity=waitForMonitorWithTimeout(monitor,30000);require(playerActivity!=null,"Native player failed to open: "+eval("window.__mediaError"));
            final Activity screen=playerActivity;long until=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<until){dismissSystemFullscreenEducation();if(hasVideoFrame())break;Thread.sleep(250);}
            require(hasVideoFrame(),"No decoded video frame (error page is not playback)");
            int progressId=getTargetContext().getResources().getIdentifier("exo_progress","id",getTargetContext().getPackageName()),nextId=getTargetContext().getResources().getIdentifier("exo_next","id",getTargetContext().getPackageName());
            boolean[] hidden={false};runOnMainSync(()->{View progress=screen.findViewById(progressId);hidden[0]=progress!=null&&!progress.isShown();});require(hidden[0],"Playback controls must start hidden");
            int[] dimensions=new int[2];runOnMainSync(()->{dimensions[0]=screen.getWindow().getDecorView().getWidth();dimensions[1]=screen.getWindow().getDecorView().getHeight();});
            long now=android.os.SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,dimensions[0]/2f,dimensions[1]/2f,0),up=MotionEvent.obtain(now,now+60,MotionEvent.ACTION_UP,dimensions[0]/2f,dimensions[1]/2f,0);down.setSource(InputDevice.SOURCE_TOUCHSCREEN);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try{getUiAutomation().injectInputEvent(down,true);Thread.sleep(60);getUiAutomation().injectInputEvent(up,true);}finally{down.recycle();up.recycle();}Thread.sleep(700);
            boolean[] enabled={false};String[] detail={""};runOnMainSync(()->{View progress=screen.findViewById(progressId),next=screen.findViewById(nextId);detail[0]="focus="+screen.hasWindowFocus()+", progress="+(progress==null?"missing":progress.isShown())+", next="+(next==null?"missing":next.isShown()+"/enabled="+next.isEnabled());enabled[0]=progress!=null&&progress.isShown()&&next!=null&&next.isShown()&&next.isEnabled();if(enabled[0]){progress.requestFocus();progress.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_RIGHT));progress.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DPAD_RIGHT));}});
            if(!enabled[0]){android.graphics.Bitmap shot=getUiAutomation().takeScreenshot();if(shot!=null)try(java.io.FileOutputStream out=new java.io.FileOutputStream("/storage/emulated/0/Download/RHFiles-QA-player-controls.png")){shot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}finally{shot.recycle();}}
            require(enabled[0],"Tap did not reveal seek/next controls: "+detail[0]);
            until=System.currentTimeMillis()+15000;while(!hasVideoFrame()&&System.currentTimeMillis()<until)Thread.sleep(250);require(hasVideoFrame(),"Video seek stopped decoding");runOnMainSync(()->screen.findViewById(nextId).performClick());
            until=System.currentTimeMillis()+15000;while(!String.valueOf(screen.getTitle()).equals("QA video 2")&&System.currentTimeMillis()<until)Thread.sleep(150);require(String.valueOf(screen.getTitle()).equals("QA video 2"),"Next did not change the active queue item");
            // The second fixture is solid blue, unlike the first test pattern.
            // Keeping the previous SurfaceView frame cannot satisfy this check.
            until=System.currentTimeMillis()+15000;while(!hasVideoFrame(true)&&System.currentTimeMillis()<until)Thread.sleep(250);require(hasVideoFrame(true),"Next queue item has no new decoded frame");
        }finally{removeMonitor(monitor);if(playerActivity!=null){final Activity closing=playerActivity;runOnMainSync(closing::finish);waitForIdleSync();}}
    }
    private void mediaProbe(Bundle result) throws Exception {
        eval("void(async()=>{try{const id=await api.native('connection.save',{type:'smb',name:'QA media',host:'127.0.0.1',port:1445,share:'QA',username:'qa',password:'qa-pass'});window.__mediaId=id;const root='remote://'+id+'/';const start=Date.now();for(let i=0;i<4;i++)await api.native('list',{path:root+'子目录'});const ms=Date.now()-start;if(ms>8000)throw Error('Repeated SMB listing stalled: '+ms);"+
          "const image=await api.native('media.image',{path:root+'photo.png',maxEdge:192});if(image.width!==32||image.height!==20||!image.dataUrl.startsWith('data:image/'))throw Error('Native SMB image decode failed');const rotated=await api.native('media.image',{path:root+'photo-rotated.jpg',maxEdge:192});if(rotated.width!==20||rotated.height!==32)throw Error('Remote JPEG orientation ignored');"+
          "const a=await api.native('app.icon',{package:'com.railgunhamster.rhfiles',maxEdge:64}),b=await api.native('app.icon',{package:'com.android.settings',maxEdge:64});if(a.width!==64||a.dataUrl===b.dataUrl)throw Error('App icons are generic/missing');"+
          "if(!(await api.native('roots')).some(r=>r.network&&r.path===root))throw Error('SMB storage root missing');window.__mediaQa={pass:true,ms};}catch(e){window.__mediaQa={error:String(e)}}})();");
        long end=System.currentTimeMillis()+45000;JSONObject marker=new JSONObject();
        while(System.currentTimeMillis()<end){marker=json("window.__mediaQa||{}");require(!marker.has("error"),marker.toString());if(marker.optBoolean("pass"))break;Thread.sleep(150);}require(marker.optBoolean("pass"),"Native media setup timed out");
        try {
            playbackProbe("/storage/emulated/0/Download/RHFiles-Media-QA-1.mp4","/storage/emulated/0/Download/RHFiles-Media-QA-2.mp4");
            String id=new JSONTokener(eval("window.__mediaId")).nextValue().toString();playbackProbe("remote://"+id+"/movie.mp4","remote://"+id+"/movie2.mp4");
            result.putString("pass","true");result.putString("repeatedBrowseMs",String.valueOf(marker.getLong("ms")));result.putString("checks","minified APK: real SMB image decoding, reused folder sessions, network storage roots, distinct package icons; local and SMB decoded video frames, initially hidden controls, tap, seek and next queue item");finish(Activity.RESULT_OK,result);
        }finally{eval("void api.native('connection.delete',{id:window.__mediaId})");}
    }
    private void externalVideoProbe(Bundle result) throws Exception {
        // Change app-ops BEFORE instrumentation: changing it in-process makes
        // Android kill the target. The test APK owns the bounded blue fixture.
        require(!android.os.Environment.isExternalStorageManager(),"Disable all-files app-op before this probe");
        byte[] bytes;try(java.io.InputStream asset=getContext().getAssets().open("external-qa.mp4")){bytes=asset.readAllBytes();}require(bytes.length<=512*1024,"Bounded synthetic fixture required");
        Intent view=new Intent(Intent.ACTION_VIEW).setDataAndType(android.net.Uri.parse("content://qa.provider/video"),"video/mp4");
        boolean found=false;for(android.content.pm.ResolveInfo match:getTargetContext().getPackageManager().queryIntentActivities(view,android.content.pm.PackageManager.MATCH_DEFAULT_ONLY))if(match.activityInfo.name.equals("com.railgunhamster.rhfiles.ExternalPlaybackActivity"))found=true;
        require(found,"RHFiles is absent from the system video Open With candidates");
        ActivityMonitor monitor=addMonitor("com.railgunhamster.rhfiles.PlaybackActivity",null,false);Activity player=null;
        try{
            Intent caller=new Intent().setClassName("com.railgunhamster.rhfiles.test","com.railgunhamster.rhfiles.ExternalVideoTestCaller").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("video",bytes);getContext().startActivity(caller);
            player=waitForMonitorWithTimeout(monitor,30000);require(player!=null,"External video did not enter the native player");
            long until=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<until){dismissSystemFullscreenEducation();if(hasVideoFrame(true))break;Thread.sleep(250);}
            require(hasVideoFrame(true),"External content URI did not decode after caller/router finished (temporary read grant lost)");
            require(player.getIntent().getData().getAuthority().equals("com.railgunhamster.rhfiles.test.media"),"Player lost the original external content URI");capture("external-video");
            result.putString("pass","true");result.putString("checks","system video resolver, separate-UID non-exported provider, temporary read grant forwarding, real decoded blue frame without all-files permission");finish(Activity.RESULT_OK,result);
        }finally{removeMonitor(monitor);if(player!=null){final Activity closing=player;runOnMainSync(closing::finish);}}
    }
    private void configSyncProbe(Bundle result) throws Exception {
        String endpoint=arguments.getString("endpoint","");require(endpoint.matches("http://10\\.0\\.2\\.2:[0-9]+/sync/"),"Emulator loopback fixture required");
        awaitScript("!!document.querySelector('.file-pane:not([hidden])')?.contentWindow.rhfilesPane");
        awaitScript("(()=>{const w=document.querySelector('.file-pane:not([hidden])').contentWindow;return !w.rhfilesPane.snapshot().busy&&!!w.document.querySelector('#home [data-tile=settings]')&&w.document.querySelector('#home').getBoundingClientRect().height>0;})()");
        eval("window.__syncPane=document.querySelector('.file-pane:not([hidden])').contentWindow;void(async()=>{try{const id=await api.native('connection.save',{type:'smb',name:'Local Sync QA',host:'qa.invalid',share:'Public',username:'qa-local',password:'must-stay-local'});window.__syncProfile=id;const favorites=JSON.stringify([{name:'QA folder',path:'remote://'+id+'/folder',isDir:true,label:'QA local alias'},{name:'Local only',path:'/storage/emulated/0/Download',isDir:true}]);__syncPane.localStorage.setItem('rhfiles.favorites',favorites);__syncPane.document.getElementById('nav-settings').click();window.__syncReady=true;}catch(e){window.__syncError=String(e)}})()");
        awaitScript("!!window.__syncReady||!!window.__syncError");require(eval("!window.__syncError").equals("true"),"Sync setup: "+eval("window.__syncError"));
        awaitScript("!__syncPane.document.getElementById('tool-settings').hidden");
        eval("__syncPane.document.querySelector('[data-settings-section=sync]').scrollIntoView({inline:'center'})");tapCss("[data-settings-section=sync]",true);
        awaitScript("!!__syncPane.document.querySelector('#config-sync form')");
        eval("(()=>{const form=__syncPane.document.querySelector('#config-sync form');for(const [key,value] of Object.entries({url:"+JSONObject.quote(endpoint)+",username:'sync-user',password:'qa-sync-password',enabled:false,insecure:true})){const input=form.elements[key];if(input.type==='checkbox')input.checked=value;else input.value=value;}form.dispatchEvent(new __syncPane.Event('input',{bubbles:true}));})()");
        eval("__syncPane.document.querySelector('#config-sync button[type=submit]').scrollIntoView({block:'center'})");tapCss("#config-sync button[type=submit]",true);awaitScript("__syncPane.document.querySelector('#config-sync input[name=password]').value===''");
        eval("__syncPane.document.getElementById('sync-now').scrollIntoView({block:'center'})");tapCss("#sync-now",true);
        awaitScript("__syncPane.document.getElementById('sync-state').textContent.includes('同步完成')");
        require(eval("(()=>{const f=JSON.parse(__syncPane.localStorage.getItem('rhfiles.favorites'));return f.some(e=>e.label==='QA cloud alias')&&f.some(e=>e.path==='/storage/emulated/0/Download')&&!JSON.stringify(__syncPane.localStorage).includes('must-stay-local')&&!JSON.stringify(__syncPane.localStorage).includes('qa-sync-password');})()").equals("true"),"Shared config or local-only data/password isolation failed");
        require(eval("JSON.parse(__syncPane.localStorage.getItem('rhfiles.favorites')).filter(f=>f.path.startsWith('remote://11111111-1111-4111-8111-111111111111/')).map(f=>f.name).join(',')==='Z,A,M'").equals("true"),"Initial cloud bookmark order changed");
        java.net.HttpURLConnection edit=(java.net.HttpURLConnection)new java.net.URL(endpoint.replace("/sync/","/qa-reverse")).openConnection();edit.setRequestMethod("POST");edit.setConnectTimeout(5000);edit.setReadTimeout(5000);try{require(edit.getResponseCode()==204,"Cannot simulate second-device reorder");}finally{edit.disconnect();}
        tapCss("#sync-now",true);awaitScript("__syncPane.document.getElementById('sync-state').textContent.includes('同步完成')&&JSON.parse(__syncPane.localStorage.getItem('rhfiles.favorites')).filter(f=>f.path.startsWith('remote://11111111-1111-4111-8111-111111111111/')).map(f=>f.name).join(',')==='M,A,Z'");
        eval("__syncPane.document.getElementById('btn-menu').click()");awaitScript("!__syncPane.document.getElementById('drawer').hidden");
        require(eval("[...__syncPane.document.querySelectorAll('#nav-favorites .favorite-location>button:first-child')].map(b=>b.textContent.trim()).filter(s=>['M','A','QA cloud alias'].includes(s)).join('|')==='M|A|QA cloud alias'").equals("true"),"Drawer did not display the synchronized bookmark order");
        require(eval("(()=>{const b=__syncPane.document.querySelector('.favorite-more'),s=__syncPane.getComputedStyle(b);return b.classList.contains('icon-btn')&&s.borderTopWidth==='0px'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&Math.round(b.getBoundingClientRect().height)===44;})()").equals("true"),"Quick Access overflow is not the shared unframed icon button");
        screenshot("quick-access");eval("__syncPane.rhfilesHandleBack()");
        eval("__syncPane.document.getElementById('sync-state').scrollIntoView({block:'center'})");screenshot("webdav-sync");eval("void api.native('sync.status').then(s=>window.__syncFinal=s)");awaitScript("!!window.__syncFinal");require(json("window.__syncFinal").getLong("lastSuccess")>0,"Native sync did not commit");
        eval("void(async()=>{const s=await api.native('sync.status');await api.native('sync.save',{...s.config,enabled:false});})();");
        eval("void(async()=>{try{const id='11111111-1111-4111-8111-111111111111',c=await api.native('connection.get',{id});if(!c.needsPassword||c.hasPassword||'password' in c)throw Error('Missing-secret state absent or password disclosed');try{await api.native('list',{path:'remote://'+id+'/'});throw Error('Missing-secret profile attempted network access');}catch(e){if(!String(e).includes('补填密码'))throw e;}window.__credentialReady=true;}catch(e){window.__credentialError=String(e)}})()");
        awaitScript("window.__credentialReady||!!window.__credentialError");require(eval("!window.__credentialError").equals("true"),"Synced credentials: "+eval("window.__credentialError"));
        eval("__syncPane.document.getElementById('btn-menu').click()");awaitScript("!__syncPane.document.getElementById('drawer').hidden");
        eval("[...__syncPane.document.querySelectorAll('#nav-favorites .favorite-location>button:first-child')].find(b=>b.textContent.trim()==='M').click()");awaitScript("!!__syncPane.document.querySelector('.credential-notice')");screenshot("missing-password");
        require(eval("__syncPane.document.querySelector('.feature-form input[name=password]').value===''").equals("true"),"Credential prompt prefilled a secret");eval("__syncPane.rhfilesHandleBack()");awaitScript("__syncPane.document.getElementById('placeholder').textContent.includes('待补填密码')");
        result.putString("pass","true");result.putString("checks","real WebDAV conditional GET/PUT, minified encryption, initial and second-device bookmark order, unframed drawer overflow, local-only preservation, password isolation");finish(Activity.RESULT_OK,result);
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
    private void releaseProbe(Bundle result,String source) throws Exception {
        String expected=arguments.getString("expect","available"),version=arguments.getString("version",""),proxy=arguments.getString("proxy","");
        require(expected.equals("available")||expected.equals("latest"),"Unexpected public-release probe state");
        eval("void(async()=>{try{const end=Date.now()+60000;while(true){await api.native('update.cancel');try{"+
          "await api.native('update.save',{source:"+JSONObject.quote(source)+",gitee:'https://gitee.com/railgunhamster/RHFiles',github:'https://github.com/RailgunHamster/RHFiles',family:'smb://SERVER-HOME/Public/Software/RHFiles-Releases',connectionId:'',autoCheck:false,proxyEnabled:"+(!proxy.isEmpty())+",proxy:"+JSONObject.quote(proxy)+"});break;}catch(e){if(Date.now()>end)throw e;await new Promise(r=>setTimeout(r,200));}}"+
          "await api.native('update.check',{manual:true,reason:'release-github-probe'});window.__githubQa={started:true};}catch(e){window.__githubQa={error:String(e)}}})();");
        long end=System.currentTimeMillis()+180000;JSONObject status=new JSONObject();
        while(System.currentTimeMillis()<end){JSONObject marker=json("window.__githubQa || {}");require(!marker.has("error"),marker.optString("error"));
            if(marker.optBoolean("started")){eval("void api.native('update.status').then(s=>window.__githubStatus=s)");Thread.sleep(150);status=json("window.__githubStatus || {}");String state=status.optString("state");if(!state.isEmpty()&&!state.equals("checking"))break;}Thread.sleep(200);}
        require(status.optString("state").equals(expected),source+" update state: "+status);
        result.putString("source",source);
        result.putString("state",status.getString("state"));
        if(expected.equals("available")){
            JSONObject release=status.getJSONObject("release");require(version.equals(release.getString("version")),"Unexpected version: "+release);result.putString("version",release.getString("version"));
            eval("void api.native('update.download').catch(e=>window.__githubDownloadError=String(e))");end=System.currentTimeMillis()+180000;
            while(System.currentTimeMillis()<end){eval("void api.native('update.status').then(s=>window.__githubStatus=s)");Thread.sleep(250);status=json("window.__githubStatus || {}");if(status.optString("state").equals("ready")||status.optString("state").equals("failed"))break;Thread.sleep(250);}
            require(status.optString("state").equals("ready"),"APK download/verification failed: "+status);require(status.getLong("bytes")==release.getLong("size"),"APK byte count mismatch");result.putString("downloadState","ready");result.putString("bytes",String.valueOf(status.getLong("bytes")));
        }
        result.putString("pass","true");finish(Activity.RESULT_OK,result);
    }
    private void attributionProbe(Bundle result) throws Exception {
        awaitScript("!!document.querySelector('.file-pane:not([hidden])')?.contentWindow?.rhfilesPane");
        eval("window.__licenseFrame=document.querySelector('.file-pane:not([hidden])').contentWindow;__licenseFrame.document.getElementById('nav-settings').click()");
        awaitScript("!__licenseFrame.document.getElementById('tool-settings').hidden");
        eval("__licenseFrame.document.querySelector('[data-settings-section=about]').click();__licenseFrame.document.getElementById('project-license').open=true");
        awaitScript("__licenseFrame.document.getElementById('project-license-text').textContent.includes('END OF TERMS AND CONDITIONS')");
        require(eval("__licenseFrame.document.getElementById('project-notice-text').textContent.includes('RailgunHamster')").equals("true"),"APK attribution is missing");
        screenshot("licenses");result.putString("license","Apache-2.0");result.putString("attribution","RHFiles / RailgunHamster");result.putString("pass","true");finish(Activity.RESULT_OK,result);
    }
    private void awaitScript(String script) throws Exception {
        long end=System.currentTimeMillis()+45000;
        while(!eval(script).equals("true")){
            if(System.currentTimeMillis()>=end)throw new Exception("UI condition timed out: "+script+"; "+eval("JSON.stringify([...document.querySelectorAll('.file-pane:not([hidden])')].map(f=>({route:f.contentWindow.rhfilesPane?.snapshot(),settingsHidden:f.contentDocument.getElementById('tool-settings')?.hidden,syncTabHidden:f.contentDocument.querySelector('[data-settings-section=sync]')?.hidden,toast:f.contentDocument.getElementById('toast')?.textContent})))"));
            Thread.sleep(150);
        }
    }
    private void tapCss(String selector) throws Exception {
        tapCss(selector,false);
    }
    private void tapCss(String selector,boolean inPane) throws Exception {
        awaitScript("(()=>{const f="+(inPane?"document.querySelector('.file-pane:not([hidden])')":"null")+",n=(f?f.contentDocument:document).querySelector("+JSONObject.quote(selector)+");return !!n&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;})()");
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
        capture(name);
    }
    private void capture(String name) throws Exception {
        android.graphics.Bitmap image=getUiAutomation().takeScreenshot();require(image!=null,"Screenshot unavailable");
        try(java.io.FileOutputStream stream=new java.io.FileOutputStream("/storage/emulated/0/Download/RHFiles-Release-QA-phone-"+name+".png")){image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream);}finally{image.recycle();}
    }
    private void gestureCss(String selector,float dxFraction,long hold) throws Exception {
        JSONObject point=json("(()=>{const f=document.querySelector('.file-pane:not([hidden])'),n=f.contentDocument.querySelector("+JSONObject.quote(selector)+");if(!n)throw Error('Missing gesture target');const r=n.getBoundingClientRect(),o=f.getBoundingClientRect();return{x:o.x+r.x+r.width*.45,y:o.y+r.y+Math.min(24,r.height/2),width:innerWidth,travel:r.width*"+dxFraction+"};})()");
        int[] offset=new int[2],width=new int[1];runOnMainSync(()->{WebView web=find(activity.getWindow().getDecorView());web.getLocationOnScreen(offset);width[0]=web.getWidth();});
        float scale=(float)(width[0]/point.getDouble("width")),x=offset[0]+(float)point.getDouble("x")*scale,y=offset[1]+(float)point.getDouble("y")*scale,dx=(float)point.getDouble("travel")*scale;
        long down=android.os.SystemClock.uptimeMillis();injectContacts(down,MotionEvent.ACTION_DOWN,new int[]{0},new float[][]{{x,y}});Thread.sleep(hold);
        if(dx!=0)for(int i=1;i<=12;i++){injectContacts(down,MotionEvent.ACTION_MOVE,new int[]{0},new float[][]{{x+dx*i/12,y}});Thread.sleep(25);}
        injectContacts(down,MotionEvent.ACTION_UP,new int[]{0},new float[][]{{x+dx,y}});Thread.sleep(300);
    }
    private void wallpaperProbe(Bundle result) throws Exception {
        java.io.File file=new java.io.File("/storage/emulated/0/Download/RHFiles-wallpaper-QA.png");
        android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(32,24,android.graphics.Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.BLUE);
        try(java.io.FileOutputStream output=new java.io.FileOutputStream(file)){require(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output),"Fixture encoding failed");}finally{bitmap.recycle();}
        android.content.IntentFilter filter=new android.content.IntentFilter("android.service.wallpaper.CROP_AND_SET_WALLPAPER");filter.addDataScheme("content");filter.addDataType("image/*");
        // Intercept before launch, so this test can never change the wallpaper.
        ActivityMonitor monitor=addMonitor(filter,new ActivityResult(Activity.RESULT_CANCELED,null),true);
        try{
            eval("void api.native('image.wallpaper',{path:"+JSONObject.quote(file.getPath())+"}).then(()=>window.__wallpaperQa={pass:true}).catch(e=>window.__wallpaperQa={error:String(e)})");
            awaitScript("!!window.__wallpaperQa");require(!json("window.__wallpaperQa").has("error"),eval("window.__wallpaperQa.error"));require(monitor.getHits()==1,"System wallpaper intent was not launched exactly once");
            result.putString("pass","true");result.putString("checks","minified APK image snapshot, FileProvider MIME resolution, standard system crop handoff intercepted before launch; wallpaper unchanged");finish(Activity.RESULT_OK,result);
        }finally{removeMonitor(monitor);file.delete();}
    }
    private void fileGesturesProbe(Bundle result) throws Exception {
        awaitScript("!!window.RHFilesWorkbench&&!!document.querySelector('.file-pane')?.contentWindow.rhfilesPane");
        eval("window.RHFilesWorkbench.openLayout(document.querySelector('.file-pane').contentWindow);document.querySelector('[data-layout=single]').click();window.__qa=document.querySelector('.file-pane:not([hidden])').contentWindow;void(async()=>{try{const list=await api.raw('list_dir',{path:'/storage/emulated/0/Download'});if(!list.entries.some(e=>e.name==='RHFiles-018-QA.txt'))await api.raw('create_file',{parent:'/storage/emulated/0/Download',name:'RHFiles-018-QA.txt'});__qa.document.getElementById('nav-home').click();window.__fixtureReady=true;}catch(e){window.__fixtureError=String(e)}})()");
        awaitScript("!!window.__fixtureReady||!!window.__fixtureError");require(eval("!window.__fixtureError").equals("true"),"Fixture creation failed: "+eval("window.__fixtureError"));
        awaitScript("__qa.rhfilesPane.snapshot().route.screen==='home'&&!__qa.rhfilesPane.snapshot().busy&&__qa.document.querySelector('[data-tile=downloads]')?.getBoundingClientRect().height>0");tapCss("[data-tile=downloads]",true);
        String row="[data-path='/storage/emulated/0/Download/RHFiles-018-QA.txt']";
        awaitScript("!!__qa.document.querySelector("+JSONObject.quote(row)+")");eval("__qa.document.querySelector("+JSONObject.quote(row)+").scrollIntoView({block:'center'})");Thread.sleep(250);
        tapCss(row+" .entry-more",true);String menu=eval("[...__qa.document.querySelectorAll('#sheet .sheet-item')].map(n=>n.textContent).join('|')");eval("__qa.rhfilesHandleBack()");
        gestureCss(row,0,650);require(eval("__qa.document.getElementById('sheet').hidden&&__qa.document.getElementById('sel-count').textContent==='已选择 1 项'").equals("true"),"Long press did not enter selection directly");
        tapCss("[data-action=more]",true);String selected=eval("[...__qa.document.querySelectorAll('#sheet .sheet-item'),...__qa.document.querySelectorAll('#selection-bar button')].map(n=>n.textContent.trim()).join('|')");for(String label:((String)new JSONTokener(menu).nextValue()).split("\\|"))if(!label.equals("选择")&&!label.equals("取消选择"))require(((String)new JSONTokener(selected).nextValue()).contains(label),"Selection dropped file operation: "+label);eval("__qa.rhfilesHandleBack();__qa.document.getElementById('sel-close').click()");
        gestureCss(row,-.4f,30);require(eval("__qa.document.querySelector("+JSONObject.quote(row)+").dataset.swipeOpen==='true'").equals("true"),"Real MotionEvent swipe did not reveal Delete");
        tapCss(row+" .entry-delete",true);require(eval("__qa.document.getElementById('sheet-panel').textContent.includes('移入回收站')").equals("true"),"Swipe Delete bypassed existing trash confirmation");eval("__qa.rhfilesHandleBack()");screenshot("file-swipe");
        eval("__qa.document.getElementById('nav-settings').click()");awaitScript("!__qa.document.getElementById('tool-settings').hidden");eval("__qa.document.querySelector('.settings-nav').scrollLeft=9999");Thread.sleep(250);
        int before=json("({x:__qa.document.querySelector('.settings-nav').scrollLeft})").getInt("x");gestureCss(".settings-nav",.4f,30);
        require(eval("__qa.document.getElementById('drawer').hidden&&__qa.document.querySelector('.settings-nav').scrollLeft<"+before).equals("true"),"Settings pan opened drawer or failed to scroll tabs");
        eval("__qa.document.querySelector('[data-settings-section=updates]').click()");awaitScript("__qa.document.querySelectorAll('#app-changelog details').length===1&&!!__qa.document.getElementById('update-history')");require(eval("__qa.document.getElementById('app-changelog').textContent.includes('0.1.20')").equals("true"),"Installed latest notes missing from minified APK");screenshot("installed-history");
        eval("__qa.document.getElementById('update-history').click()");awaitScript("__qa.document.querySelectorAll('.release-history details').length>10");eval("__qa.rhfilesHandleBack()");
        eval("void api.raw('delete_entries',{paths:['/storage/emulated/0/Download/RHFiles-018-QA.txt'],permanent:true})");
        result.putString("pass","true");result.putString("checks","real MotionEvent long-press selection without popup, selected operation parity, swipe Delete, settings tab scrolling and bundled history");finish(Activity.RESULT_OK,result);
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
    private void injectContacts(long down,int action,int[] ids,float[][] xy) throws Exception {
        MotionEvent.PointerProperties[] properties=new MotionEvent.PointerProperties[ids.length];MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[ids.length];
        for(int i=0;i<ids.length;i++){properties[i]=new MotionEvent.PointerProperties();properties[i].id=ids[i];properties[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coords[i]=new MotionEvent.PointerCoords();coords[i].x=xy[i][0];coords[i].y=xy[i][1];coords[i].pressure=1;coords[i].size=1;}
        MotionEvent event=MotionEvent.obtain(down,android.os.SystemClock.uptimeMillis(),action,ids.length,properties,coords,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
        try{require(getUiAutomation().injectInputEvent(event,true),"Concurrent touch injection rejected");}finally{event.recycle();}
    }
    private void concurrentPanesProbe(Bundle result) throws Exception {
        awaitScript("!!window.RHFilesWorkbench&&!!document.querySelector('.file-pane')?.contentWindow.rhfilesPane");
        java.io.File folder=new java.io.File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),"000-RHFiles-PaneTouch-QA");require(folder.isDirectory()||folder.mkdirs(),"QA folder unavailable");
        for(int i=0;i<250;i++)new java.io.File(folder,String.format(java.util.Locale.ROOT,"file-%03d.txt",i)).createNewFile();
        eval("window.RHFilesWorkbench.openLayout(document.querySelector('.file-pane').contentWindow);document.querySelector('[data-layout=columns]').click()");
        awaitScript("document.querySelectorAll('.file-pane').length===2&&[...document.querySelectorAll('.file-pane')].every(f=>!!f.contentWindow.rhfilesPane)");
        for(int i=0;i<2;i++){
            eval("document.querySelectorAll('.file-pane')["+i+"].contentDocument.getElementById('nav-home').click()");
            awaitScript("!!document.querySelectorAll('.file-pane')["+i+"].contentDocument.querySelector('[data-tile=downloads]')");
            eval("document.querySelectorAll('.file-pane')["+i+"].contentDocument.querySelector('[data-tile=downloads]').click()");
            awaitScript("!!document.querySelectorAll('.file-pane')["+i+"].contentDocument.querySelector('[data-path$=\"000-RHFiles-PaneTouch-QA\"]')");
            eval("document.querySelectorAll('.file-pane')["+i+"].contentDocument.querySelector('[data-path$=\"000-RHFiles-PaneTouch-QA\"]').click()");
            awaitScript("document.querySelectorAll('.file-pane')["+i+"].contentWindow.rhfilesPane.snapshot().route.path?.endsWith('000-RHFiles-PaneTouch-QA')&&!document.querySelectorAll('.file-pane')["+i+"].contentWindow.rhfilesPane.snapshot().busy");
        }
        requireCenteredDivider();require(eval("document.querySelector('.pane-divider').getBoundingClientRect().width===8").equals("true"),"Divider must occupy only 8 CSS pixels");
        JSONObject geometry=json("({width:innerWidth,points:[...document.querySelectorAll('.file-pane')].map(f=>{const a=f.getBoundingClientRect(),b=f.contentDocument.getElementById('filelist').getBoundingClientRect();return{x:a.x+b.x+b.width*.5,y:a.y+b.y+b.height*.7}})})");
        int[] offset=new int[2],width=new int[1];runOnMainSync(()->{WebView web=find(activity.getWindow().getDecorView());web.getLocationOnScreen(offset);width[0]=web.getWidth();});float scale=(float)(width[0]/geometry.getDouble("width"));float[][] xy=new float[2][2];
        for(int i=0;i<2;i++){JSONObject p=geometry.getJSONArray("points").getJSONObject(i);xy[i][0]=offset[0]+(float)p.getDouble("x")*scale;xy[i][1]=offset[1]+(float)p.getDouble("y")*scale;}
        long down=android.os.SystemClock.uptimeMillis();injectContacts(down,MotionEvent.ACTION_DOWN,new int[]{0},new float[][]{xy[0]});injectContacts(down,MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),new int[]{0,1},xy);
        for(int step=0;step<14;step++){for(float[] p:xy)p[1]-=12*scale;injectContacts(down,MotionEvent.ACTION_MOVE,new int[]{0,1},xy);Thread.sleep(16);}
        awaitScript("[...document.querySelectorAll('.file-pane')].every(f=>f.contentDocument.getElementById('filelist').scrollTop>80)");
        injectContacts(down,MotionEvent.ACTION_POINTER_UP,new int[]{0,1},xy);double before=json("({top:document.querySelectorAll('.file-pane')[1].contentDocument.getElementById('filelist').scrollTop})").getDouble("top");
        for(int i=0;i<5;i++){xy[1][1]-=10*scale;injectContacts(down,MotionEvent.ACTION_MOVE,new int[]{1},new float[][]{xy[1]});Thread.sleep(16);}injectContacts(down,MotionEvent.ACTION_UP,new int[]{1},new float[][]{xy[1]});
        require(json("({top:document.querySelectorAll('.file-pane')[1].contentDocument.getElementById('filelist').scrollTop})").getDouble("top")>before+20,"Second pane must keep scrolling after the first contact is lifted");
        require(eval("[...document.querySelectorAll('.file-pane')].every(f=>f.contentDocument.getElementById('sel-count').textContent==='已选择 0 项')").equals("true"),"Concurrent scrolling must not enter selection");
        screenshot("concurrent-panes");result.putString("pass","true");result.putString("gestures","real two-contact simultaneous scroll; lift first and continue second; no selection; 8px divider");finish(Activity.RESULT_OK,result);
    }
    private android.view.accessibility.AccessibilityNodeInfo textNode(android.view.accessibility.AccessibilityNodeInfo node,String text){
        if(node==null)return null;if(text.contentEquals(node.getText()==null?"":node.getText()))return android.view.accessibility.AccessibilityNodeInfo.obtain(node);
        for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo child=node.getChild(i),found=textNode(child,text);if(child!=null)child.recycle();if(found!=null)return found;}return null;
    }
    private void clickText(String text) throws Exception {
        long end=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<end){android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow(),node=textNode(root,text);if(root!=null)root.recycle();if(node!=null){try{require(node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK),"Click failed: "+text);return;}finally{node.recycle();}}Thread.sleep(150);}throw new Exception("Missing dialog: "+text);
    }
    private void editNodes(android.view.accessibility.AccessibilityNodeInfo node,java.util.List<android.view.accessibility.AccessibilityNodeInfo> out){if(node==null)return;if("android.widget.EditText".contentEquals(node.getClassName()))out.add(android.view.accessibility.AccessibilityNodeInfo.obtain(node));for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo child=node.getChild(i);editNodes(child,out);if(child!=null)child.recycle();}}
    private void password(String title,String value,int count) throws Exception {
        long end=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<end){android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow(),heading=textNode(root,title);java.util.List<android.view.accessibility.AccessibilityNodeInfo> fields=new java.util.ArrayList<>();editNodes(root,fields);if(root!=null)root.recycle();boolean ready=heading!=null&&fields.size()==count;if(heading!=null)heading.recycle();
            if(ready){for(android.view.accessibility.AccessibilityNodeInfo field:fields){Bundle args=new Bundle();args.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,value);require(field.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,args),"Unable to fill QA password");field.recycle();}clickText("继续");return;}for(android.view.accessibility.AccessibilityNodeInfo field:fields)field.recycle();Thread.sleep(150);
        }throw new Exception("Missing password dialog: "+title);
    }
    private ActivityMonitor documentMonitor(String action,android.net.Uri uri) throws Exception {
        android.content.IntentFilter filter=new android.content.IntentFilter(action);filter.addCategory(Intent.CATEGORY_OPENABLE);filter.addDataType("*/*");return addMonitor(filter,new ActivityResult(Activity.RESULT_OK,new Intent().setData(uri)),true);
    }
    private void backupProbe(Bundle result) throws Exception {
        awaitScript("!!window.RHFilesWorkbench&&!!document.querySelector('.file-pane')?.contentWindow.rhfilesPane");
        eval("void api.native('update.cancel')");awaitScript("(()=>{void api.native('update.status').then(s=>window.__qaUpdate=s);return !!window.__qaUpdate&&window.__qaUpdate.state!=='checking';})()");
        eval("void(async()=>{try{const id=await api.native('connection.save',{type:'smb',name:'RHFiles Backup QA',host:'qa-server',share:'Share',username:'qa',password:'fixture-secret'});window.__qaProfile=id;await api.native('update.save',{source:'family',github:'https://github.com/RailgunHamster/RHFiles',family:'\\\\\\\\qa-server\\\\Share',connectionId:id,autoCheck:false,proxyEnabled:true,proxy:'http://127.0.0.1:7890'});localStorage.setItem('rhfiles.theme','dark');localStorage.setItem('rhfiles.panes','rows');localStorage.setItem('rhfiles.view','grid');window.__backupReady=true;}catch(e){window.__backupError=String(e)}})()");
        awaitScript("window.__backupReady||!!window.__backupError");require(eval("!window.__backupError").equals("true"),"Backup setup failed: "+eval("window.__backupError"));String profile=new JSONTokener(eval("window.__qaProfile")).nextValue().toString();
        android.content.ContentValues values=new android.content.ContentValues();values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,"RHFiles-Backup-QA-"+System.currentTimeMillis()+".rhconfig");values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"application/octet-stream");values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,android.os.Environment.DIRECTORY_DOWNLOADS);
        android.net.Uri uri=getTargetContext().getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);require(uri!=null,"QA backup URI unavailable");ActivityMonitor save=documentMonitor(Intent.ACTION_CREATE_DOCUMENT,uri);
        eval("void api.native('config.export.pick',{web:settingsData.snapshot(localStorage)}).then(r=>window.__backupSaved=r).catch(e=>window.__backupError=String(e))");password("加密导出配置","RHFiles-QA-Backup1",2);awaitScript("window.__backupSaved?.saved||!!window.__backupError");require(eval("window.__backupSaved?.saved===true").equals("true"),"Export failed: "+eval("window.__backupError"));require(save.getHits()==1,"Export did not request a system document");removeMonitor(save);
        byte[] bytes;try(java.io.InputStream input=getTargetContext().getContentResolver().openInputStream(uri)){java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))>=0)output.write(buffer,0,n);bytes=output.toByteArray();}String envelope=new String(bytes,java.nio.charset.StandardCharsets.UTF_8);require(envelope.contains("AES-256-GCM")&&!envelope.contains("fixture-secret")&&!envelope.contains("qa-server"),"Backup contains plaintext credentials/configuration");
        eval("void api.native('connection.delete',{id:window.__qaProfile}).then(()=>{localStorage.setItem('rhfiles.theme','light');window.__backupChanged=true})");awaitScript("window.__backupChanged===true");
        for(boolean correct:new boolean[]{false,true}){
            ActivityMonitor open=documentMonitor(Intent.ACTION_OPEN_DOCUMENT,uri);eval("window.__backupError=null;void api.native('config.import.pick',{web:settingsData.snapshot(localStorage)}).then(r=>window.__backupApplied=r).catch(e=>window.__backupError=String(e))");password("解密配置备份",correct?"RHFiles-QA-Backup1":"RHFiles-QA-WrongPass",1);
            if(!correct){awaitScript("!!window.__backupError");require(eval("window.__backupError.includes('密码')&&localStorage.getItem('rhfiles.theme')==='light'").equals("true"),"Wrong password changed settings or lacked useful error");}
            else{clickText("导入");awaitScript("window.__backupApplied?.applied||!!window.__backupError");require(eval("window.__backupApplied?.applied===true").equals("true"),"Import failed: "+eval("window.__backupError"));}
            require(open.getHits()==1,"Import did not request a system document");removeMonitor(open);
        }
        eval("location.reload()");awaitScript("!!window.RHFilesWorkbench&&document.documentElement.dataset.theme==='dark'&&document.getElementById('workbench').dataset.mode==='rows'&&!!document.querySelector('.file-pane').contentWindow.rhfilesPane");
        eval("void Promise.all([api.native('connections'),api.native('update.status'),api.native('config.pending')]).then(v=>window.__restored=v)");awaitScript("!!window.__restored");
        require(eval("window.__restored[0].some(p=>p.id==="+JSONObject.quote(profile)+")&&window.__restored[1].config.source==='family'&&window.__restored[1].config.proxyEnabled&&window.__restored[2]===null&&localStorage.getItem('rhfiles.view')==='grid'").equals("true"),"Full settings/connection identity not restored or unacknowledged");
        eval("document.querySelector('.file-pane').contentDocument.getElementById('nav-settings').click()");awaitScript("!document.querySelector('.file-pane').contentDocument.getElementById('tool-settings').hidden");eval("document.querySelector('.file-pane').contentDocument.querySelector('[data-settings-section=backup]').click()");
        awaitScript("!document.querySelector('.file-pane').contentDocument.querySelector('[data-settings-panel=backup]').hidden");screenshot("config-backup");result.putString("pass","true");result.putString("backup","native password dialogs; SAF intent monitors with real Downloads provider; encryption; wrong password; import confirmation; full settings and stable connection ID; frontend acknowledgement");finish(Activity.RESULT_OK,result);
    }
    private void usageProbe(Bundle result) throws Exception {
        String existing=arguments.getString("usageRoot","");boolean reuse=!existing.isEmpty();
        java.io.File root=new java.io.File(reuse?existing:"/storage/emulated/0/Download/RHFiles-Usage-QA-"+System.currentTimeMillis());require(root.getCanonicalPath().startsWith("/storage/emulated/0/Download/RHFiles-Usage-QA-"),"Owned synthetic fixture required");
        java.io.File photos=new java.io.File(root,"照片"),empty=new java.io.File(root,"空文件夹");
        if(!reuse){require(root.mkdirs()&&photos.mkdir()&&empty.mkdir(),"Cannot create owned QA folder");
          try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(root,"电影.mp4"))){out.write(new byte[1024*1024]);}
          for(int i=0;i<1000;i++)try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(photos,"图片-"+i+".jpg"))){out.write(new byte[17]);}
        }else require(photos.list()!=null&&photos.list().length==1000&&new java.io.File(root,"电影.mp4").length()==1048576,"Synthetic fixture is incomplete");
        eval("void(async()=>{try{window.__usageReport=await api.native('analysis.start',{root:"+JSONObject.quote(root.getPath())+",owner:'first'});}catch(e){window.__usageError=String(e)}})()");awaitScript("!!window.__usageReport||!!window.__usageError");require(eval("!window.__usageError").equals("true"),"Start analysis: "+eval("window.__usageError"));
        String id=json("window.__usageReport").getString("id");long end=System.currentTimeMillis()+45000;JSONObject status=new JSONObject();int previous=-1;
        while(System.currentTimeMillis()<end){eval("void api.native('analysis.status',{id:"+JSONObject.quote(id)+"}).then(s=>window.__usageStatus=s)");Thread.sleep(100);status=json("window.__usageStatus||{}");if(!status.isNull("percent")){int percent=status.optInt("percent",-1);require(percent>=previous,"Progress went backward");previous=percent;}if(status.optBoolean("ready")||status.optString("state").equals("failed"))break;}
        require(status.optString("state").equals("completed"),"Analysis not completed: "+status);require(status.getInt("percent")==100,"Final progress missing");
        eval("void api.native('analysis.page',{id:"+JSONObject.quote(id)+",view:'folders',parentId:1,limit:100}).then(p=>window.__usagePage=p)");awaitScript("!!window.__usagePage");JSONObject page=json("window.__usagePage"),summary=page.getJSONObject("root");
        require(summary.getLong("size")==1048576+17000&&summary.getLong("files")==1001&&summary.getLong("directories")==2,"Incorrect totals: "+summary);
        require(page.getJSONArray("entries").getJSONObject(0).getString("name").equals("电影.mp4"),"Children not sorted by size");
        long photosId=page.getJSONArray("entries").getJSONObject(1).getLong("id");
        eval("void api.native('analysis.page',{id:"+JSONObject.quote(id)+",view:'folders',parentId:"+photosId+",limit:100}).then(p=>window.__usageChild=p)");awaitScript("!!window.__usageChild");JSONObject child=json("window.__usageChild");require(child.getJSONArray("entries").length()==100&&child.getBoolean("hasMore")&&child.getJSONArray("breadcrumbs").length()==2,"Pagination/tree scope incorrect");
        eval("void api.native('analysis.page',{id:"+JSONObject.quote(id)+",view:'types',parentId:1}).then(p=>window.__usageTypes=p)");awaitScript("!!window.__usageTypes");require(json("window.__usageTypes").getJSONArray("groups").length()==2,"Type grouping incorrect");
        awaitScript("!!document.querySelector('.file-pane:not([hidden])')?.contentWindow.rhfilesPane");
        eval("window.__usagePane=document.querySelector('.file-pane:not([hidden])').contentWindow;__usagePane.document.getElementById('nav-home').click()");awaitScript("!__usagePane.document.getElementById('home').hidden");
        // Use actual navigation/menu handlers; do not bypass the release CSP
        // with eval in the child frame (unsafe-eval is intentionally disabled).
        eval("__usagePane.document.querySelector('[data-tile=downloads]').click()");
        awaitScript("!![...__usagePane.document.querySelectorAll('#filelist [data-path]')].find(n=>n.dataset.path==="+JSONObject.quote(root.getPath())+")");
        eval("[...__usagePane.document.querySelectorAll('#filelist [data-path]')].find(n=>n.dataset.path==="+JSONObject.quote(root.getPath())+").querySelector('.entry-content').click()");
        awaitScript("__usagePane.rhfilesPane.snapshot().route.path==="+JSONObject.quote(root.getPath())+"&&!__usagePane.rhfilesPane.snapshot().busy");
        eval("__usagePane.document.getElementById('btn-overflow').click()");awaitScript("[...__usagePane.document.querySelectorAll('#sheet button')].some(b=>b.textContent.trim()==='分析当前文件夹')");
        eval("[...__usagePane.document.querySelectorAll('#sheet button')].find(b=>b.textContent.trim()==='分析当前文件夹').click()");awaitScript("!!__usagePane.document.querySelector('.usage-metrics')");
        require(eval("__usagePane.document.querySelector('.usage-metrics').textContent.includes('1,001')").equals("true"),"Native report not rendered in frontend");screenshot("usage-report");
        eval("void(async()=>{try{const second=await api.native('analysis.start',{root:"+JSONObject.quote(root.getPath())+",owner:'second'});await api.native('analysis.cancel',{id:second.id});window.__usageCanceled=second.id;}catch(e){window.__usageError=String(e)}})()");awaitScript("!!window.__usageCanceled||!!window.__usageError");require(eval("!window.__usageError").equals("true"),"Second pane scan: "+eval("window.__usageError"));
        result.putString("pass","true");result.putString("checks","minified APK, real filesystem 1001 files, disk-backed tree, exact totals, monotonic percentage, 100-row pagination, types, WebView report, independent second-pane cancellation");finish(Activity.RESULT_OK,result);
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
            if(arguments.getString("mode","").equals("github")){releaseProbe(result,"github");return;}
            if(arguments.getString("mode","").equals("gitee")){releaseProbe(result,"gitee");return;}
            if(arguments.getString("mode","").equals("attribution")){attributionProbe(result);return;}
            if(arguments.getString("mode","").equals("panes")){panesProbe(result);return;}
            if(arguments.getString("mode","").equals("concurrent-panes")){concurrentPanesProbe(result);return;}
            if(arguments.getString("mode","").equals("backup")){backupProbe(result);return;}
            if(arguments.getString("mode","").equals("network-profile")){networkProfileProbe(result);return;}
            if(arguments.getString("mode","").equals("network-smb")){networkSmbProbe(result);return;}
            if(arguments.getString("mode","").equals("media")){mediaProbe(result);return;}
            if(arguments.getString("mode","").equals("file-gestures")){fileGesturesProbe(result);return;}
            if(arguments.getString("mode","").equals("wallpaper")){wallpaperProbe(result);return;}
            if(arguments.getString("mode","").equals("external-video")){externalVideoProbe(result);return;}
            if(arguments.getString("mode","").equals("config-sync")){configSyncProbe(result);return;}
            if(arguments.getString("mode","").equals("usage")){usageProbe(result);return;}
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
