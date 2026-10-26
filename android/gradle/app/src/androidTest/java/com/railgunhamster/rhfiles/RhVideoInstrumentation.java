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
  private boolean gridReady(JSONObject state)throws Exception{if(state==null)return false;JSONArray cells=state.optJSONArray("cells");if(cells==null||cells.length()!=4)return false;for(int i=0;i<cells.length();i++)if(!cells.getJSONObject(i).optBoolean("rendered"))return false;return cells.getJSONObject(0).optLong("positionMs")>500;}
  private WebView find(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}return null;}
  private String eval(WebView web,String script)throws Exception{
    CountDownLatch latch=new CountDownLatch(1);String[] result={"null"};runOnMainSync(()->web.evaluateJavascript(script,r->{result[0]=r;latch.countDown();}));
    require(latch.await(15,TimeUnit.SECONDS),"JavaScript evaluation timed out");return result[0];
  }
  private Object expression(WebView web,String expression)throws Exception{
    eval(web,"window.__rhQa=null;void(async()=>{try{const value=await ("+expression+");window.__rhQa={value:value===undefined?null:value}}catch(e){window.__rhQa={error:String(e)}}})();");
    long end=System.currentTimeMillis()+45000;
    do{Object text=new JSONTokener(eval(web,"JSON.stringify(window.__rhQa||{})")).nextValue();JSONObject result=new JSONObject(String.valueOf(text));
      if(result.has("error"))throw new Exception(result.getString("error"));if(result.has("value"))return result.get("value");Thread.sleep(100);
    }while(System.currentTimeMillis()<end);throw new Exception("Action timed out");
  }
  private Object action(String name,JSONObject p)throws Exception{Bundle step=new Bundle();step.putString("stream","STEP: rhvideo."+name);sendStatus(0,step);return expression(library,"RHFilesAPI.invoke("+JSONObject.quote("rhvideo."+name)+","+p+")");}
  private void step(String name){Bundle value=new Bundle();value.putString("stream","STEP: "+name+"\n");sendStatus(0,value);}
  private Object nativeCall(String name,JSONObject p)throws Exception{step("native."+name);return expression(main,"api.native("+JSONObject.quote(name)+","+p+")");}
  private Object mainAction(String name,JSONObject p)throws Exception{step("files."+name);return expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke("+JSONObject.quote(name)+","+p+")");}
  private void checkNativeTrackControls(JSONObject state)throws Exception{
    JSONArray groups=state.getJSONObject("tracks").getJSONArray("groups");require(groups.length()>0,"Actual Media3 track list must be enumerable");
    for(int i=0;i<groups.length();i++){JSONObject group=groups.getJSONObject(i);if(!group.getString("type").equals("video"))continue;
      JSONArray formats=group.getJSONArray("tracks");for(int j=0;j<formats.length();j++)if(formats.getJSONObject(j).getBoolean("supported")){
        mainAction("native.media.control",new JSONObject().put("command","track.select").put("trackGroup",group.getInt("index")).put("trackIndex",j).put("expectedPath",state.getString("path")));break;}}
    mainAction("native.media.control",new JSONObject().put("command","track.auto").put("trackType","video"));
    JSONObject disabled=(JSONObject)mainAction("native.media.control",new JSONObject().put("command","subtitles").put("enabled",false));
    require(!disabled.getJSONObject("tracks").getBoolean("subtitlesEnabled"),"Subtitle toggle must reach the native player through public schema");
    mainAction("native.media.control",new JSONObject().put("command","subtitles").put("enabled",true));
    require(Boolean.TRUE.equals(expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke('native.media.control',{command:'volume',value:37,expectedPath:'obsolete-owned-test-path'}).then(()=>false,()=>true)")),"Stale file identity must fail before applying a native control");
  }
  private void checkRotationState(String id)throws Exception{
    Activity before=current;action("selection.toggle",new JSONObject().put("kind","video").put("id",id).put("enabled",true));
    try{
      require(getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_90),"Emulator rotation must be available");
      long end=System.currentTimeMillis()+12000;while(!eval(library,"innerWidth>innerHeight").equals("true")&&System.currentTimeMillis()<end)Thread.sleep(100);
      require(eval(library,"innerWidth>innerHeight").equals("true"),"Media viewport must actually rotate");require(current==before,"Rotation must not recreate the media library");
      require(((JSONObject)action("selection.snapshot",new JSONObject())).getJSONArray("items").length()==1,"Rotation must preserve selection/index state");
    }finally{
      getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);
      long end=System.currentTimeMillis()+12000;while(!eval(library,"innerWidth<innerHeight").equals("true")&&System.currentTimeMillis()<end)Thread.sleep(100);
      action("selection.clear",new JSONObject());
    }
  }
  private void checkFileTaskAndSort()throws Exception{
    long end=System.currentTimeMillis()+20000;
    while(System.currentTimeMillis()<end){try{if(((JSONObject)mainAction("navigation.state",new JSONObject())).optBoolean("ready"))break;}catch(Exception ignored){}Thread.sleep(150);}
    for(String sort:new String[]{"name","name-desc","date","date-asc","size","size-asc","kind","kind-desc"})
      require(((JSONObject)mainAction("view.sort",new JSONObject().put("sort",sort))).getString("sort").equals(sort),"Sort direction "+sort);
    mainAction("view.sort",new JSONObject().put("sort","name"));
    String absent="/storage/emulated/0/RHFiles-owned-emulator-missing-"+System.currentTimeMillis();
    String id=String.valueOf(nativeCall("job.start",new JSONObject().put("op","copy").put("args",new JSONObject().put("sources",new JSONArray().put(absent)).put("destination","/storage/emulated/0"))));
    JSONObject job=null;end=System.currentTimeMillis()+15000;
    do{job=(JSONObject)nativeCall("job.status",new JSONObject().put("id",id));if(job.optString("state").equals("failed"))break;Thread.sleep(150);}while(System.currentTimeMillis()<end);
    require(job!=null&&job.getString("state").equals("failed"),"Missing source must produce a terminal failed task");
    require(job.getJSONArray("outputs").length()==0,"Failed missing-source test must not publish files");
    mainAction("navigation.tool",new JSONObject().put("tool","tasks"));
    require(eval(main,"(()=>{const d=document.querySelector('iframe.active-pane')?.contentDocument||document.querySelector('iframe')?.contentDocument||document;return !!d.getElementById('native-task-chip')?.hidden&&![...d.querySelectorAll('#tool-extra button')].some(b=>/重试|取消|标记已处理/.test(b.textContent));})()").equals("true"),"Failed task must not retain a pending banner or replay/cancel buttons");
    require(((JSONArray)mainAction("tasks.list",new JSONObject())).length()>0,"Failed task history must be retained");
    mainAction("navigation.home",new JSONObject());
  }
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
      checkFileTaskAndSort();
      nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");
      JSONObject login=new JSONObject().put("server",server).put("username","preview").put("password","fixture-only");
      JSONObject catalog=(JSONObject)action("connection.connect",login);require(catalog.getInt("total")==52,"Video catalog count");
      require(Boolean.TRUE.equals(expression(library,"RHVideoNative.request('folders',{kind:'video'}).then(Array.isArray)")),"Folder API must return a real array");
      if(Build.VERSION.SDK_INT>=30){int[] location={0,0},top={0};runOnMainSync(()->{library.getLocationOnScreen(location);top[0]=library.getRootWindowInsets().getInsets(WindowInsets.Type.statusBars()|WindowInsets.Type.displayCutout()).top;});require(location[1]>=top[0],"Status bar must not cover the library header");}
      require(eval(library,"(()=>{const side=document.querySelector('.library-sidebar').getBoundingClientRect(),main=document.querySelector('.library-main').getBoundingClientRect();return main.x<20&&side.bottom<=main.top+1&&document.documentElement.scrollWidth<=innerWidth+1;})()").equals("true"),"Phone layout must stack navigation above full-width content");
      require(eval(library,"document.querySelectorAll('iframe,video').length").equals("0"),"Web player not allowed");
      long coverEnd=System.currentTimeMillis()+10000;while(Integer.parseInt(eval(library,"document.querySelectorAll('.cover-button img.loaded').length"))<4&&System.currentTimeMillis()<coverEnd)Thread.sleep(150);
      require(Integer.parseInt(eval(library,"document.querySelectorAll('.cover-button img.loaded').length"))>=4,"Authenticated images decoded");
      Thread.sleep(350);require(eval(library,"[...document.querySelectorAll('.cover-button img.loaded')].some(n=>n.naturalWidth>0&&!n.hidden&&getComputedStyle(n).opacity==='1')").equals("true"),"Decoded covers must actually be visible");screenshot("rhvideo-library-qa.png");
      action("page",new JSONObject().put("direction",1));require(((JSONObject)action("state",new JSONObject())).getInt("offset")==36,"Paging");
      action("search",new JSONObject().put("query","shanye"));require(((JSONObject)action("state",new JSONObject())).getInt("total")>0,"Pinyin folder search");action("search",new JSONObject().put("query",""));
      action("sort",new JSONObject().put("value","nameDesc"));action("sort",new JSONObject().put("value","dateDesc"));
      require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"Every media UI action has a public interface");
      checkRotationState(catalog.getJSONArray("items").getJSONObject(0).getString("id"));
      for(String section:new String[]{"watch","tasks","replacement","trash","storage","system"}){
        action("server.open",new JSONObject().put("page",section));
        require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"Server controls need public API: "+section);
        if(section.equals("storage"))action("storage.rescan",new JSONObject().put("scope","library"));
        action("back",new JSONObject());
        require(eval(library,"document.getElementById('wb-server').open").equals("false"),"Back must close server panel, not the activity");
      }
      JSONObject source=new JSONObject().put("kind","video").put("id","video-0");
      action("remote.trash.stage",new JSONObject().put("params",source).put("confirmation","RHVIDEO:trash.stage"));
      require(((JSONObject)action("state",new JSONObject())).getInt("total")==51,"Native cache must invalidate immediately after source staging");
      action("remote.trash.restore",new JSONObject().put("params",source));
      require(((JSONObject)action("state",new JSONObject())).getInt("total")==52,"Restore must update the library without manual refresh");
      require(Boolean.TRUE.equals(expression(library,"RHVideoNative.request('export.chunk',{ticket:'oversized-qa',index:0,reset:true,text:'x'.repeat(65537)}).then(()=>false,()=>true)")),"Oversized bridge chunks must fail");
      require(Boolean.TRUE.equals(expression(library,"(async()=>{await RHVideoNative.request('export.chunk',{ticket:'sequence-qa',index:0,reset:true,text:'['});return RHVideoNative.request('export.chunk',{ticket:'sequence-qa',index:0,text:'[]'}).then(()=>false,()=>true)})()")),"Export chunks cannot be replayed or appended out of order");
      action("gallery.open",new JSONObject());require(Integer.parseInt(eval(library,"document.querySelectorAll('.wb-frame').length"))==32,"Screenshot library");action("panel.close",new JSONObject().put("id","wb-gallery"));
      action("category",new JSONObject().put("kind","picture"));action("favorite.toggle",new JSONObject().put("kind","picture").put("id","picture-0"));
      action("viewer.open",new JSONObject().put("mode","strip").put("source","picture"));action("viewer.seek",new JSONObject().put("ratio",.5));action("panel.close",new JSONObject().put("id","wb-viewer"));
      action("media.open",new JSONObject().put("kind","picture").put("id","picture-0"));action("image.step",new JSONObject().put("direction",1));action("back",new JSONObject());
      require(eval(library,"document.getElementById('image-dialog').open").equals("false"),"Back closes image first");
      action("category",new JSONObject().put("kind","novel"));action("media.open",new JSONObject().put("kind","novel").put("id","novel-1"));
      readerReady();action("reader.step",new JSONObject().put("direction",1));readerReady();action("reader.save",new JSONObject());action("back",new JSONObject());
      action("category",new JSONObject().put("kind","video"));action("media.open",new JSONObject().put("kind","video").put("id","video-1"));
      long end=System.currentTimeMillis()+20000;JSONObject state=null;
      do{try{state=(JSONObject)nativeCall("automation.media.state",new JSONObject());if(state.optBoolean("playing")&&state.optLong("positionMs")>700)break;}catch(Exception ignored){}Thread.sleep(200);}while(System.currentTimeMillis()<end);
      require(state!=null&&state.optBoolean("playing")&&state.optLong("positionMs")>700,"Native Media3 stream did not advance: "+state);
      nativeCall("automation.media.control",new JSONObject().put("command","pause"));nativeCall("automation.media.control",new JSONObject().put("command","seek").put("value",4000));
      checkNativeTrackControls((JSONObject)mainAction("native.media.state",new JSONObject()));
      Thread.sleep(250);require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getLong("positionMs")>=3900,"Native seek");screenshot("rhvideo-player-qa.png");
      nativeCall("automation.media.control",new JSONObject().put("command","next"));require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getInt("index")==2,"Next video");
      nativeCall("automation.media.control",new JSONObject().put("command","previous"));require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getInt("index")==1,"Previous video");
      nativeCall("automation.back",new JSONObject());library=waitView("RhVideoActivity");
      action("favorite.toggle",new JSONObject().put("kind","video").put("id","video-0"));action("category",new JSONObject().put("kind","favorite"));action("viewer.open",new JSONObject().put("mode","slideshow").put("source","favorite"));action("viewer.toggle",new JSONObject());action("viewer.step",new JSONObject().put("direction",1));
      JSONObject mixed=(JSONObject)action("viewer.mediaState",new JSONObject());require(mixed.optBoolean("nativeSurface")&&mixed.optInt("renderedFrames")>0,"Mixed slideshow native video must render in the library");require(current.getClass().getSimpleName().equals("RhVideoActivity"),"Mixed slideshow cannot launch another player activity");action("viewer.mediaControl",new JSONObject().put("command","pause"));action("viewer.step",new JSONObject().put("direction",1));require(!((JSONObject)action("viewer.mediaState",new JSONObject())).optBoolean("opened"),"Image transition must release the native video");action("panel.close",new JSONObject().put("id","wb-viewer"));action("category",new JSONObject().put("kind","video"));
      action("grid.open",new JSONObject());Thread.sleep(1000);JSONObject grid=null;String gridError="";end=System.currentTimeMillis()+30000;do{try{grid=(JSONObject)nativeCall("automation.grid.state",new JSONObject());if(gridReady(grid))break;}catch(Exception error){gridError=error.toString();}Thread.sleep(200);}while(System.currentTimeMillis()<end);
      require(gridReady(grid),"Four native grid players must render real frames: "+grid+"; "+gridError);screenshot("rhvideo-grid-qa.png");nativeCall("automation.grid.control",new JSONObject().put("target",-1).put("command","pause"));nativeCall("automation.grid.control",new JSONObject().put("target",1).put("command","expand"));require(((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getInt("expanded")==1,"Native grid expand");nativeCall("automation.grid.control",new JSONObject().put("target",-1).put("command","expand"));
      JSONObject gridTrack=(JSONObject)mainAction("native.grid.control",new JSONObject().put("target",0).put("command","subtitles").put("enabled",false).put("expectedOffset",0));require(!gridTrack.getJSONArray("cells").getJSONObject(0).getJSONObject("tracks").getBoolean("subtitlesEnabled"),"Native grid settings must also have typed public controls");
      mainAction("native.grid.control",new JSONObject().put("target",0).put("command","subtitles").put("enabled",true).put("expectedOffset",0));
      require(((JSONObject)nativeCall("automation.grid.control",new JSONObject().put("command","page").put("value",1))).getInt("offset")==4,"Next native group");end=System.currentTimeMillis()+30000;do{grid=(JSONObject)nativeCall("automation.grid.state",new JSONObject());if(gridReady(grid))break;Thread.sleep(200);}while(System.currentTimeMillis()<end);require(gridReady(grid),"Next native group must render frames");require(((JSONObject)nativeCall("automation.grid.control",new JSONObject().put("command","page").put("value",-1))).getInt("offset")==0,"Previous native group");
      action("grid.close",new JSONObject());library=waitView("RhVideoActivity");action("connection.logout",new JSONObject());
      require(!((JSONObject)action("state",new JSONObject())).getBoolean("connected"),"Logout");action("back",new JSONObject());waitView("MainActivity");
      nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: native HTTP, images, paging, favorite, reader/progress, back, Media3 streaming/seek/queue and logout");finish(Activity.RESULT_OK,result);
    }catch(Throwable error){result.putString("stream","FAIL: "+error);android.util.Log.e("RHVideoQA","Failed",error);finish(Activity.RESULT_CANCELED,result);}
    finally{app.unregisterActivityLifecycleCallbacks(observer);}
  }
}
