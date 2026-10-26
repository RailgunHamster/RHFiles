package com.railgunhamster.rhfiles;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.util.concurrent.*;

/** Own-emulator bootstrap only. The host calls shipped, enumerable APIs over
 * explicitly enabled ADB; no private app constructors or Keystore extraction. */
public class PhoneServerInstrumentation extends Instrumentation {
  private Activity activity;
  @Override public void onCreate(Bundle args){super.onCreate(args);start();}
  private WebView find(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}return null;}
  private String eval(String script)throws Exception{
    CountDownLatch done=new CountDownLatch(1);String[] result={null};runOnMainSync(()->{WebView w=find(activity.getWindow().getDecorView());if(w==null){done.countDown();return;}w.evaluateJavascript(script,v->{result[0]=v;done.countDown();});});
    if(!done.await(15,TimeUnit.SECONDS))throw new Exception("WebView evaluation timeout");return result[0];
  }
  @Override public void onStart(){Bundle result=new Bundle();try{
    if(!Build.FINGERPRINT.contains("generic")&&!Build.MODEL.contains("sdk"))throw new Exception("Owned emulator required");
    getTargetContext().getSharedPreferences("updates-v1",0).edit().putBoolean("autoCheck",false).commit();
    Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);activity=startActivitySync(launch);
    long until=System.currentTimeMillis()+60000;
    while(!"true".equals(eval("typeof api!=='undefined'&&typeof api.native==='function'"))){if(System.currentTimeMillis()>until)throw new Exception("Native bridge startup timeout");Thread.sleep(100);}
    eval("window.__phoneQaReady=false;void api.native('automation.enable',{enabled:true}).then(()=>window.__phoneQaReady=true)");
    while(!"true".equals(eval("window.__phoneQaReady"))){if(System.currentTimeMillis()>until)throw new Exception("Explicit automation enable failed");Thread.sleep(100);}
    Bundle ready=new Bundle();ready.putString("ready","true");sendStatus(1,ready);
    until=System.currentTimeMillis()+600000;
    while(!"true".equals(eval("window.__phoneQaDone===true"))){if(System.currentTimeMillis()>until)throw new Exception("Host acceptance did not finish");Thread.sleep(500);}
    eval("void api.native('fileServer.stop');void api.native('automation.enable',{enabled:false});");
    result.putString("pass","true");finish(Activity.RESULT_OK,result);
  }catch(Exception e){result.putString("failure",e.toString());finish(Activity.RESULT_CANCELED,result);}}
}
