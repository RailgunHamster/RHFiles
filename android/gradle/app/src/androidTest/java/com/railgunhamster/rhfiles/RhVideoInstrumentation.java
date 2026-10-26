package com.railgunhamster.rhfiles;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

/** Emulator acceptance against the minified production bridge, not mocks in UI. */
public class RhVideoInstrumentation extends Instrumentation {
  private Bundle args;private volatile Activity current;private WebView main,library;
  @Override public void onCreate(Bundle value){super.onCreate(value);args=value;start();}
  private void require(boolean ok,String message)throws Exception{if(!ok)throw new Exception(message);}
  private WebView find(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}return null;}
  private String eval(WebView web,String script)throws Exception{
    CountDownLatch latch=new CountDownLatch(1);String[] result={"null"};runOnMainSync(()->web.evaluateJavascript(script,r->{result[0]=r;latch.countDown();}));
    require(latch.await(15,TimeUnit.SECONDS),"JavaScript evaluation timed out");return result[0];
  }
  private Object expression(WebView web,String expression)throws Exception{
    eval(web,"window.__rhQa=null;void(async()=>{try{window.__rhQa={value:await ("+expression+")}}catch(e){window.__rhQa={error:String(e)}}})();");
    long end=System.currentTimeMillis()+45000;
    do{Object text=new JSONTokener(eval(web,"JSON.stringify(window.__rhQa||{})")).nextValue();JSONObject result=new JSONObject(String.valueOf(text));
      if(result.has("error"))throw new Exception(result.getString("error"));if(result.has("value"))return result.get("value");Thread.sleep(100);
    }while(System.currentTimeMillis()<end);throw new Exception("Action timed out");
  }
  private Object action(String name,JSONObject p)throws Exception{return expression(library,"RHFilesAPI.invoke("+JSONObject.quote("rhvideo."+name)+","+p+")");}
  private Object nativeCall(String name,JSONObject p)throws Exception{return expression(main,"api.native("+JSONObject.quote(name)+","+p+")");}
  private WebView waitView(String name)throws Exception{
    long end=System.currentTimeMillis()+15000;do{Activity a=current;if(a!=null&&a.getClass().getSimpleName().equals(name)){WebView[] view={null};runOnMainSync(()->view[0]=find(a.getWindow().getDecorView()));if(view[0]!=null)return view[0];}Thread.sleep(150);}while(System.currentTimeMillis()<end);throw new Exception("Missing activity "+name);
  }
  private void ready(WebView web,String name)throws Exception{long end=System.currentTimeMillis()+15000;do{if(eval(web,"typeof "+name+" !== 'undefined'").equals("true"))return;Thread.sleep(150);}while(System.currentTimeMillis()<end);throw new Exception("Bridge not ready: "+name);}
  private void readerReady()throws Exception{long end=System.currentTimeMillis()+10000;do{JSONObject state=(JSONObject)action("state",new JSONObject());if(state.optJSONObject("reader")!=null&&state.getJSONObject("reader").optBoolean("loaded"))return;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Reader not ready");}
  private void screenshot(String name)throws Exception{
    File file=new File(getTargetContext().getExternalFilesDir(null),name);android.graphics.Bitmap bitmap=getUiAutomation().takeScreenshot();
    if(bitmap!=null){try(FileOutputStream out=new FileOutputStream(file)){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();}
    else{ // Some emulator renderers reject UiAutomation capture while screencap works.
      android.util.Log.w("RHVideoQA","UiAutomation screenshot unavailable; using native screencap");
      try(InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(getUiAutomation().executeShellCommand("screencap -p"));FileOutputStream out=new FileOutputStream(file)){
        byte[] buffer=new byte[16384];int count,total=0;while((count=input.read(buffer))>=0){total+=count;require(total<=32*1024*1024,"Screenshot exceeded limit");out.write(buffer,0,count);}
      }
    }
    android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(file.getAbsolutePath(),options);require(options.outWidth>0&&options.outHeight>0,"Screenshot unavailable");
  }
  @Override public void onStart(){Bundle result=new Bundle();Application app=(Application)getTargetContext().getApplicationContext();
    Application.ActivityLifecycleCallbacks observer=new Application.ActivityLifecycleCallbacks(){public void onActivityResumed(Activity a){current=a;}public void onActivityCreated(Activity a,Bundle b){}public void onActivityStarted(Activity a){}public void onActivityPaused(Activity a){}public void onActivityStopped(Activity a){}public void onActivitySaveInstanceState(Activity a,Bundle b){}public void onActivityDestroyed(Activity a){}};
    app.registerActivityLifecycleCallbacks(observer);
    try{
      String server=args.getString("server");require(server!=null&&server.matches("http://127\\.0\\.0\\.1:[0-9]+/?"),"Only an ADB-reversed loopback fixture is allowed");
      startActivitySync(new Intent().setClassName(getTargetContext(),"com.railgunhamster.rhfiles.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      main=waitView("MainActivity");ready(main,"api");nativeCall("automation.enable",new JSONObject().put("enabled",true));
      nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");
      JSONObject login=new JSONObject().put("server",server).put("username","preview").put("password","fixture-only");
      JSONObject catalog=(JSONObject)action("connection.connect",login);require(catalog.getInt("total")==52,"Video catalog count");
      if(Build.VERSION.SDK_INT>=30){int[] location={0,0},top={0};runOnMainSync(()->{library.getLocationOnScreen(location);top[0]=library.getRootWindowInsets().getInsets(WindowInsets.Type.statusBars()|WindowInsets.Type.displayCutout()).top;});require(location[1]>=top[0],"Status bar must not cover the library header");}
      require(eval(library,"(()=>{const side=document.querySelector('.library-sidebar').getBoundingClientRect(),main=document.querySelector('.library-main').getBoundingClientRect();return main.x<20&&side.bottom<=main.top+1&&document.documentElement.scrollWidth<=innerWidth+1;})()").equals("true"),"Phone layout must stack navigation above full-width content");
      require(eval(library,"document.querySelectorAll('iframe,video').length").equals("0"),"Web player not allowed");
      long coverEnd=System.currentTimeMillis()+10000;while(Integer.parseInt(eval(library,"document.querySelectorAll('.cover-button img.loaded').length"))<4&&System.currentTimeMillis()<coverEnd)Thread.sleep(150);
      require(Integer.parseInt(eval(library,"document.querySelectorAll('.cover-button img.loaded').length"))>=4,"Authenticated images decoded");screenshot("rhvideo-library-qa.png");
      action("page",new JSONObject().put("direction",1));require(((JSONObject)action("state",new JSONObject())).getInt("offset")==36,"Paging");
      action("category",new JSONObject().put("kind","picture"));action("favorite.toggle",new JSONObject().put("kind","picture").put("id","picture-0"));
      action("media.open",new JSONObject().put("kind","picture").put("id","picture-0"));action("image.step",new JSONObject().put("direction",1));action("back",new JSONObject());
      require(eval(library,"document.getElementById('image-dialog').open").equals("false"),"Back closes image first");
      action("category",new JSONObject().put("kind","novel"));action("media.open",new JSONObject().put("kind","novel").put("id","novel-1"));
      readerReady();action("reader.step",new JSONObject().put("direction",1));readerReady();action("reader.save",new JSONObject());action("back",new JSONObject());
      action("category",new JSONObject().put("kind","video"));action("media.open",new JSONObject().put("kind","video").put("id","video-1"));
      long end=System.currentTimeMillis()+20000;JSONObject state=null;
      do{try{state=(JSONObject)nativeCall("automation.media.state",new JSONObject());if(state.optBoolean("playing")&&state.optLong("positionMs")>700)break;}catch(Exception ignored){}Thread.sleep(200);}while(System.currentTimeMillis()<end);
      require(state!=null&&state.optBoolean("playing")&&state.optLong("positionMs")>700,"Native Media3 stream did not advance: "+state);
      nativeCall("automation.media.control",new JSONObject().put("command","pause"));nativeCall("automation.media.control",new JSONObject().put("command","seek").put("value",4000));
      Thread.sleep(250);require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getLong("positionMs")>=3900,"Native seek");screenshot("rhvideo-player-qa.png");
      nativeCall("automation.media.control",new JSONObject().put("command","next"));require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getInt("index")==2,"Next video");
      nativeCall("automation.media.control",new JSONObject().put("command","previous"));require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getInt("index")==1,"Previous video");
      nativeCall("automation.back",new JSONObject());library=waitView("RhVideoActivity");action("connection.logout",new JSONObject());
      require(!((JSONObject)action("state",new JSONObject())).getBoolean("connected"),"Logout");action("back",new JSONObject());waitView("MainActivity");
      nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: native HTTP, images, paging, favorite, reader/progress, back, Media3 streaming/seek/queue and logout");finish(Activity.RESULT_OK,result);
    }catch(Throwable error){result.putString("stream","FAIL: "+error);android.util.Log.e("RHVideoQA","Failed",error);finish(Activity.RESULT_CANCELED,result);}
    finally{app.unregisterActivityLifecycleCallbacks(observer);}
  }
}
