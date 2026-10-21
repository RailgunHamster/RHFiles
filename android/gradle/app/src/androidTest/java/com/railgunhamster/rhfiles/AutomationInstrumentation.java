package com.railgunhamster.rhfiles;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.nio.*;
import java.util.concurrent.*;

/** Public action API probe against the actual APK, including minified builds.
 * Refuses physical devices, never links to obfuscated app implementation types. */
public class AutomationInstrumentation extends Instrumentation {
  private Activity activity;private Bundle args;
  @Override public void onCreate(Bundle value){super.onCreate(value);args=value;start();}
  private WebView find(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView found=find(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null;}
  private String eval(String script)throws Exception{CountDownLatch latch=new CountDownLatch(1);String[] value={"null"};runOnMainSync(()->{WebView web=find(activity.getWindow().getDecorView());if(web==null){latch.countDown();return;}web.evaluateJavascript(script,result->{value[0]=result;latch.countDown();});});if(!latch.await(15,TimeUnit.SECONDS))throw new Exception("Action probe evaluation timeout");return value[0];}
  private void require(boolean value,String message)throws Exception{if(!value)throw new Exception(message);}
  private JSONObject marker()throws Exception{return new JSONObject(new JSONTokener(eval("JSON.stringify(window.__automationQa||{})")).nextValue().toString());}
  private void wav(File file)throws Exception{int bytes=44100*2*20;ByteBuffer data=ByteBuffer.allocate(44+bytes).order(ByteOrder.LITTLE_ENDIAN);data.put("RIFF".getBytes()).putInt(36+bytes).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(44100).putInt(88200).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(bytes);try(FileOutputStream out=new FileOutputStream(file)){out.write(data.array());}}
  @Override public void onStart(){Bundle result=new Bundle();try{
    require(Build.FINGERPRINT.contains("generic")||Build.FINGERPRINT.contains("emulator")||Build.MODEL.contains("Emulator")||Build.HARDWARE.contains("ranchu")||Build.HARDWARE.contains("goldfish"),"Only an owned emulator may run this probe");
    Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);activity=startActivitySync(launch);
    long end=System.currentTimeMillis()+45000;while(System.currentTimeMillis()<end){if(eval("(()=>{try{const a=RHFilesAPI.forPane?RHFilesAPI.forPane('left'):RHFilesAPI;return a.snapshot().state.application?.ready===true}catch{return false}})()").equals("true"))break;Thread.sleep(150);}
    require(System.currentTimeMillis()<end,"Pane API not ready");
    File directory=new File(getTargetContext().getExternalFilesDir(null),"automation-qa-"+System.currentTimeMillis());require(directory.mkdirs(),"Cannot create owned fixture");wav(new File(directory,"中文1.wav"));wav(new File(directory,"中文2.wav"));
    eval("void(async()=>{try{const a=RHFilesAPI.forPane?RHFilesAPI.forPane('left'):RHFilesAPI;const path="+JSONObject.quote(directory.getAbsolutePath())+";await a.invoke('navigation.open',{path});const listing=await a.invoke('files.list',{});if(listing.entries.length!==2)throw Error('Real folder listing mismatch');await a.invoke('selection.set',{paths:[listing.entries[0].path]});if((await a.invoke('selection.get',{})).length!==1)throw Error('Selection API mismatch');const enabled=await api.native('automation.enable',{enabled:true});if(!enabled.enabled)throw Error('Opt-in failed');await api.native('media.play',{path:listing.entries[0].path,name:'QA sound 1',kind:'audio',queue:listing.entries.map(e=>({path:e.path,name:e.name}))});window.__automationQa={phase:'player'};}catch(e){window.__automationQa={error:String(e)}}})();");
    end=System.currentTimeMillis()+30000;boolean media=false;
    while(System.currentTimeMillis()<end){JSONObject value=marker();require(!value.has("error"),value.optString("error"));if(value.optString("phase").equals("player")){
      eval("void api.native('automation.media.state').then(state=>window.__automationQa={phase:'state',state}).catch(()=>{})");Thread.sleep(100);value=marker();if(value.optJSONObject("state")!=null&&value.getJSONObject("state").optInt("count")==2){media=true;break;}
    }Thread.sleep(150);}
    require(media,"Native media action scope did not follow the current activity");
    eval("void(async()=>{try{await api.native('automation.media.control',{command:'pause'});await api.native('automation.media.control',{command:'next'});await api.native('automation.media.control',{command:'rate',value:1.5});const state=await api.native('automation.media.state');if(state.index!==1||Math.abs(state.rate-1.5)>.01)throw Error('Media API did not update player');await api.native('automation.media.control',{command:'controls.show'});const controls=await api.native('automation.ui.list');if(!controls.some(c=>c.label==='返回'||c.resource?.endsWith('/exo_play_pause')))throw Error('Native controls not enumerated');await api.native('automation.back');if(!"+args.getString("keepEnabled","false").equals("true")+")await api.native('automation.enable',{enabled:false});window.__automationQa={pass:true};}catch(e){window.__automationQa={error:String(e)}}})();");
    end=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<end){JSONObject value=marker();require(!value.has("error"),value.optString("error"));if(value.optBoolean("pass")){result.putString("pass","true");result.putString("fixture",directory.getAbsolutePath());result.putString("checks","real listing, Unicode names, selection, opt-in, current native activity, media queue/pause/rate, native controls, normal back");finish(Activity.RESULT_OK,result);return;}Thread.sleep(150);}
    throw new Exception("Native action probe did not complete");
  }catch(Throwable error){result.putString("pass","false");result.putString("error",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,result);}}
}
