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
    @Override public void onStart() {
        Bundle result=new Bundle();
        try {
            require(android.os.Build.FINGERPRINT.contains("generic") || android.os.Build.MODEL.contains("sdk"),"Emulator required");
            Intent intent=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);activity=startActivitySync(intent);
            long deadline=System.currentTimeMillis()+60000;
            while(!eval("typeof api!=='undefined' && !!window.rhfilesHandleBack").equals("true")){require(System.currentTimeMillis()<deadline,"Frontend not ready");Thread.sleep(150);}
            eval("void(async()=>{try{const id=await api.native('connection.save',{type:'smb',name:'QA loopback fixture',host:'127.0.0.1',port:1445,share:'QA',username:'qa',password:'qa-pass',domain:''});"+
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
        }catch(Throwable error){result.putString("pass","false");result.putString("error",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,result);}
    }
}
