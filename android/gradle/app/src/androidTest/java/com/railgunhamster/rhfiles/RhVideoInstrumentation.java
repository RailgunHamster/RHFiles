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
  private JSONObject waitGrid(int count,boolean paused)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject state=null;
    do{try{state=(JSONObject)nativeCall("automation.grid.state",new JSONObject());JSONArray cells=state.getJSONArray("cells");boolean ready=cells.length()==count;for(int i=0;i<cells.length();i++){JSONObject cell=cells.getJSONObject(i);ready&=cell.optBoolean("rendered")&&cell.optBoolean("paused")==paused&&cell.optInt("playbackState")==3&&cell.optLong("renderedFrames")>0;if(!paused)ready&=cell.optBoolean("playing")&&cell.optLong("positionMs")>250&&cell.optLong("renderedFrames")>1;}if(ready)return state;}catch(Exception ignored){}Thread.sleep(200);}while(System.currentTimeMillis()<end);
    throw new Exception("Native grid frames/state did not settle: "+state);
  }
  private JSONArray gridIds(JSONObject state)throws Exception{JSONArray ids=new JSONArray();JSONArray cells=state.getJSONArray("cells");for(int i=0;i<cells.length();i++)ids.put(cells.getJSONObject(i).getString("id"));return ids;}
  private JSONObject gridControl(int target,String command,double value)throws Exception{return (JSONObject)mainAction("native.grid.control",new JSONObject().put("target",target).put("command",command).put("value",value));}
  private void checkReferenceGrid()throws Exception{
    require(((JSONObject)action("preferences.state",new JSONObject())).getInt("gridCount")==0,"Android must default to reference automatic grouping");
    action("gallery.open",new JSONObject());action("grid.open",new JSONObject());JSONObject first=waitGrid(3,false);
    require(first.getInt("total")==6&&first.getInt("groupTotal")==2,"Grid pool must contain only the six gallery videos, not the 52-item list");
    require(gridIds(first).toString().equals("[\"video-0\",\"video-1\",\"video-2\"]"),"Native grid must preserve gallery order: "+first);
    JSONArray firstIds=gridIds(first);String lease=first.getString("lease");
    require(first.getString("engine").equals("Media3")&&first.getBoolean("nativeSurface"),"Use actual native players, not an HTML grid");
    require(((JSONObject)mainAction("native.grid.control",new JSONObject().put("command","controls").put("enabled",true))).getBoolean("controlsExpanded"),"Playback adjustment disclosure must have a typed public API");mainAction("native.grid.control",new JSONObject().put("command","controls").put("enabled",false));
    for(int i=0;i<3;i++){JSONObject cell=first.getJSONArray("cells").getJSONObject(i);require(cell.getInt("volume")==100&&!cell.getBoolean("muted")&&cell.getBoolean("repeat"),"Every cell starts audible and repeats normal EOF");}
    require(first.getJSONArray("cells").getJSONObject(2).getJSONArray("rect").getDouble(2)==1.0,"Mixed proportions require a spanning row, not a square grid");
    require(first.getJSONArray("cells").getJSONObject(2).getJSONArray("surfaceBounds").getInt(2)>first.getJSONArray("cells").getJSONObject(0).getJSONArray("surfaceBounds").getInt(2)*1.8,"Actual native child bounds must apply the spanning layout");
    gridControl(-1,"pause",0);gridControl(0,"seek",5000);gridControl(0,"volume",37);gridControl(0,"mute",0);gridControl(0,"rate",1.5);
    JSONObject before=waitGrid(3,true);require(before.getJSONArray("cells").getJSONObject(0).getLong("positionMs")>=4900,"Paused native seek must reach the requested target");
    JSONObject other=gridControl(-1,"page",1);require(other.getInt("offset")==3,"Variable group boundary");waitGrid(3,false);
    require(Boolean.TRUE.equals(expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke('native.grid.control',{command:'volume',target:0,value:99,expectedOffset:0,expectedLease:"+JSONObject.quote(lease)+"}).then(()=>false,()=>true)")),"A late slider must not change the next group");
    // A different, later prepared single-video queue must not erase this grid.
    expression(library,"RHVideoNative.request('playlist.prepare',{ticket:'owned-single-qa',reset:true,items:[{id:'video-7',title:'independent queue'}],options:{fullLength:true}})");
    gridControl(-1,"page",-1);JSONObject restored=waitGrid(3,true);require(gridIds(restored).toString().equals(firstIds.toString()),"Restored group order");JSONObject cell=restored.getJSONArray("cells").getJSONObject(0);
    require(Math.abs(cell.getLong("positionMs")-5000)<500&&cell.getInt("volume")==37&&cell.getBoolean("muted")&&cell.getDouble("decoderVolume")==0&&Math.abs(cell.getDouble("rate")-1.5)<.01,"Per-cell pause/time/volume/mute/speed must survive group changes: "+cell);
    gridControl(1,"expand",0);require(!((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1).getBoolean("paused"),"Expanding a paused cell resumes it");nativeCall("automation.back",new JSONObject());require(((JSONObject)nativeCall("automation.grid.state",new JSONObject())).isNull("expanded"),"First back shrinks the expanded cell");gridControl(-1,"pause",0);
    getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_90);Thread.sleep(1200);restored=waitGrid(3,true);require(restored.getString("lease").equals(lease)&&gridIds(restored).toString().equals(firstIds.toString()),"Rotation keeps the same native grid session");getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_0);Thread.sleep(1200);restored=waitGrid(3,true);require(restored.getInt("canvasHeight")>restored.getInt("canvasWidth"),"Portrait rotation must settle before seeking a new decoder");
    long input=restored.getJSONArray("cells").getJSONObject(1).getLong("inputId"),frames=restored.getJSONArray("cells").getJSONObject(1).getLong("submittedFrames");
    gridControl(1,"seek",19500);long end=System.currentTimeMillis()+25000;boolean seekReady=false;
    do{cell=((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1);if(cell.getInt("playbackState")==3&&cell.getBoolean("paused")&&cell.getLong("renderedFrames")>0&&cell.getLong("submittedFrames")>frames&&cell.getLong("positionMs")>=19400){seekReady=true;break;}Thread.sleep(150);}while(System.currentTimeMillis()<end);require(seekReady,"Actual paused near-EOF frame must be ready before the loop check: "+cell);
    gridControl(1,"resume",0);end=System.currentTimeMillis()+8000;boolean looped=false;do{cell=((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1);require(cell.getLong("inputId")==input,"EOF cannot replace the native player");if(cell.getLong("positionMs")<8000&&!cell.getBoolean("paused")){looped=true;break;}Thread.sleep(150);}while(System.currentTimeMillis()<end);require(looped,"Normal EOF must repeat inside the same grid cell: "+cell);gridControl(-1,"pause",0);getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);
    gridControl(-1,"page",1);waitGrid(3,false);action("grid.close",new JSONObject());library=waitView("RhVideoActivity");action("grid.open",new JSONObject());JSONObject reopened=waitGrid(3,false);
    require(reopened.getInt("offset")==3&&!reopened.getString("lease").equals(lease),"Reopen restores only the exact group, with a new session");
    for(int i=0;i<3;i++){cell=reopened.getJSONArray("cells").getJSONObject(i);require(cell.getInt("volume")==100&&!cell.getBoolean("muted")&&cell.getDouble("rate")==1,"Fresh viewer resets cell controls");}
    action("grid.seekGroup",new JSONObject().put("ratio",0));require(waitGrid(3,false).getInt("offset")==0,"Shared public group seek reaches the first group");action("grid.seekGroup",new JSONObject().put("ratio",1));waitGrid(3,false);
    screenshot("rhvideo-grid-qa.png");action("grid.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private void checkFailedGrid()throws Exception{
    String server=args.getString("failureServer");require(server!=null&&server.matches("http://127\\.0\\.0\\.1:[0-9]+/?"),"Only an owned loopback failure fixture is allowed");
    action("connection.logout",new JSONObject());action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));action("grid.open",new JSONObject());
    long end=System.currentTimeMillis()+20000;JSONObject grid=null;boolean failed=false;
    do{try{grid=(JSONObject)nativeCall("automation.grid.state",new JSONObject());JSONArray cells=grid.getJSONArray("cells");failed=cells.length()==2;for(int i=0;i<cells.length();i++)failed&=!cells.getJSONObject(i).isNull("error")&&!cells.getJSONObject(i).optBoolean("rendered");if(failed)break;}catch(Exception ignored){}Thread.sleep(200);}while(System.currentTimeMillis()<end);
    require(failed,"Both HTTP failures must settle visibly without a synthetic success frame: "+grid);Thread.sleep(2000);screenshot("rhvideo-grid-error-qa.png");action("grid.close",new JSONObject());library=waitView("RhVideoActivity");
  }
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
  private void ready(WebView web,String name)throws Exception{long start=System.currentTimeMillis(),end=start+45000;do{if(eval(web,"typeof "+name+" !== 'undefined'").equals("true")){step("bridge "+name+" ready after "+(System.currentTimeMillis()-start)+" ms (functional readiness, not a startup performance pass)");return;}Thread.sleep(500);}while(System.currentTimeMillis()<end);throw new Exception("Bridge not ready: "+name+"; "+eval(web,"JSON.stringify({url:location.href,title:document.title,ready:document.readyState,body:document.body?.innerText?.slice(0,300),scripts:[...document.scripts].map(s=>s.src)})"));}
  private void readerReady()throws Exception{long end=System.currentTimeMillis()+10000;do{JSONObject state=(JSONObject)action("state",new JSONObject());if(state.optJSONObject("reader")!=null&&state.getJSONObject("reader").optBoolean("loaded"))return;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Reader not ready");}
  private void checkReferenceControls()throws Exception{
    require(((JSONObject)action("page.jump",new JSONObject().put("page",2))).getInt("offset")==36,"Direct page jump");action("page.jump",new JSONObject().put("page",1));
    action("volume.set",new JSONObject().put("value",60));require(((JSONObject)action("volume.state",new JSONObject())).getInt("volume")==60,"Master gain preference/API");
    action("task.detail",new JSONObject().put("kind","default").put("id","video:video-0"));
    action("image.preview",new JSONObject().put("path","/api/v1/videos/video-0/thumbnail").put("title","任务预览"));
    long end=System.currentTimeMillis()+10000;while(!eval(library,"document.querySelector('#wb-image-preview img')?.naturalWidth===800").equals("true")&&System.currentTimeMillis()<end)Thread.sleep(100);
    require(eval(library,"document.querySelector('#wb-image-preview img')?.naturalWidth===800").equals("true"),"Actual enlarged task image");action("panel.close",new JSONObject().put("id","wb-image-preview"));action("panel.close",new JSONObject().put("id","wb-info"));
    action("category",new JSONObject().put("kind","novel"));action("novel.preview",new JSONObject().put("id","novel-0").put("offset",0));
    require(((JSONObject)action("novel.previewSearch",new JSONObject().put("query","zhangjiezhailu"))).getInt("matches")==40,"Excerpt pinyin search");
    action("novel.previewSearch",new JSONObject().put("query","duanluo41"));action("novel.preview",new JSONObject().put("id","novel-0").put("offset",40));
    JSONArray chapters=((JSONObject)action("novel.previewState",new JSONObject())).getJSONArray("chapters");require(chapters.length()==1&&chapters.getInt(0)==41,"Paged excerpt search");action("panel.close",new JSONObject().put("id","wb-preview"));
    action("media.open",new JSONObject().put("kind","novel").put("id","novel-0"));readerReady();action("reader.toc",new JSONObject().put("visible",false));require(((JSONObject)action("reader.toc",new JSONObject())).getBoolean("visible"),"Reader TOC toggle");action("reader.favorite",new JSONObject());action("reader.favorite",new JSONObject());action("reader.close",new JSONObject());
    action("gallery.open",new JSONObject());action("gallery.inspect",new JSONObject().put("index",0));action("image.step",new JSONObject().put("direction",1));require(((JSONObject)action("image.state",new JSONObject())).getInt("index")==1,"Screenshot browsing queue");action("image.reveal",new JSONObject());
    require(((JSONObject)action("state",new JSONObject())).getString("kind").equals("video"),"Reveal original video in list");require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"New controls need public APIs");
  }
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
      if(!"grid".equals(args.getString("mode")))checkFileTaskAndSort();
      nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");
      JSONObject login=new JSONObject().put("server",server).put("username","preview").put("password","fixture-only");
      JSONObject catalog=(JSONObject)action("connection.connect",login);require(catalog.getInt("total")==52,"Video catalog count");
      if("grid".equals(args.getString("mode"))){checkReferenceGrid();checkFailedGrid();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference grid pool/layout, audible cells, native frames, pause/seek/mute/rate restoration, independent queue, rotation, EOF loop, exact-group reopening and terminal HTTP errors");finish(Activity.RESULT_OK,result);return;}
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
      checkReferenceControls();
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
      action("player.control",new JSONObject().put("command","volume").put("value",37));action("volume.set",new JSONObject().put("value",0));
      JSONObject muted=(JSONObject)nativeCall("automation.media.state",new JSONObject());require(Math.abs(muted.getDouble("volume")-37)<.1&&muted.getDouble("decoderVolume")==0,"Master mute preserves player gain");
      action("volume.set",new JSONObject().put("value",60));require(Math.abs(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getDouble("decoderVolume")-22.2)<.1,"Master gain multiplies native Media3 volume");
      nativeCall("automation.media.control",new JSONObject().put("command","pause"));nativeCall("automation.media.control",new JSONObject().put("command","seek").put("value",4000));
      checkNativeTrackControls((JSONObject)mainAction("native.media.state",new JSONObject()));
      Thread.sleep(250);require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getLong("positionMs")>=3900,"Native seek");screenshot("rhvideo-player-qa.png");
      nativeCall("automation.media.control",new JSONObject().put("command","next"));require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getInt("index")==2,"Next video");
      nativeCall("automation.media.control",new JSONObject().put("command","previous"));require(((JSONObject)nativeCall("automation.media.state",new JSONObject())).getInt("index")==1,"Previous video");
      nativeCall("automation.back",new JSONObject());library=waitView("RhVideoActivity");
      action("favorite.toggle",new JSONObject().put("kind","video").put("id","video-0"));action("category",new JSONObject().put("kind","favorite"));action("viewer.open",new JSONObject().put("mode","slideshow").put("source","favorite"));action("viewer.toggle",new JSONObject());action("viewer.step",new JSONObject().put("direction",1));
      JSONObject mixed=(JSONObject)action("viewer.mediaState",new JSONObject());require(mixed.optBoolean("nativeSurface")&&mixed.optInt("renderedFrames")>0,"Mixed slideshow native video must render in the library");require(current.getClass().getSimpleName().equals("RhVideoActivity"),"Mixed slideshow cannot launch another player activity");action("viewer.mediaControl",new JSONObject().put("command","pause"));action("viewer.step",new JSONObject().put("direction",1));require(!((JSONObject)action("viewer.mediaState",new JSONObject())).optBoolean("opened"),"Image transition must release the native video");action("panel.close",new JSONObject().put("id","wb-viewer"));action("category",new JSONObject().put("kind","video"));
      action("preferences.set",new JSONObject().put("key","gridCount").put("value",4));action("grid.open",new JSONObject());Thread.sleep(1000);JSONObject grid=null;String gridError="";end=System.currentTimeMillis()+30000;do{try{grid=(JSONObject)nativeCall("automation.grid.state",new JSONObject());if(gridReady(grid))break;}catch(Exception error){gridError=error.toString();}Thread.sleep(200);}while(System.currentTimeMillis()<end);
      require(gridReady(grid),"Four native grid players must render real frames: "+grid+"; "+gridError);screenshot("rhvideo-grid-qa.png");nativeCall("automation.grid.control",new JSONObject().put("target",-1).put("command","pause"));nativeCall("automation.grid.control",new JSONObject().put("target",1).put("command","expand"));require(((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getInt("expanded")==1,"Native grid expand");nativeCall("automation.grid.control",new JSONObject().put("target",-1).put("command","expand"));
      JSONObject gridTrack=(JSONObject)mainAction("native.grid.control",new JSONObject().put("target",0).put("command","subtitles").put("enabled",false).put("expectedOffset",0));require(!gridTrack.getJSONArray("cells").getJSONObject(0).getJSONObject("tracks").getBoolean("subtitlesEnabled"),"Native grid settings must also have typed public controls");
      mainAction("native.grid.control",new JSONObject().put("target",0).put("command","subtitles").put("enabled",true).put("expectedOffset",0));
      require(((JSONObject)nativeCall("automation.grid.control",new JSONObject().put("command","page").put("value",1))).getInt("offset")==0,"Boundary navigation cannot introduce unrelated list videos");require(((JSONObject)nativeCall("automation.grid.control",new JSONObject().put("command","page").put("value",-1))).getInt("offset")==0,"Previous native group boundary");
      action("grid.close",new JSONObject());library=waitView("RhVideoActivity");action("connection.logout",new JSONObject());
      require(!((JSONObject)action("state",new JSONObject())).getBoolean("connected"),"Logout");action("back",new JSONObject());waitView("MainActivity");
      nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: native HTTP, images, paging, favorite, reader/progress, back, Media3 streaming/seek/queue and logout");finish(Activity.RESULT_OK,result);
    }catch(Throwable error){try{screenshot("rhvideo-failure-qa.png");}catch(Exception ignored){}result.putString("stream","FAIL: "+error);android.util.Log.e("RHVideoQA","Failed",error);finish(Activity.RESULT_CANCELED,result);}
    finally{app.unregisterActivityLifecycleCallbacks(observer);}
  }
}
