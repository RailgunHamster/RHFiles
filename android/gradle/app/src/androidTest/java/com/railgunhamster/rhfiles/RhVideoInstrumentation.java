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
  private final java.util.Set<Activity> stoppedActivities=java.util.Collections.synchronizedSet(java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Activity,Boolean>()));
  private final java.util.Set<Activity> destroyedActivities=java.util.Collections.synchronizedSet(java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Activity,Boolean>()));
  @Override public void onCreate(Bundle value){super.onCreate(value);args=value;start();}
  private void require(boolean ok,String message)throws Exception{if(!ok)throw new Exception(message);}
  private boolean ownedFixtureServer(String server){
    String mode=args.getString("fixtureTransport","adb-reverse");
    return server!=null&&((mode.equals("adb-reverse")&&server.matches("http://127\\.0\\.0\\.1:[0-9]+/?"))||(mode.equals("emulator-host")&&server.matches("http://10\\.0\\.2\\.2:[0-9]+/?")));
  }
  private boolean gridReady(JSONObject state)throws Exception{if(state==null)return false;JSONArray cells=state.optJSONArray("cells");if(cells==null||cells.length()!=4)return false;for(int i=0;i<cells.length();i++)if(!cells.getJSONObject(i).optBoolean("rendered"))return false;return cells.getJSONObject(0).optLong("positionMs")>500;}
  private void checkAudioStartExperiment(JSONObject state)throws Exception{
    int expected=Integer.parseInt(args.getString("audioStartMs","0"));
    require(state.getInt("qaAudioStartMs")==expected,"QA audio start setting must match the explicit host request; experimental playback cannot pass the default gate");
    String codecMode=args.getString("codecMode","default");require(codecMode.equals(state.getString("qaCodecMode")),"The actual native codec mode must match the host request");
    String surfaceMode=args.getString("surfaceMode","compositor");require(surfaceMode.equals(state.getString("qaSurfaceMode")),"Surface output must match the explicit host request");
    for(int i=0;i<state.getJSONArray("cells").length();i++){
      JSONObject cell=state.getJSONArray("cells").getJSONObject(i),diagnostic=cell.getJSONObject("diagnostics"),presentation=cell.getJSONObject("presentation");
      require(presentation.getString("surfaceType").equals("SurfaceView")&&!presentation.getBoolean("rotationPipeline"),"The control experiment must retain native SurfaceView decode without an effects pipeline");
      if(surfaceMode.equals("direct"))require(presentation.getString("rotationRenderer").equals("surface-view-direct-probe")&&!presentation.getBoolean("nativeLayerAttached")&&!presentation.getBoolean("autoRotate")&&presentation.getInt("rotation")==0,"Direct output is only an unrotated diagnostic, not full rotation acceptance");
      else require(presentation.getString("rotationRenderer").equals("surface-compositor")&&presentation.getBoolean("nativeLayerAttached"),"Default output must retain its actual compositor layer");
      if(codecMode.equals("default"))require(diagnostic.isNull("codecAdapters"),"Default playback cannot contain a codec queueing experiment");
      else{JSONObject adapters=diagnostic.getJSONObject("codecAdapters");for(String type:new String[]{"audio","video"})require(adapters.getString(type).equals("androidx.media3.exoplayer.mediacodec.SynchronousMediaCodecAdapter"),"Verify the actual live codec adapter for "+type+", not only BuildConfig");}
    }
    if(expected==0)return;
    JSONArray cells=state.getJSONArray("cells");
    for(int i=0;i<cells.length();i++){
      JSONObject receipt=cells.getJSONObject(i).getJSONObject("diagnostics").getJSONObject("audioStartExperiment");
      require(receipt.getInt("requestedMs")==expected&&receipt.getInt("afterFrames")>0&&receipt.getInt("afterFrames")<=receipt.getInt("capacityFrames"),"Every live grid audio output must report its actual experimental start threshold");
      require(receipt.getInt("bufferSizeFrames")==receipt.getInt("capacityFrames"),"The waterline experiment must not shrink the PCM buffer");
    }
  }
  private JSONObject waitGrid(int count,boolean paused)throws Exception{
    return waitGrid(count,paused,android.content.res.Configuration.ORIENTATION_UNDEFINED);
  }
  private JSONObject waitGrid(int count,boolean paused,int orientation)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject state=null;String lastError="none";
    do{try{state=(JSONObject)nativeCall("automation.grid.state",new JSONObject());JSONArray cells=state.getJSONArray("cells");boolean ready=cells.length()==count;
      if(orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE)ready&=state.getInt("canvasWidth")>state.getInt("canvasHeight");
      if(orientation==android.content.res.Configuration.ORIENTATION_PORTRAIT)ready&=state.getInt("canvasHeight")>state.getInt("canvasWidth");
      for(int i=0;i<cells.length();i++){JSONObject cell=cells.getJSONObject(i);ready&=cell.optBoolean("rendered")&&cell.optBoolean("paused")==paused&&cell.optInt("playbackState")==3&&cell.optLong("renderedFrames")>0;if(!paused)ready&=cell.optBoolean("playing")&&cell.optLong("positionMs")>250&&cell.optLong("renderedFrames")>1;}if(ready){checkAudioStartExperiment(state);step("grid settled "+state);return state;}}catch(Exception error){lastError=error.toString();}Thread.sleep(200);}while(System.currentTimeMillis()<end);
    // The release APK is R8-minified. Do not link a Kotlin Companion from the
    // separately compiled probe: R8 can inline/remove it in the product APK.
    step("QA: grid-failure-audio-snapshot pid="+android.os.Process.myPid());
    android.util.Log.e("RHVideoQA","Grid public API failure: "+lastError+"; state="+state);
    JSONObject diagnostic=new JSONObject();runOnMainSync(()->{try{diagnostic.put("activity",current==null?"none":current.getClass().getSimpleName());diagnostic.put("mainAttached",main!=null&&main.isAttachedToWindow());diagnostic.put("libraryAttached",library!=null&&library.isAttachedToWindow());}catch(Exception error){try{diagnostic.put("viewError",error.toString());}catch(Exception ignored){}}});
    try{diagnostic.put("main",expression(main,"({hidden:document.hidden,bridge:!!window.RHFilesNative,api:typeof api,native:typeof api?.native})"));}catch(Exception error){diagnostic.put("mainError",error.toString());}
    try{diagnostic.put("libraryGrid",action("grid.state",new JSONObject()));}catch(Exception error){diagnostic.put("libraryError",error.toString());}
    android.util.Log.e("RHVideoQA",playbackThreads());throw new Exception("Native grid frames/state did not settle: "+state+"; API error: "+lastError+"; diagnostic: "+diagnostic);
  }
  private JSONArray gridIds(JSONObject state)throws Exception{JSONArray ids=new JSONArray();JSONArray cells=state.getJSONArray("cells");for(int i=0;i<cells.length();i++)ids.put(cells.getJSONObject(i).getString("id"));return ids;}
  private JSONArray gridInputs(JSONObject state)throws Exception{JSONArray ids=new JSONArray();JSONArray cells=state.getJSONArray("cells");for(int i=0;i<cells.length();i++)ids.put(cells.getJSONObject(i).getLong("inputId"));return ids;}
  private JSONObject gridControl(int target,String command,double value)throws Exception{return (JSONObject)mainAction("native.grid.control",new JSONObject().put("target",target).put("command",command).put("value",value));}
  private void clickNativeLabel(String label)throws Exception{
    long end=SystemClock.uptimeMillis()+5000;Activity owner=current;int[] center={-1,-1},previous={-1,-1};int stable=0;
    do{center[0]=center[1]=-1;runOnMainSync(()->{
      if(owner==null||owner!=current||owner.isFinishing())return;View decor=owner.getWindow().getDecorView(),button=described(decor,label);if(button==null||!button.isShown()||!button.isEnabled()||!decor.hasWindowFocus()||button.getWindowToken()!=decor.getWindowToken())return;
      for(View node=button;node!=null;node=node.getParent() instanceof View?(View)node.getParent():null)if(node.getAlpha()<.95f)return;
      android.graphics.Rect visible=new android.graphics.Rect(),window=new android.graphics.Rect();if(!button.getGlobalVisibleRect(visible)||!decor.getGlobalVisibleRect(window))return;
      int[] xy={0,0},root={0,0};button.getLocationOnScreen(xy);decor.getRootView().getLocationOnScreen(root);visible.offset(root[0],root[1]);window.offset(root[0],root[1]);android.graphics.Point screen=new android.graphics.Point();if(decor.getDisplay()!=null)decor.getDisplay().getRealSize(screen);
      int x=xy[0]+button.getWidth()/2,y=xy[1]+button.getHeight()/2;if(button.getWidth()>0&&button.getHeight()>0&&visible.contains(x,y)&&window.contains(x,y)&&x>=0&&y>=0&&x<screen.x&&y<screen.y){center[0]=x;center[1]=y;}
    });if(center[0]>=0&&center[0]==previous[0]&&center[1]==previous[1])stable++;else stable=0;if(stable>=1)break;previous[0]=center[0];previous[1]=center[1];Thread.sleep(50);}while(SystemClock.uptimeMillis()<end);
    require(stable>=1&&current==owner,"A stable focused native touch target must exist: "+label);long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,center[0],center[1],0),up=MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,center[0],center[1],0);
    try{sendPointerSync(down);sendPointerSync(up);}finally{down.recycle();up.recycle();}step("native label touched once: "+label);
  }
  private JSONObject waitGridFavorite(int target,boolean enabled,boolean failed)throws Exception{
    long end=System.currentTimeMillis()+10000;JSONObject cell=null;
    do{cell=((JSONObject)action("grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(target);if(!cell.getBoolean("favoriteBusy")&&cell.getBoolean("favorite")==enabled&&cell.isNull("favoriteError")!=failed)return cell;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    throw new Exception("Native grid favorite did not settle: "+cell);
  }
  private long gridGestureDown;private float gridGestureX,gridGestureY;
  private View described(View view,String label){if(label.contentEquals(view.getContentDescription()==null?"":view.getContentDescription()))return view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){View found=described(group.getChildAt(i),label);if(found!=null)return found;}}return null;}
  private void beginGridVolumeGesture()throws Exception{
    boolean[] found={false};runOnMainSync(()->{View view=described(current.getWindow().getDecorView(),"同屏音量调节");if(!(view instanceof android.widget.SeekBar))return;android.widget.SeekBar slider=(android.widget.SeekBar)view;int[] xy=new int[2];slider.getLocationOnScreen(xy);gridGestureX=xy[0]+slider.getPaddingLeft()+(slider.getWidth()-slider.getPaddingLeft()-slider.getPaddingRight())*slider.getProgress()/slider.getMax();gridGestureY=xy[1]+slider.getHeight()/2f;found[0]=true;});require(found[0],"Actual native volume slider missing");
    gridGestureDown=SystemClock.uptimeMillis();require(getUiAutomation().injectInputEvent(MotionEvent.obtain(gridGestureDown,gridGestureDown,MotionEvent.ACTION_DOWN,gridGestureX,gridGestureY,0),true),"Owned grid DOWN was rejected");gridGestureX+=30*getTargetContext().getResources().getDisplayMetrics().density;
    require(getUiAutomation().injectInputEvent(MotionEvent.obtain(gridGestureDown,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,gridGestureX,gridGestureY,0),true),"Owned grid MOVE was rejected");Thread.sleep(150);
    require(((JSONObject)action("grid.state",new JSONObject())).getJSONArray("dragging").toString().contains("volume"),"An actual native slider drag must start before testing stale release");
  }
  private void endGridVolumeGesture(boolean cancel)throws Exception{if(gridGestureDown!=0){long down=gridGestureDown;gridGestureDown=0;require(getUiAutomation().injectInputEvent(MotionEvent.obtain(down,SystemClock.uptimeMillis(),cancel?MotionEvent.ACTION_CANCEL:MotionEvent.ACTION_UP,gridGestureX,gridGestureY,0),true),"Owned grid gesture release was rejected");}}
  private JSONObject checkGridContinuity(JSONObject before)throws Exception{
    // Real elapsed time without intermediate state reads or WebView timers.
    // No seek, audio-waterline experiment, mute or decoder replacement may
    // turn a stalled first frame into an apparent successful playback check.
    long started=SystemClock.elapsedRealtime();
    runOnMainSync(()->library.pauseTimers());try{Thread.sleep(5000);}finally{runOnMainSync(()->library.resumeTimers());}
    JSONObject after=(JSONObject)nativeCall("automation.grid.state",new JSONObject());long elapsed=SystemClock.elapsedRealtime()-started;
    JSONArray samples=new JSONArray();boolean advancing=elapsed>=5000&&elapsed<10000;
    for(int i=0;i<before.getJSONArray("cells").length();i++){
      JSONObject a=before.getJSONArray("cells").getJSONObject(i),b=after.getJSONArray("cells").getJSONObject(i);
      long position=b.getLong("positionMs")-a.getLong("positionMs"),frames=b.getLong("renderedFrames")-a.getLong("renderedFrames"),pts=b.getLong("frameTimeMs")-a.getLong("frameTimeMs");
      samples.put(new JSONObject().put("id",b.getString("id")).put("inputId",b.getLong("inputId")).put("positionDeltaMs",position).put("frameDelta",frames).put("frameTimeDeltaMs",pts));
      advancing&=a.getString("id").equals(b.getString("id"))&&a.getLong("inputId")==b.getLong("inputId")&&b.getBoolean("playing")&&!b.getBoolean("paused")&&b.isNull("error")&&position>=4000&&pts>=4000&&frames>=60;
    }
    step("grid continuity "+new JSONObject().put("elapsedMs",elapsed).put("samples",samples));
    if(!advancing){
      step("QA: grid-failure-audio-snapshot pid="+android.os.Process.myPid());android.util.Log.e("RHVideoQA",playbackThreads());
      // Failure-only control observation, not a second chance to pass. Timers
      // are already restored. Never seek/restart/retry or replace the failed
      // five-second sample with this later diagnostic interval.
      try{
        long controlStarted=SystemClock.elapsedRealtime();Thread.sleep(5000);
        JSONObject control=(JSONObject)nativeCall("automation.grid.state",new JSONObject());JSONArray controlSamples=new JSONArray();
        for(int i=0;i<after.getJSONArray("cells").length();i++){
          JSONObject a=after.getJSONArray("cells").getJSONObject(i),b=control.getJSONArray("cells").getJSONObject(i);
          controlSamples.put(new JSONObject().put("id",b.getString("id")).put("inputId",b.getLong("inputId")).put("sameInput",a.getLong("inputId")==b.getLong("inputId"))
            .put("positionDeltaMs",b.getLong("positionMs")-a.getLong("positionMs")).put("frameDelta",b.getLong("renderedFrames")-a.getLong("renderedFrames")));
        }
        step("grid active-timer failure control "+new JSONObject().put("elapsedMs",SystemClock.elapsedRealtime()-controlStarted).put("samples",controlSamples));
      }catch(Exception diagnosticError){step("grid active-timer failure control unavailable: "+diagnosticError.getClass().getSimpleName());}
    }
    require(advancing,"All grid inputs must advance real media time and render at least 60 new frames during five seconds without web timers: "+after);
    return after;
  }
  private JSONObject closeLibraryWithReceipt(boolean ui,String key)throws Exception{
    Activity producer=current;require(producer!=null&&producer.getClass().getSimpleName().equals("RhVideoActivity"),"Close the actual producing library");
    String action="rhvideo.back";JSONObject input=new JSONObject();
    if(ui){JSONObject button=(JSONObject)expression(library,"RHFilesAPI.invoke('ui.list',{limit:2000}).then(rows=>rows.find(row=>row.id==='library-back'&&row.visible))");require(button!=null,"The real visible Back button must have a UI API");action="ui.invoke";input.put("controlId",button.getString("controlId"));}
    String script="RHFilesAPI.run("+JSONObject.quote(action)+","+input+",{key:"+JSONObject.quote(key)+"})";
    // A self-closing producer need not survive long enough to acknowledge eval.
    // Send once; only the surviving main page's real RPC may prove completion.
    step("library close dispatch elapsedMs="+SystemClock.elapsedRealtime()+" ui="+ui);
    runOnMainSync(()->library.evaluateJavascript(script,null));long started=SystemClock.elapsedRealtime(),end=started+5000,lookupMs=0;int reads=0;JSONObject receipt=null;
    do{
      JSONObject query=new JSONObject().put("jsonrpc","2.0").put("id","close-qa").put("method","runs.lookup").put("params",new JSONObject().put("key",key));
      long queryStarted=SystemClock.elapsedRealtime();JSONObject reply=(JSONObject)expression(main,"RHFilesAPI.rpc("+query+")");lookupMs+=SystemClock.elapsedRealtime()-queryStarted;reads++;
      if(reply.has("result")){receipt=reply.getJSONObject("result");if(!receipt.getString("state").equals("running"))break;}
      else require(reply.getJSONObject("error").getJSONObject("data").getString("code").equals("RUN_NOT_FOUND"),"Do not hide a failed receipt lookup: "+reply);
      Thread.sleep(100);
    }while(SystemClock.elapsedRealtime()<end);
    step("library close observation "+new JSONObject().put("elapsedMs",SystemClock.elapsedRealtime()-started).put("lookupMs",lookupMs).put("reads",reads));
    require(receipt!=null&&receipt.getString("state").equals("succeeded")&&SystemClock.elapsedRealtime()-started<=5000,"The completed close must be retrieved within the original five-second budget: "+receipt);
    require(receipt.getString("action").equals(action)&&destroyedActivities.contains(producer)&&producer.isDestroyed(),"A sent finish or a disappearing WebView cannot manufacture completion");
    if(ui)require(receipt.getJSONObject("result").getString("controlId").equals(input.getString("controlId")),"UI close returns the original control result");else require(receipt.getBoolean("result"),"Semantic Back preserves its confirmed result");
    waitView("MainActivity");step("library close confirmed "+receipt);return receipt;
  }
  private void checkLibraryCloseReceipts(String server)throws Exception{
    String key="library-close-"+java.util.UUID.randomUUID();closeLibraryWithReceipt(false,key);
    nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");
    action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));action("category",new JSONObject().put("kind","video"));
    Activity reopened=current;
    JSONObject duplicate=(JSONObject)expression(library,"(()=>{const run=RHFilesAPI.run('rhvideo.back',{}, {key:"+JSONObject.quote(key)+"});return RHFilesAPI.rpc({jsonrpc:'2.0',id:'duplicate',method:'runs.wait',params:{runId:run.id,timeoutMs:1000}})})()");
    require(duplicate.getJSONObject("result").getString("state").equals("succeeded")&&!reopened.isFinishing()&&!reopened.isDestroyed()&&current==reopened,"An old completed request cannot close a newly opened library");
    closeLibraryWithReceipt(true,"library-ui-close-"+java.util.UUID.randomUUID());
  }
  private void checkSingleClockProbe()throws Exception{
    action("media.open",new JSONObject().put("kind","video").put("id","video-0"));
    long end=SystemClock.elapsedRealtime()+20000;JSONObject before=null;String lastError="none";
    do{try{before=(JSONObject)nativeCall("automation.media.state",new JSONObject());if(current!=null&&current.getClass().getSimpleName().equals("PlaybackActivity")&&before.optString("id").equals("video-0")&&before.optBoolean("playing")&&before.optBoolean("rendered")&&before.optLong("positionMs")>=500&&before.optLong("renderedFrames")>0)break;}catch(Exception error){lastError=error.toString();}Thread.sleep(100);}while(SystemClock.elapsedRealtime()<end);
    require(current!=null&&current.getClass().getSimpleName().equals("PlaybackActivity")&&!current.isFinishing()&&!current.isDestroyed()&&before!=null&&before.optString("id").equals("video-0")&&before.optBoolean("playing")&&before.optBoolean("rendered")&&before.optLong("positionMs")>=500,"Single clock needs the actual ordinary native player and decoded frames; last state error="+lastError);
    require(before.getInt("count")==1&&before.getDouble("rate")==1&&before.getDouble("volume")>0&&before.getDouble("decoderVolume")>0,"The control keeps a single real audio/video input at normal speed without muting");
    require(before.getLong("durationMs")==20000&&before.getLong("positionMs")<6000,"Start early in the same twenty-second source; do not seek/reset a stalled or late sample");
    require(before.getString("rotationRenderer").equals("surface-compositor")&&before.getBoolean("nativeLayerAttached")&&!before.getBoolean("rotationPipeline")&&before.getInt("rotation")==0,"Retain the product's actual unrotated native compositor");
    boolean audio=false,video=false;JSONArray groups=before.getJSONObject("tracks").getJSONArray("groups");
    for(int i=0;i<groups.length();i++){JSONObject group=groups.getJSONObject(i);JSONArray tracks=group.getJSONArray("tracks");for(int j=0;j<tracks.length();j++)if(tracks.getJSONObject(j).getBoolean("selected")){audio|=group.getString("type").equals("audio");video|=group.getString("type").equals("video");}}
    require(audio&&video,"A video-only or silent-track-removal experiment cannot pass this control");
    require(before.getLong("segmentStartMs")==0&&before.getLong("segmentEndMs")==-1&&before.getLong("queuePositionMs")==before.getLong("positionMs"),"The ordinary single input must report its real progress without an artificial clipping end");
    step("single timeline verified "+new JSONObject().put("positionMs",before.getLong("positionMs")).put("queuePositionMs",before.getLong("queuePositionMs")).put("segmentEndMs",before.getLong("segmentEndMs")));
    step("single clock settled "+before);
    long started=SystemClock.elapsedRealtime();runOnMainSync(()->library.pauseTimers());try{Thread.sleep(5000);}finally{runOnMainSync(()->library.resumeTimers());}
    JSONObject after=(JSONObject)nativeCall("automation.media.state",new JSONObject());long elapsed=SystemClock.elapsedRealtime()-started;
    long position=after.getLong("positionMs")-before.getLong("positionMs"),frames=after.getLong("renderedFrames")-before.getLong("renderedFrames");
    boolean advancing=elapsed>=5000&&elapsed<10000&&position>=4000&&frames>=60&&after.getBoolean("playing")&&after.isNull("error")&&before.getLong("inputId")==after.getLong("inputId")&&before.getString("path").equals(after.getString("path"))&&after.getDouble("rate")==1;
    step("single clock continuity "+new JSONObject().put("elapsedMs",elapsed).put("positionDeltaMs",position).put("frameDelta",frames).put("sameInput",before.getLong("inputId")==after.getLong("inputId")));
    if(!advancing){step("QA: player-failure-audio-snapshot pid="+android.os.Process.myPid());android.util.Log.e("RHVideoQA",playbackThreads());}
    require(advancing,"Ordinary single playback must advance real media time and render at least 60 new frames during five seconds without web timers: "+after);
    action("player.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private void checkGridSurfaceProbe()throws Exception{
    require(args.getString("audioStartMs","0").equals("0")&&args.getString("codecMode","default").equals("default"),"The surface control must not mix audio or codec experiments");
    action("gallery.open",new JSONObject());action("grid.open",new JSONObject());
    checkGridContinuity(waitGrid(3,false));
    action("grid.close",new JSONObject());
  }
  private void checkReferenceGrid()throws Exception{
    require(((JSONObject)action("preferences.state",new JSONObject())).getInt("gridCount")==0,"Android must default to reference automatic grouping");
    action("gallery.open",new JSONObject());action("grid.open",new JSONObject());JSONObject first=checkGridContinuity(waitGrid(3,false));
    require(first.getInt("total")==6&&first.getInt("groupTotal")==2,"Grid pool must contain only the six gallery videos, not the 52-item list");
    require(gridIds(first).toString().equals("[\"video-0\",\"video-1\",\"video-2\"]"),"Native grid must preserve gallery order: "+first);
    JSONArray firstIds=gridIds(first);String lease=first.getString("lease");
    require(first.getString("engine").equals("Media3")&&first.getBoolean("nativeSurface"),"Use actual native players, not an HTML grid");
    JSONArray currentInputs=new JSONArray();for(int i=0;i<first.getJSONArray("cells").length();i++)currentInputs.put(first.getJSONArray("cells").getJSONObject(i).getLong("inputId"));
    mainAction("native.grid.control",new JSONObject().put("target",0).put("command","volume").put("value",100).put("expectedInput",currentInputs.getLong(0)).put("expectedInputs",currentInputs).put("expectedOffset",0).put("expectedLease",lease));
    require(((JSONObject)mainAction("native.grid.control",new JSONObject().put("command","controls").put("enabled",true))).getBoolean("controlsExpanded"),"Playback adjustment disclosure must have a typed public API");mainAction("native.grid.control",new JSONObject().put("command","controls").put("enabled",false));
    for(int i=0;i<3;i++){JSONObject cell=first.getJSONArray("cells").getJSONObject(i);require(cell.getInt("volume")==100&&!cell.getBoolean("muted")&&cell.getBoolean("repeat"),"Every cell starts audible and repeats normal EOF");}
    require(first.getJSONArray("cells").getJSONObject(2).getJSONArray("rect").getDouble(2)==1.0,"Mixed proportions require a spanning row, not a square grid");
    require(first.getJSONArray("cells").getJSONObject(2).getJSONArray("surfaceBounds").getInt(2)>first.getJSONArray("cells").getJSONObject(0).getJSONArray("surfaceBounds").getInt(2)*1.8,"Actual native child bounds must apply the spanning layout");
    require(Boolean.TRUE.equals(expression(library,"['rhvideo.grid.favorite','rhvideo.grid.mark'].every(id=>RHFilesAPI.list().some(action=>action.id===id))")),"Native mobile operations cannot disappear from the shared public API");
    clickNativeLabel("视频 1 · 加入收藏");waitGridFavorite(0,true,false);clickNativeLabel("视频 1 · 取消收藏");waitGridFavorite(0,false,false);
    clickNativeLabel("视频 2 · 标记暂存");require(((JSONObject)action("grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1).getBoolean("marked"),"Actual native mark button must use the public operation");
    action("grid.mark",new JSONObject().put("target",1).put("expectedInput",first.getJSONArray("cells").getJSONObject(1).getLong("inputId")).put("enabled",false));require(!((JSONObject)action("grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1).getBoolean("marked"),"Explicit unmark is the same state as the visible button");
    gridControl(-1,"pause",0);gridControl(0,"seek",5000);gridControl(0,"volume",37);gridControl(0,"mute",0);gridControl(0,"rate",1.5);
    JSONObject before=waitGrid(3,true);require(before.getJSONArray("cells").getJSONObject(0).getLong("positionMs")>=4900,"Paused native seek must reach the requested target");
    gridControl(0,"target",0);mainAction("native.grid.control",new JSONObject().put("command","controls").put("enabled",true));beginGridVolumeGesture();
    JSONObject other=gridControl(-1,"page",1);require(other.getInt("offset")==3,"Variable group boundary");waitGrid(3,false);
    require(Boolean.TRUE.equals(expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke('native.grid.control',{command:'volume',target:0,value:99,expectedOffset:0,expectedLease:"+JSONObject.quote(lease)+"}).then(()=>false,()=>true)")),"A late slider must not change the next group");
    // A different, later prepared single-video queue must not erase this grid.
    expression(library,"RHVideoNative.request('playlist.prepare',{ticket:'owned-single-qa',reset:true,items:[{id:'video-7',title:'independent queue'}],options:{fullLength:true}})");
    gridControl(-1,"page",-1);JSONObject restored=waitGrid(3,true);require(gridIds(restored).toString().equals(firstIds.toString()),"Restored group order");JSONObject cell=restored.getJSONArray("cells").getJSONObject(0);
    require(restored.getJSONArray("dragging").toString().contains("volume"),"The actual finger gesture must remain held across A -> B -> A, not silently cancel before release");
    endGridVolumeGesture(false);Thread.sleep(200);restored=(JSONObject)action("grid.state",new JSONObject());cell=restored.getJSONArray("cells").getJSONObject(0);mainAction("native.grid.control",new JSONObject().put("command","controls").put("enabled",false));
    require(restored.getJSONArray("dragging").length()==0,"Native slider release must actually complete the held gesture");step("actual slider A -> B -> A release checked against original decoder inputs");
    long staleInput=before.getJSONArray("cells").getJSONObject(0).getLong("inputId");require(cell.getLong("inputId")!=staleInput,"A -> B -> A must allocate a new actual decoder");
    require(Boolean.TRUE.equals(expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke('native.grid.control',{command:'volume',target:0,value:99,expectedOffset:0,expectedLease:"+JSONObject.quote(lease)+",expectedInput:"+staleInput+"}).then(()=>false,()=>true)")),"Same offset and lease cannot resurrect a stale input after A -> B -> A");
    require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.grid.mark',{target:0,expectedInput:"+staleInput+"}).then(()=>false,()=>true)")),"A stale preview mark cannot target the replacement decoder");require(!((JSONObject)action("grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(0).getBoolean("marked"),"Rejected marks cannot change current state");
    require(Math.abs(cell.getLong("positionMs")-5000)<500&&cell.getInt("volume")==37&&cell.getBoolean("muted")&&cell.getDouble("decoderVolume")==0&&Math.abs(cell.getDouble("rate")-1.5)<.01,"Per-cell pause/time/volume/mute/speed must survive group changes: "+cell);
    if("grid-restore".equals(args.getString("mode"))){screenshot("rhvideo-grid-restore-qa.png");action("grid.close",new JSONObject());library=waitView("RhVideoActivity");return;}
    gridControl(1,"expand",0);require(!((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1).getBoolean("paused"),"Expanding a paused cell resumes it");nativeCall("automation.back",new JSONObject());require(((JSONObject)nativeCall("automation.grid.state",new JSONObject())).isNull("expanded"),"First back shrinks the expanded cell");gridControl(-1,"pause",0);
    JSONArray rotationInputs=gridInputs((JSONObject)nativeCall("automation.grid.state",new JSONObject()));
    require(getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_90),"Owned landscape rotation request must be accepted");restored=waitGrid(3,true,android.content.res.Configuration.ORIENTATION_LANDSCAPE);require(restored.getString("lease").equals(lease)&&gridIds(restored).toString().equals(firstIds.toString()),"Rotation keeps the same native grid session");require(gridInputs(restored).toString().equals(rotationInputs.toString()),"Ordinary landscape resizing must not recreate decoders or download from a previous keyframe");screenshot("rhvideo-grid-landscape-qa.png");require(getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_0),"Owned portrait rotation request must be accepted");restored=waitGrid(3,true,android.content.res.Configuration.ORIENTATION_PORTRAIT);require(gridInputs(restored).toString().equals(rotationInputs.toString()),"Returning to portrait must retain each actual decoder");screenshot("rhvideo-grid-portrait-qa.png");
    long input=restored.getJSONArray("cells").getJSONObject(1).getLong("inputId"),frames=restored.getJSONArray("cells").getJSONObject(1).getLong("submittedFrames");
    gridControl(1,"seek",19500);long end=System.currentTimeMillis()+25000;boolean seekReady=false;
    do{cell=((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1);if(cell.getInt("playbackState")==3&&cell.getBoolean("paused")&&cell.getLong("renderedFrames")>0&&cell.getLong("submittedFrames")>frames&&cell.getLong("positionMs")>=19400){seekReady=true;break;}Thread.sleep(150);}while(System.currentTimeMillis()<end);require(seekReady,"Actual paused near-EOF frame must be ready before the loop check: "+cell);
    gridControl(1,"resume",0);end=System.currentTimeMillis()+8000;boolean looped=false;do{cell=((JSONObject)nativeCall("automation.grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(1);require(cell.getLong("inputId")==input,"EOF cannot replace the native player");if(cell.getLong("positionMs")<8000&&!cell.getBoolean("paused")){looped=true;break;}Thread.sleep(150);}while(System.currentTimeMillis()<end);require(looped,"Normal EOF must repeat inside the same grid cell: "+cell);gridControl(-1,"pause",0);getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);
    gridControl(-1,"page",1);waitGrid(3,false);action("grid.close",new JSONObject());library=waitView("RhVideoActivity");action("grid.open",new JSONObject());JSONObject reopened=waitGrid(3,false);
    require(reopened.getInt("offset")==3&&!reopened.getString("lease").equals(lease),"Reopen restores only the exact group, with a new session");
    for(int i=0;i<3;i++){cell=reopened.getJSONArray("cells").getJSONObject(i);require(cell.getInt("volume")==100&&!cell.getBoolean("muted")&&cell.getDouble("rate")==1,"Fresh viewer resets cell controls");}
    action("grid.seekGroup",new JSONObject().put("ratio",0));require(waitGrid(3,false).getInt("offset")==0,"Shared public group seek reaches the first group");action("grid.seekGroup",new JSONObject().put("ratio",1));waitGrid(3,false);
    action("grid.favorite",new JSONObject().put("target",0));waitGridFavorite(0,false,true);screenshot("rhvideo-grid-favorite-error-qa.png");
    action("grid.mark",new JSONObject().put("target",2).put("enabled",true));require(((JSONObject)action("grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(2).getBoolean("marked"),"Last visible cell can be marked through the shared API");
    screenshot("rhvideo-grid-qa.png");action("grid.close",new JSONObject());library=waitView("RhVideoActivity");JSONObject committed=waitPreviewResult();require(committed.getInt("completed")==1&&committed.getJSONArray("items").getJSONObject(0).getBoolean("success"),"Closing grid consumes exactly its pending preview mark");action("grid.close",new JSONObject());require(((JSONObject)action("preview.state",new JSONObject())).getLong("run")==committed.getLong("run"),"Repeated grid close cannot start another write run");
    action("preferences.set",new JSONObject().put("key","gridCount").put("value",2));action("grid.open",new JSONObject());waitGrid(2,false);action("grid.mark",new JSONObject().put("target",0).put("enabled",true));
    action("connection.logout",new JSONObject());library=waitView("RhVideoActivity");action("connection.connect",new JSONObject().put("server",args.getString("server")).put("username","preview").put("password","fixture-only"));
    require(((JSONObject)action("preview.pending",new JSONObject())).getJSONArray("items").length()==0,"Logging out of an active grid discards old uncommitted marks instead of submitting them");
    require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.grid.state').then(()=>false,()=>true)")),"An account switch must really close the old native viewer, not merely reject its buttons");
  }
  private void checkFailedGrid()throws Exception{
    String server=args.getString("failureServer");require(ownedFixtureServer(server),"Only the explicit owned-emulator failure fixture transport is allowed");
    action("connection.logout",new JSONObject());action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));action("grid.open",new JSONObject());
    long end=System.currentTimeMillis()+20000;JSONObject grid=null;boolean failed=false;
    do{try{grid=(JSONObject)nativeCall("automation.grid.state",new JSONObject());JSONArray cells=grid.getJSONArray("cells");failed=cells.length()==2;for(int i=0;i<cells.length();i++)failed&=!cells.getJSONObject(i).isNull("error")&&!cells.getJSONObject(i).optBoolean("rendered");if(failed)break;}catch(Exception ignored){}Thread.sleep(200);}while(System.currentTimeMillis()<end);
    require(failed,"Both HTTP failures must settle visibly without a synthetic success frame: "+grid);Thread.sleep(2000);screenshot("rhvideo-grid-error-qa.png");action("grid.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private JSONObject waitPlayer(String id,boolean playing)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject state=null;
    do{try{state=(JSONObject)action("player.state",new JSONObject());if((id==null||id.equals(state.optString("id")))&&state.optBoolean("rendered")&&state.optInt("playbackState")==3&&state.optLong("renderedFrames")>0&&state.optBoolean("playing")==playing&&(!playing||(state.optLong("positionMs")>250&&state.optLong("renderedFrames")>1)))return state;}catch(Exception ignored){}Thread.sleep(150);}while(System.currentTimeMillis()<end);
    throw new Exception("Native reference player did not settle: "+state);
  }
  private void waitFavoritePicture(String id,int index)throws Exception{
    library=waitView("RhVideoActivity");long end=System.currentTimeMillis()+15000;JSONObject state=null;
    do{state=(JSONObject)action("image.state",new JSONObject());if(state.getBoolean("opened")&&!state.getBoolean("loading")&&state.getInt("total")==4&&state.getInt("index")==index&&id.equals(state.getJSONObject("current").getString("id")))return;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Favorite picture did not settle: "+state);
  }
  private void dragFavoriteProgress(double ratio)throws Exception{
    action("player.control",new JSONObject().put("command","controls.show"));int[] point=new int[4];boolean[] found={false};
    runOnMainSync(()->{View view=described(current.getWindow().getDecorView(),"收藏浏览位置");if(!(view instanceof android.widget.SeekBar))return;android.widget.SeekBar bar=(android.widget.SeekBar)view;int[] xy=new int[2];bar.getLocationOnScreen(xy);int width=bar.getWidth()-bar.getPaddingLeft()-bar.getPaddingRight();point[0]=xy[0]+bar.getPaddingLeft()+(int)(width*(bar.getProgress()/(double)bar.getMax()));point[1]=xy[1]+bar.getHeight()/2;point[2]=xy[0]+bar.getPaddingLeft()+(int)(width*ratio);point[3]=point[1];found[0]=true;});require(found[0],"Actual native favorite collection slider is missing");
    long down=SystemClock.uptimeMillis();require(getUiAutomation().injectInputEvent(MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,point[0],point[1],0),true),"Favorite slider DOWN rejected");require(getUiAutomation().injectInputEvent(MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,point[2],point[3],0),true),"Favorite slider MOVE rejected");require(getUiAutomation().injectInputEvent(MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,point[2],point[3],0),true),"Favorite slider UP rejected");
  }
  private void checkFavoriteMixedBrowse()throws Exception{
    action("preferences.set",new JSONObject().put("key","sort").put("value","nameAsc"));JSONObject listed=(JSONObject)action("category",new JSONObject().put("kind","favorite"));require(listed.getInt("total")==5,"Owned fixture contains two pictures, two videos and one novel");
    JSONArray rows=new JSONArray();for(int i=0;i<listed.getJSONArray("items").length();i++){JSONObject row=listed.getJSONArray("items").getJSONObject(i);if(!"novel".equals(row.getString("kind")))rows.put(row);}require(rows.length()==4,"A novel is not part of mixed media browsing");
    int picture=-1,movie=-1;for(int i=0;i<rows.length();i++)if("picture".equals(rows.getJSONObject(i).getString("kind"))){if(picture<0)picture=i;}else if(movie<0)movie=i;
    require(picture>=0&&movie>=0,"The mixed collection has both kinds");String pictureId=rows.getJSONObject(picture).getString("id"),movieId=rows.getJSONObject(movie).getString("id");
    action("media.open",new JSONObject().put("kind","picture").put("id",pictureId));waitFavoritePicture(pictureId,picture);assertPreviewPixels("#image-dialog #full-image","rhvideo-favorite-picture-qa.png");
    action("image.seek",new JSONObject().put("ratio",movie/3.0));JSONObject first=waitPlayer(movieId,true);require("favorite".equals(first.getJSONObject("options").getString("origin"))&&first.getJSONObject("options").getInt("parentTotal")==4&&first.getJSONObject("options").getInt("parentIndex")==movie,"Native video belongs to the same mixed favorite snapshot, not the screenshot gallery");
    JSONObject oldOptions=first.getJSONObject("options");action("player.favorite",new JSONObject().put("expectedInputId",first.getLong("inputId")));long end=System.currentTimeMillis()+10000;JSONObject favorite;
    do{favorite=(JSONObject)action("player.state",new JSONObject());if(!favorite.optBoolean("favoriteBusy")&&!favorite.optBoolean("favorite"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(!favorite.optBoolean("favoriteBusy")&&!favorite.optBoolean("favorite"),"Native favorite removal must finish");
    action("player.control",new JSONObject().put("command","controls.show"));screenshot("rhvideo-favorite-video-qa.png");dragFavoriteProgress(picture/3.0);waitFavoritePicture(pictureId,picture);assertPreviewPixels("#image-dialog #full-image","rhvideo-favorite-picture-qa.png");
    action("image.seek",new JSONObject().put("ratio",movie/3.0));first=waitPlayer(movieId,true);require(!first.getBoolean("favorite"),"Removed favorites remain reachable in the opening snapshot without being starred");
    int next=(movie+1)%4;action("player.next",new JSONObject());if("picture".equals(rows.getJSONObject(next).getString("kind")))waitFavoritePicture(rows.getJSONObject(next).getString("id"),next);else waitPlayer(rows.getJSONObject(next).getString("id"),true);
    action("image.seek",new JSONObject().put("ratio",movie/3.0));waitPlayer(movieId,true);action("player.back",new JSONObject());library=waitView("RhVideoActivity");end=System.currentTimeMillis()+10000;while(((JSONObject)action("image.state",new JSONObject())).getBoolean("opened")&&System.currentTimeMillis()<end)Thread.sleep(100);require(!((JSONObject)action("image.state",new JSONObject())).getBoolean("opened"),"Back must close ordinary favorite browsing rather than replay the same video");
    String other=null;for(int i=0;i<rows.length();i++)if("video".equals(rows.getJSONObject(i).getString("kind"))&&!movieId.equals(rows.getJSONObject(i).getString("id")))other=rows.getJSONObject(i).getString("id");require(other!=null,"Another favorite video is available");action("media.open",new JSONObject().put("kind","video").put("id",other));JSONObject direct=waitPlayer(other,true);require("favorite".equals(direct.getJSONObject("options").getString("origin")),"A video card must open its favorite queue, not borrow a screenshot parent");
    JSONObject retired=(JSONObject)mediaNative("player.closeParent",new JSONObject().put("parentPreview",oldOptions.getString("parentPreview")).put("parentPlayback",oldOptions.getString("parentPlayback")));require(!retired.getBoolean("closed"),"A delayed close from an old favorite preview cannot retire the new input");require(((JSONObject)action("player.state",new JSONObject())).getLong("inputId")==direct.getLong("inputId"),"Old parent cleanup cannot replace the new decoder");action("player.back",new JSONObject());library=waitView("RhVideoActivity");
    end=System.currentTimeMillis()+10000;while(((JSONObject)action("image.state",new JSONObject())).getBoolean("opened")&&System.currentTimeMillis()<end)Thread.sleep(100);require(!((JSONObject)action("image.state",new JSONObject())).getBoolean("opened"),"The direct favorite card also returns to the list");
    action("browse.mode",new JSONObject().put("mode","strip"));JSONObject browse=(JSONObject)action("image.state",new JSONObject());require(browse.getBoolean("opened")&&browse.getInt("total")==3&&"picture".equals(browse.getJSONObject("current").getString("kind")),"The favorite continuous-browse entry must use the mixed collection, not a picture-only strip");require(!((JSONObject)action("viewer.state",new JSONObject())).getBoolean("opened"),"Favorite browsing is not the picture strip surface");assertPreviewPixels("#image-dialog #full-image","rhvideo-favorite-picture-qa.png");action("image.close",new JSONObject());
    require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"New favorite controls have public APIs");
  }
  private float[] webStripPoint(String selector,double x,double y)throws Exception{
    JSONObject rect=(JSONObject)expression(library,"(()=>{for(const n of document.querySelectorAll("+JSONObject.quote(selector)+")){const r=n.getBoundingClientRect(),p=n.closest('.wb-strip-row')?.getBoundingClientRect()||{x:0,y:0,right:innerWidth,bottom:innerHeight},x=Math.max(0,r.x,p.x),y=Math.max(0,r.y,p.y),right=Math.min(innerWidth,r.right,p.right),bottom=Math.min(innerHeight,r.bottom,p.bottom);if(right>x&&bottom>y)return {x,y,w:right-x,h:bottom-y,viewport:innerWidth};}throw Error('Actual strip target is not visible');})()");int[] web={0,0,0};runOnMainSync(()->{library.getLocationOnScreen(web);web[2]=library.getWidth();});double scale=web[2]/rect.getDouble("viewport");return new float[]{(float)(web[0]+(rect.getDouble("x")+rect.getDouble("w")*x)*scale),(float)(web[1]+(rect.getDouble("y")+rect.getDouble("h")*y)*scale)};
  }
  private void touchStrip(String selector,boolean drag)throws Exception{
    float[] from=webStripPoint(selector,drag?.8:.5,.5),to=drag?webStripPoint(selector,.2,.5):from;long down=SystemClock.uptimeMillis();require(getUiAutomation().injectInputEvent(MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,from[0],from[1],0),true),"Strip touch DOWN rejected");
    if(drag)for(int i=1;i<=6;i++){Thread.sleep(25);require(getUiAutomation().injectInputEvent(MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,from[0]+(to[0]-from[0])*i/6,from[1],0),true),"Strip touch MOVE rejected");}
    else Thread.sleep(40);
    require(getUiAutomation().injectInputEvent(MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,to[0],to[1],0),true),"Strip touch UP rejected");
  }
  private void waitStripViewport(boolean wide)throws Exception{
    long end=System.currentTimeMillis()+10000;JSONObject box=null;
    do{box=(JSONObject)expression(library,"(()=>{const s=document.querySelector('.wb-viewer-surface').getBoundingClientRect();return {wide:innerWidth>innerHeight,rows:[...document.querySelectorAll('.wb-strip-row')].map(row=>{const r=row.getBoundingClientRect();return {w:r.width,h:r.height};}),w:s.width,h:s.height};})()");JSONArray rows=box.getJSONArray("rows");if(box.getBoolean("wide")==wide&&rows.length()==2&&Math.abs(rows.getJSONObject(0).getDouble("h")-box.getDouble("h")/2)<2&&Math.abs(rows.getJSONObject(1).getDouble("w")-box.getDouble("w"))<2)return;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Actual strip viewport did not reflow after rotation: "+box);
  }
  private void checkReferenceStrip()throws Exception{
    getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_0);
    try{
    action("category",new JSONObject().put("kind","picture"));action("preferences.set",new JSONObject().put("key","vertical").put("value",true));action("preferences.set",new JSONObject().put("key","lanes").put("value",2));action("preferences.set",new JSONObject().put("key","scrollSpeed").put("value",2000));
    action("viewer.open",new JSONObject().put("mode","strip").put("source","picture"));require(!((JSONObject)action("viewer.state",new JSONObject())).getBoolean("running"),"The original picture strip opens paused until the user starts it");require(Boolean.TRUE.equals(expression(library,"Number(document.getElementById('wb-strip-speed').value)===2000")),"The visible speed range must not silently clamp the saved 10x value to its browser default");action("preferences.set",new JSONObject().put("key","scrollSpeed").put("value",400));require(Boolean.TRUE.equals(expression(library,"Number(document.getElementById('wb-strip-speed').value)===400")),"API/settings speed changes also repaint the range");action("preferences.set",new JSONObject().put("key","scrollSpeed").put("value",2000));double maximum=((JSONObject)action("viewer.state",new JSONObject())).getJSONArray("rows").getJSONObject(0).getDouble("maximum");action("viewer.seek",new JSONObject().put("ratio",(maximum-200)/maximum));action("viewer.toggle",new JSONObject());long end=System.currentTimeMillis()+8000;JSONObject state=null;
    do{state=(JSONObject)action("viewer.state",new JSONObject());if(!state.getBoolean("running")&&state.getDouble("ratio")>.99)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(!state.getBoolean("running")&&state.getDouble("ratio")>.99&&state.getInt("lanes")==1,"The actual vertical strip stops at the bottom and stays a full-width single column: "+state);require(Boolean.TRUE.equals(expression(library,"document.getElementById('wb-viewer-lanes').hidden")),"Vertical mode cannot offer an ineffective double-row control");
    action("viewer.direction",new JSONObject());state=(JSONObject)action("viewer.state",new JSONObject());long token=state.getLong("token");require(!state.getBoolean("vertical")&&!state.getBoolean("running")&&state.getJSONArray("rows").length()==2,"Direction restores the independent horizontal row layout without starting auto scroll");
    touchStrip(".wb-strip-row:first-child",true);end=System.currentTimeMillis()+8000;
    do{state=(JSONObject)action("viewer.state",new JSONObject());if(state.getJSONArray("rows").getJSONObject(0).getDouble("position")>20)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);JSONArray rows=state.getJSONArray("rows");double ratio=rows.getJSONObject(0).getDouble("position")/rows.getJSONObject(0).getDouble("maximum");require(!state.getBoolean("running")&&ratio>0&&Math.abs(rows.getJSONObject(1).getDouble("position")-ratio*rows.getJSONObject(1).getDouble("maximum"))<15,"A real horizontal touch scroll pauses and proportionally links both rows: "+state);
    action("viewer.seek",new JSONObject().put("ratio",0));Thread.sleep(250);touchStrip(".wb-strip-row:first-child .wb-strip-tile",false);end=System.currentTimeMillis()+5000;do{state=(JSONObject)action("viewer.state",new JSONObject());if(state.optJSONObject("current")!=null)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(state.optJSONObject("current")!=null,"The actual image touch must select a strip source");String id=state.getJSONObject("current").getString("id"),key="picture:"+id;
    touchStrip("#wb-viewer-favorite",false);end=System.currentTimeMillis()+10000;
    do{state=(JSONObject)action("viewer.state",new JSONObject());if(state.optBoolean("favorite"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(state.optBoolean("favorite"),"The actual star must favorite the selected source, not another visible tile");
    action("viewer.inspect",new JSONObject().put("key",key).put("expectedViewer",token));assertPreviewPixels("#wb-image-preview img","rhvideo-strip-picture-qa.png");action("panel.close",new JSONObject().put("id","wb-image-preview"));require(!((JSONObject)action("viewer.state",new JSONObject())).getBoolean("running"),"Enlarging a strip image leaves the strip paused");
    getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_90);waitStripViewport(true);state=(JSONObject)action("viewer.state",new JSONObject());require(state.getLong("token")==token&&state.getInt("lanes")==2&&id.equals(state.getJSONObject("current").getString("id")),"Resize/rotation keeps the exact strip snapshot and selected source");getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_0);waitStripViewport(false);screenshot("rhvideo-strip-rows-qa.png");
    touchStrip("#wb-viewer-shuffle",false);end=System.currentTimeMillis()+8000;do{state=(JSONObject)action("viewer.state",new JSONObject());if(state.getJSONObject("order").getBoolean("random"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(state.getJSONObject("order").getBoolean("random")&&!state.getBoolean("running")&&id.equals(state.getJSONObject("current").getString("id")),"Actual shuffle touch persists an order without changing the selected source");String shuffled=((JSONObject)action("viewer.items",new JSONObject())).getJSONArray("items").toString();action("viewer.scroll",new JSONObject().put("delta",100));double remembered=((JSONObject)action("viewer.state",new JSONObject())).getJSONArray("rows").getJSONObject(0).getDouble("position");action("panel.close",new JSONObject().put("id","wb-viewer"));action("preferences.flush",new JSONObject());
    action("viewer.open",new JSONObject().put("mode","slideshow").put("source","picture"));require(shuffled.equals(((JSONObject)action("viewer.items",new JSONObject())).getJSONArray("items").toString()),"Picture slideshow shares the persisted reference picture order");action("panel.close",new JSONObject().put("id","wb-viewer"));action("viewer.open",new JSONObject().put("mode","strip").put("source","picture"));state=(JSONObject)action("viewer.state",new JSONObject());boolean sameOrder=shuffled.equals(((JSONObject)action("viewer.items",new JSONObject())).getJSONArray("items").toString());double expectedPosition=Math.min(remembered,state.getJSONArray("rows").getJSONObject(0).getDouble("maximum"));require(sameOrder&&Math.abs(state.getJSONArray("rows").getJSONObject(0).getDouble("position")-expectedPosition)<3,"Reopening restores the exact saved IDs and actual row position: sameOrder="+sameOrder+", remembered="+remembered+", expected="+expectedPosition+", actual="+state+", resume="+((JSONObject)action("preferences.state",new JSONObject())).opt("viewerResume"));token=state.getLong("token");action("viewer.select",new JSONObject().put("key",key).put("expectedViewer",token));
    action("selection.markCurrent",new JSONObject().put("expectedViewer",token));action("panel.close",new JSONObject().put("id","wb-viewer"));JSONObject result=waitPreviewResult();require(result.getInt("completed")==1,"Closing the parent consumes its selected mark once");
    action("viewer.open",new JSONObject().put("mode","strip").put("source","picture"));require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.viewer.select',"+new JSONObject().put("key",key).put("expectedViewer",token)+").then(()=>false,error=>String(error).includes('窗口已改变'))")),"A delayed old strip selection cannot change the replacement viewer");touchStrip("#wb-viewer-restore",false);end=System.currentTimeMillis()+8000;do{state=(JSONObject)action("viewer.state",new JSONObject());if(!state.getJSONObject("order").getBoolean("random"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(!state.getJSONObject("order").getBoolean("random"),"Actual restore touch clears the saved picture permutation");require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"Every new strip control has a public API");action("panel.close",new JSONObject().put("id","wb-viewer"));
    }finally{getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);}
  }
  private void checkReferenceRotation()throws Exception{
    action("rotation.set",new JSONObject().put("enabled",false));action("playlist.sequential",new JSONObject());waitPlayer("video-0",true);
    action("player.control",new JSONObject().put("command","fullscreen").put("enabled",true));
    long end=System.currentTimeMillis()+15000;JSONObject state=null;do{state=(JSONObject)action("player.state",new JSONObject());if(state.optInt("viewportWidth")>state.optInt("viewportHeight"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    require(state.getInt("viewportWidth")>state.getInt("viewportHeight"),"Native rotation test must have a real wide viewport");
    action("player.control",new JSONObject().put("command","rate").put("value",1.5));action("player.control",new JSONObject().put("command","volume").put("value",37));action("player.control",new JSONObject().put("command","pause"));long frames=((JSONObject)action("player.state",new JSONObject())).getLong("renderedFrames");action("player.control",new JSONObject().put("command","seek").put("value",5000));state=waitPausedPlayerFrame("video-0",5000,frames);long input=state.getLong("inputId");
    action("player.control",new JSONObject().put("command","controls.hide"));assertRotationPixels(0);
    state=(JSONObject)action("player.rotate",new JSONObject());require(state.getBoolean("autoRotate")&&state.getInt("rotation")==90,"A portrait source in a wide viewport rotates once, not through four angles");require(state.getString("surfaceType").equals("SurfaceView"),"Keep the native SurfaceView output, not a default TextureView downgrade");require(state.getLong("inputId")==input&&!state.getBoolean("playWhenReady")&&Math.abs(state.getLong("positionMs")-5000)<250&&Math.abs(state.getDouble("rate")-1.5)<.01,"Rotation must retain the media input/session, paused time and speed: "+state);
    action("player.control",new JSONObject().put("command","controls.hide"));assertRotationPixels(90);state=(JSONObject)action("player.state",new JSONObject());require(state.getLong("inputId")==input&&Math.abs(state.getDouble("volume")-37)<.01&&Math.abs(state.getDouble("decoderVolume")-7.4)<.02,"Actual rotated output retains input identity and local/master gain: "+state);screenshot("rhvideo-rotation-on-qa.png");
    require("surface-compositor".equals(state.getString("rotationRenderer"))&&!state.getBoolean("rotationPipeline"),"Android 10+ must rotate existing native buffers, not recreate a filtered decoder");
    // The reference resize callback refits the already chosen angle. It does
    // not call shouldRotate again until a new video or explicit toggle.
    for(boolean wide:new boolean[]{false,true}){
      action("player.control",new JSONObject().put("command","fullscreen").put("enabled",wide));getUiAutomation().setRotation(wide?UiAutomation.ROTATION_FREEZE_90:UiAutomation.ROTATION_FREEZE_0);
      end=System.currentTimeMillis()+10000;do{state=(JSONObject)action("player.state",new JSONObject());if((state.getInt("viewportWidth")>state.getInt("viewportHeight"))==wide)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);
      require((state.getInt("viewportWidth")>state.getInt("viewportHeight"))==wide&&state.getLong("inputId")==input&&state.getInt("rotation")==90&&!state.getBoolean("playWhenReady")&&Math.abs(state.getLong("positionMs")-5000)<250&&Math.abs(state.getDouble("rate")-1.5)<.01,"Viewport resize must refit without replacing the paused source or reselecting its angle: "+state);
      action("player.control",new JSONObject().put("command","controls.hide"));assertRotationPixels(90);
    }
      long rendered=state.getLong("renderedFrames");action("player.control",new JSONObject().put("command","resume"));end=System.currentTimeMillis()+8000;do{state=(JSONObject)action("player.state",new JSONObject());if(state.getLong("renderedFrames")>rendered+4)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(state.getLong("renderedFrames")>rendered+4,"Rotated playback must continue to render new buffers");assertRotationPixels(90);action("player.control",new JSONObject().put("command","pause"));frames=((JSONObject)action("player.state",new JSONObject())).getLong("renderedFrames");action("player.control",new JSONObject().put("command","seek").put("value",5000));waitPausedPlayerFrame("video-0",5000,frames);
    action("player.control",new JSONObject().put("command","options"));clickPlayerText("智能旋转");state=(JSONObject)action("player.state",new JSONObject());require(!state.getBoolean("autoRotate")&&state.getInt("rotation")==0&&state.getLong("inputId")==input,"Actual native More menu turns rotation OFF, not 180 degrees: "+state);action("player.control",new JSONObject().put("command","controls.hide"));assertRotationPixels(0);screenshot("rhvideo-rotation-off-qa.png");
    action("player.rotate",new JSONObject());action("player.next",new JSONObject());waitPlayer("video-1",true);action("player.next",new JSONObject());state=waitPlayer("video-2",true);require(state.getBoolean("autoRotate")&&state.getInt("rotation")==0,"An already-fitting landscape source cannot inherit the prior portrait angle");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    JSONObject old=(JSONObject)mediaNative("preferences",new JSONObject());old.put("autoRotate",false);mediaNative("preferences",new JSONObject().put("value",old));require(((JSONObject)action("rotation.state",new JSONObject())).getBoolean("enabled"),"A stale library settings save cannot overwrite a newer player choice");
    action("connection.logout",new JSONObject());action("connection.connect",new JSONObject().put("server",args.getString("server")).put("username","preview").put("password","fixture-only"));require(((JSONObject)action("rotation.state",new JSONObject())).getBoolean("enabled"),"Same-account rotation switch persists across login");action("media.open",new JSONObject().put("kind","video").put("id","video-0"));state=waitPlayer("video-0",true);require(state.getBoolean("autoRotate"),"Reopened native player uses the canonical account preference");
    require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.player.rotate',{expectedInputId:"+input+"}).then(()=>false,error=>String(error).includes('播放输入已改变'))")),"An old menu/input cannot turn off a newer viewer");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("connection.logout",new JSONObject());action("connection.connect",new JSONObject().put("server",args.getString("server")).put("username","other").put("password","fixture-only"));require(!((JSONObject)action("rotation.state",new JSONObject())).getBoolean("enabled"),"A different account defaults OFF");
  }
  private SurfaceView videoSurface(View view){if(view instanceof SurfaceView)return (SurfaceView)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){SurfaceView found=videoSurface(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null;}
  private void checkGridRotation()throws Exception{
    // Isolate pixel geometry from the separate automatic three-cell stress
    // scenario; that full scenario remains unchanged and must also pass.
    action("preferences.set",new JSONObject().put("key","gridCount").put("value",2));
    action("gallery.open",new JSONObject());action("grid.open",new JSONObject());waitGrid(2,false);
    gridControl(0,"expand",0);gridControl(-1,"pause",0);gridControl(0,"volume",37);gridControl(0,"rate",1.5);
    JSONObject before=waitGrid(2,true).getJSONArray("cells").getJSONObject(0);long oldFrames=before.getLong("submittedFrames");gridControl(0,"seek",5000);
    long end=System.currentTimeMillis()+25000;JSONObject cell=null;
    do{cell=((JSONObject)action("grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(0);if(cell.getBoolean("paused")&&cell.getLong("submittedFrames")>oldFrames&&Math.abs(cell.getLong("positionMs")-5000)<250)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    require(cell.getLong("submittedFrames")>oldFrames&&Math.abs(cell.getLong("positionMs")-5000)<250,"Actual paused grid frame before rotation: "+cell);
    long input=cell.getLong("inputId");
    for(int angle:new int[]{0,90,180,270,0}){
      gridControl(0,"rotate",angle);assertRotationPixels(angle,"grid");cell=((JSONObject)action("grid.state",new JSONObject())).getJSONArray("cells").getJSONObject(0);
      require(cell.getLong("inputId")==input&&cell.getBoolean("paused")&&Math.abs(cell.getLong("positionMs")-5000)<250&&Math.abs(cell.getDouble("rate")-1.5)<.01&&cell.getInt("volume")==37,"Rotation cannot change the input, pause, position, speed or volume: "+cell);
    }
    if(Build.VERSION.SDK_INT>=29){JSONObject presentation=cell.getJSONObject("presentation");require("surface-compositor".equals(presentation.getString("rotationRenderer"))&&presentation.getBoolean("nativeLayerAttached")&&!presentation.getBoolean("rotationPipeline"),"Keep native buffers and a compositor layer instead of copying/reopening the decoder: "+presentation);}
    require(Boolean.TRUE.equals(expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke('native.grid.control',{target:0,command:'rotate',value:90.5}).then(()=>false,()=>true)")),"Fractional angles cannot silently turn into a different valid operation");
    gridControl(0,"rotate",270);assertRotationPixels(270,"grid");screenshot("rhvideo-grid-rotation-qa.png");
    gridControl(-1,"page",1);waitGrid(2,false);gridControl(-1,"page",-1);waitGrid(2,true);gridControl(0,"expand",0);gridControl(0,"pause",0);assertRotationPixels(270,"grid");
    action("grid.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private void assertRotationPixels(int angle)throws Exception{
    assertRotationPixels(angle,"player");
  }
  private void assertRotationPixels(int angle,String scope)throws Exception{
    // Actual compositor pixels, not a View.rotation property or decoder flag.
    // The owned portrait fixture has four solid, distinct corner markers.
    long end=System.currentTimeMillis()+8000;String diagnostic="";
    do{
      int[] bounds={0,0,0,0};runOnMainSync(()->{SurfaceView surface=videoSurface(current.getWindow().getDecorView());if(surface!=null){surface.getLocationOnScreen(bounds);bounds[2]=surface.getWidth();bounds[3]=surface.getHeight();}});
      android.graphics.Bitmap image=getUiAutomation().takeScreenshot();boolean valid=image!=null&&bounds[2]>0&&bounds[3]>0;StringBuilder colors=new StringBuilder();
      if(valid)for(int corner=0;corner<4;corner++){
        double x=(corner%2==0?50.0:310.0)/360,y=(corner<2?50.0:590.0)/640;
        double u=angle==90?1-y:angle==180?1-x:angle==270?y:x,v=angle==90?x:angle==180?1-y:angle==270?1-x:y;double vw=angle%180!=0?640:360,vh=angle%180!=0?360:640,scale=Math.min(bounds[2]/vw,bounds[3]/vh),left=(bounds[2]-vw*scale)/2,top=(bounds[3]-vh*scale)/2;int px=bounds[0]+(int)(left+u*vw*scale),py=bounds[1]+(int)(top+v*vh*scale);
        if(px<0||py<0||px>=image.getWidth()||py>=image.getHeight()){valid=false;break;}
        int pixel=image.getPixel(px,py),r=(pixel>>16)&255,g=(pixel>>8)&255,b=pixel&255;colors.append(String.format(" %06x",pixel&0xffffff));
        valid&=corner==0?r>160&&g<90&&b<90:corner==1?g>160&&r<90&&b<90:corner==2?b>160&&r<90&&g<90:r>160&&g>160&&b<90;
      }
      if(image!=null)image.recycle();if(valid)return;
      diagnostic="bounds="+java.util.Arrays.toString(bounds)+", pixels="+colors;Thread.sleep(100);
    }while(System.currentTimeMillis()<end);
    throw new Exception("Actual "+scope+" video pixels did not rotate clockwise/fit without cropping at "+angle+" degrees: "+diagnostic+"; "+action(scope+".state",new JSONObject()));
  }
  private void checkLatestPlayIntent()throws Exception{
    action("category",new JSONObject().put("kind","video"));action("sort",new JSONObject().put("value","dateDesc"));
    action("gallery.open",new JSONObject());action("panel.close",new JSONObject().put("id","wb-gallery"));
    expression(library,"(()=>{window.__intentPost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(!window.__heldIntent&&message.action==='query'&&message.args.kind==='gallery'&&message.args.allKeys){window.__heldIntent={worker:this,message,rest};return;}return window.__intentPost.call(this,message,...rest);};window.__oldIntent=RHFilesAPI.invoke('rhvideo.media.open',{kind:'video',id:'video-0'});return true;})()");
    long end=System.currentTimeMillis()+10000;while(!"true".equals(eval(library,"!!window.__heldIntent"))&&System.currentTimeMillis()<end)Thread.sleep(100);if(!"true".equals(eval(library,"!!window.__heldIntent")))throw new Exception("Older library request did not reach metadata: "+expression(library,"Promise.race([window.__oldIntent.then(value=>({value}),error=>({error:String(error)})),new Promise(resolve=>setTimeout(()=>resolve({pending:true}),300))])")+"; "+action("state",new JSONObject()));
    action("media.open",new JSONObject().put("kind","video").put("id","video-1"));long input=waitPlayer("video-1",true).getLong("inputId");
    expression(library,"(()=>{Worker.prototype.postMessage=window.__intentPost;window.__intentPost.call(window.__heldIntent.worker,window.__heldIntent.message,...window.__heldIntent.rest);return true;})()");
    require(((JSONObject)expression(library,"window.__oldIntent")).optBoolean("stale"),"Old preparation must report stale without launching its source");
    require(((JSONObject)action("player.state",new JSONObject())).getLong("inputId")==input&&((JSONObject)action("image.state",new JSONObject())).getJSONObject("current").getString("videoId").equals("video-1"),"Neither native playback nor its parent may be taken over by an old request");
    action("player.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private Object mediaNative(String name,JSONObject params)throws Exception{step("prepared-ticket "+name);return expression(library,"RHVideoNative.request("+JSONObject.quote(name)+","+params+")");}
  private JSONObject prepareTicket(String ticket,boolean reset,int... ids)throws Exception{
    JSONArray rows=new JSONArray();for(int id:ids)rows.put(new JSONObject().put("id","video-"+id).put("title","video-"+id).put("duration",20));
    return (JSONObject)mediaNative("playlist.prepare",new JSONObject().put("ticket",ticket).put("reset",reset).put("items",rows).put("options",new JSONObject().put("fullLength",true)));
  }
  private void checkPreparedTickets()throws Exception{
    prepareTicket("draft-a",true,0);prepareTicket("draft-b",true,2);require(prepareTicket("draft-a",false,1).getInt("count")==2,"A second preparation cannot invalidate earlier chunks");
    mediaNative("play",new JSONObject().put("playlist","draft-b").put("id","video-2").put("title","B"));long input=waitPlayer("video-2",true).getLong("inputId");Activity superseded=current;require(superseded!=null&&superseded.getClass().getSimpleName().equals("PlaybackActivity"),"Actual first native Activity is resumed");
    prepareTicket("discarded",true,0);require(((JSONObject)mediaNative("playlist.discard",new JSONObject().put("ticket","discarded"))).getBoolean("removed"),"Explicit draft cleanup must release its own ticket");require(((JSONObject)action("player.state",new JSONObject())).getLong("inputId")==input,"Discarding a draft cannot close active Media3");
    mediaNative("play",new JSONObject().put("playlist","draft-a").put("id","video-1").put("title","A"));JSONObject active=waitPlayer("video-1",true);require(active.getInt("count")==2,"Interleaved draft retains its exact own entries");
    require(superseded.isFinishing()||superseded.isDestroyed(),"Replacing a native single player must retire the old Activity, not stack stopped decoders");
    require(!((JSONObject)mediaNative("playlist.discard",new JSONObject().put("ticket","draft-a"))).getBoolean("removed"),"Activated tickets are consumed, not leaked");
    action("player.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private JSONObject waitPausedPlayerFrame(String id,long target,long previousFrames)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject state=null;
    do{state=(JSONObject)action("player.state",new JSONObject());if(id.equals(state.optString("id"))&&!state.optBoolean("playWhenReady")&&state.optInt("playbackState")==3&&state.optLong("renderedFrames")>previousFrames&&Math.abs(state.optLong("positionMs")-target)<250)return state;Thread.sleep(150);}while(System.currentTimeMillis()<end);
    throw new Exception("Actual paused seek frame did not settle: "+state);
  }
  private Object exportUi(String id)throws Exception{
    JSONArray rows=(JSONArray)expression(library,"RHFilesAPI.invoke('ui.list')");
    for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(id.equals(row.optString("id")))return expression(library,"RHFilesAPI.invoke('ui.invoke',"+new JSONObject().put("controlId",row.getString("controlId"))+")");}
    throw new Exception("Visible export control missing: "+id);
  }
  private JSONObject waitExport(String id)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject job=null;
    do{job=(JSONObject)action("exports.get",new JSONObject().put("id",id));require(!java.util.Arrays.asList("failed","cancelled","expired").contains(job.getString("status")),"Real export failed: "+job);if("completed".equals(job.getString("status")))return job;Thread.sleep(150);}while(System.currentTimeMillis()<end);throw new Exception("Real export did not finish: "+job);
  }
  private JSONObject downloadTask(String id)throws Exception{
    JSONArray rows=((JSONObject)action("exports.downloads",new JSONObject())).getJSONArray("items");
    for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).getString("id")))return rows.getJSONObject(i);return null;
  }
  private JSONObject waitDownload(String id,String state)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject task=null;
    do{task=downloadTask(id);if(task!=null){if(state.equals(task.getString("state")))return task;if("saved".equals(state))require(!java.util.Arrays.asList("failed","cancelled").contains(task.getString("state")),"Native download failed: "+task);}Thread.sleep(150);}while(System.currentTimeMillis()<end);throw new Exception("Native download did not reach "+state+": "+task);
  }
  private android.view.accessibility.AccessibilityNodeInfo systemNode(android.view.accessibility.AccessibilityNodeInfo node,java.util.function.Predicate<android.view.accessibility.AccessibilityNodeInfo> match){
    if(node==null)return null;if(node.isVisibleToUser()&&node.isEnabled()&&match.test(node))return node;for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo child=systemNode(node.getChild(i),match);if(child!=null)return child;}return null;
  }
  private void touchSystemNode(android.view.accessibility.AccessibilityNodeInfo node)throws Exception{
    android.graphics.Rect rect=new android.graphics.Rect();node.getBoundsInScreen(rect);require(!rect.isEmpty(),"System control has no visible touch target");long now=SystemClock.uptimeMillis();
    MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,rect.exactCenterX(),rect.exactCenterY(),0),up=MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,rect.exactCenterX(),rect.exactCenterY(),0);
    try{require(getUiAutomation().injectInputEvent(down,true)&&getUiAutomation().injectInputEvent(up,true),"System document/notification touch rejected");}finally{down.recycle();up.recycle();}
  }
  private android.view.accessibility.AccessibilityNodeInfo pickerRoot()throws Exception{
    long end=System.currentTimeMillis()+10000;android.view.accessibility.AccessibilityNodeInfo root;
    do{root=getUiAutomation().getRootInActiveWindow();if(root!=null&&String.valueOf(root.getPackageName()).endsWith("documentsui"))return root;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Actual system ZIP save picker never opened");
  }
  private void systemBack()throws Exception{
    // InputDispatcher rejects zero/old timestamps as stale. Use the same real
    // uptime clock as Android input, not the two-argument constructor's defaults.
    long now=SystemClock.uptimeMillis();KeyEvent down=new KeyEvent(now,now,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BACK,0,0,KeyCharacterMap.VIRTUAL_KEYBOARD,0,0,InputDevice.SOURCE_KEYBOARD);
    require(getUiAutomation().injectInputEvent(down,true)&&getUiAutomation().injectInputEvent(new KeyEvent(now,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,KeyEvent.KEYCODE_BACK,0,0,KeyCharacterMap.VIRTUAL_KEYBOARD,0,0,InputDevice.SOURCE_KEYBOARD),true),"System Back was rejected");
  }
  private void saveZipPicker(String name)throws Exception{
    android.view.accessibility.AccessibilityNodeInfo root=pickerRoot(),field=systemNode(root,n->String.valueOf(n.getClassName()).endsWith("EditText")&&String.valueOf(n.getText()).endsWith(".zip"));
    require(field!=null,"System picker filename field is present");Bundle value=new Bundle();value.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,name);require(field.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,value),"System picker accepts the chosen ZIP filename");
    root=pickerRoot();android.view.accessibility.AccessibilityNodeInfo save=systemNode(root,n->("Save".equalsIgnoreCase(String.valueOf(n.getText()))||"保存".equals(String.valueOf(n.getText())))&&n.isClickable());
    if(save==null){StringBuilder text=new StringBuilder();collectNativeText(root,text);throw new Exception("System save button missing or disabled: "+text);}
    touchSystemNode(save);
  }
  private void cancelZipPicker()throws Exception{
    android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;getUiAutomation().setServiceInfo(info);
    pickerRoot();boolean keyboard=inputMethodVisible();systemBack();long end=SystemClock.uptimeMillis()+5000;
    do{
      android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
      if(root!=null&&"com.railgunhamster.rhfiles".equals(String.valueOf(root.getPackageName())))return;
      // Only a previously observed IME can consume the first Back. Do not send
      // another key merely because DocumentsUI's closing animation is slow:
      // that queued key could close the underlying RHFiles panel as well.
      if(keyboard&&!inputMethodVisible()&&root!=null&&String.valueOf(root.getPackageName()).endsWith("documentsui")){keyboard=false;systemBack();}
      Thread.sleep(100);
    }while(SystemClock.uptimeMillis()<end);
    throw new Exception("System picker did not cancel after the observed keyboard/picker Back");
  }
  private boolean inputMethodVisible(){for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows())if(window.getType()==android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD){android.graphics.Rect bounds=new android.graphics.Rect();window.getBoundsInScreen(bounds);if(!bounds.isEmpty())return true;}return false;}
  private String hashZip(InputStream input,File copy)throws Exception{
    java.security.MessageDigest hash=java.security.MessageDigest.getInstance("SHA-256");try(InputStream in=input;OutputStream out=copy==null?new java.io.ByteArrayOutputStream(0):new FileOutputStream(copy)){byte[] chunk=new byte[65536];int count;while((count=in.read(chunk))>=0){hash.update(chunk,0,count);if(copy!=null)out.write(chunk,0,count);}}
    StringBuilder result=new StringBuilder();for(byte b:hash.digest())result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return result.toString();
  }
  private File exportReceipt(){return new File(getTargetContext().getExternalFilesDir(null),"rhvideo-export-receipt.json");}
  private File loginReceipt(){return new File(getTargetContext().getExternalFilesDir(null),"rhvideo-login-receipt.json");}
  private void writeLoginReceipt(JSONObject value)throws Exception{try(FileOutputStream out=new FileOutputStream(loginReceipt())){out.write(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}
  private JSONObject protectedLogin()throws Exception{
    byte[] bytes=java.nio.file.Files.readAllBytes(new File(getTargetContext().getNoBackupFilesDir(),"rhvideo-login-v1.enc").toPath());require(bytes.length>29&&bytes[0]==1,"The real login is in the no-backup encrypted format");
    java.security.KeyStore store=java.security.KeyStore.getInstance("AndroidKeyStore");store.load(null);javax.crypto.SecretKey key=(javax.crypto.SecretKey)store.getKey("rhfiles-rhvideo-login-v1",null);require(key!=null&&key.getEncoded()==null,"The release APK uses a non-exportable Android Keystore key, not a test key");
    javax.crypto.Cipher cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.DECRYPT_MODE,key,new javax.crypto.spec.GCMParameterSpec(128,java.util.Arrays.copyOfRange(bytes,1,13)));cipher.updateAAD(("RHFiles\u0000RHVideo login v1\u0000"+getTargetContext().getPackageName()+"\u0000"+getTargetContext().getNoBackupFilesDir().getCanonicalPath()).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    JSONObject value=new JSONObject(new String(cipher.doFinal(java.util.Arrays.copyOfRange(bytes,13,bytes.length)),java.nio.charset.StandardCharsets.UTF_8));String token=value.getString("token");require(!token.isEmpty()&&!new String(bytes,java.nio.charset.StandardCharsets.UTF_8).contains(token),"The actual native bearer is not plaintext on disk");require(!getTargetContext().getSharedPreferences("rhvideo-client-v1",0).getAll().toString().contains(token),"Ordinary settings contain no bearer");require(!action("state",new JSONObject()).toString().contains(token),"The renderer state contains no bearer");return value;
  }
  private void checkLoginContinuity(String mode)throws Exception{
    long end=System.currentTimeMillis()+25000;while(!Boolean.TRUE.equals(expression(library,"RHFilesAPI.snapshot().state.application.ready"))&&System.currentTimeMillis()<end)Thread.sleep(100);require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.snapshot().state.application.ready")),"The real initial library/authentication sequence finishes");
    if("login-signedout".equals(mode)){
      require(!((JSONObject)action("state",new JSONObject())).getBoolean("connected"),"An explicit logout remains signed out after another real process restart");require(!new File(getTargetContext().getNoBackupFilesDir(),"rhvideo-login-v1.enc").exists(),"Signed-out restart cannot recreate the old credential record");require(Boolean.TRUE.equals(expression(library,"document.getElementById('notice').hidden||!document.getElementById('notice').textContent.trim()")),"A normal signed-out startup must not show a false changed-account/readiness error");screenshot("rhvideo-login-signedout-qa.png");return;
    }
    if("login".equals(mode)){
      action("connection.logout",new JSONObject());action("connection.open",new JSONObject());require(((JSONObject)action("account.register",new JSONObject().put("server",args.getString("server")).put("username","registration-native").put("password","fixture-only"))).getBoolean("registered"),"The real server confirms registration");require(!((JSONObject)action("state",new JSONObject())).getBoolean("connected"),"Registration must not log in");require(Boolean.TRUE.equals(expression(library,"document.getElementById('connection-dialog').open&&document.getElementById('connection-error').textContent==='注册成功，请登录'")),"Registration keeps the login dialog open with the original success flow");
      action("connection.connect",new JSONObject().put("server",args.getString("server")).put("username","preview").put("password","fixture-only"));require(((JSONObject)expression(library,"RHVideoNative.request('state')")).getBoolean("credentialsPersisted"),"The actual minified release must persist login successfully");JSONObject saved=protectedLogin();require("preview".equals(saved.getString("username")),"The protected account matches the real service");writeLoginReceipt(new JSONObject().put("pid",android.os.Process.myPid()).put("server",saved.getString("server")).put("username",saved.getString("username")));screenshot("rhvideo-login-connected-qa.png");return;
    }
    JSONObject receipt=new JSONObject(new String(java.nio.file.Files.readAllBytes(loginReceipt().toPath()),java.nio.charset.StandardCharsets.UTF_8));require(receipt.getInt("pid")!=android.os.Process.myPid(),"Login restoration is checked in a genuinely new Android process");JSONObject restored=(JSONObject)action("state",new JSONObject());require(restored.getBoolean("connected")&&receipt.getString("server").equals(restored.getString("server"))&&receipt.getString("username").equals(restored.getString("username")),"Startup restores the same real account without another explicit connection action");protectedLogin();
    JSONObject pictures=(JSONObject)action("category",new JSONObject().put("kind","picture"));require(pictures.getInt("total")==1,"The restored bearer accesses the actual service catalog");assertRestoredCoverPixels();
    action("connection.logout",new JSONObject());require(!new File(getTargetContext().getNoBackupFilesDir(),"rhvideo-login-v1.enc").exists(),"Logout removes native saved login before reporting success");writeLoginReceipt(receipt.put("restoredPid",android.os.Process.myPid()).put("logout",true).put("coverPixelsVerified",true));
  }
  private void checkContextControls()throws Exception{
    action("category",new JSONObject().put("kind","picture"));require(Boolean.TRUE.equals(expression(library,"(()=>{const buttons=[...document.querySelectorAll('.library-main > .wb-toolbar:not([hidden]) button:not([hidden])')].map(n=>n.textContent);return buttons.includes('连续浏览')&&!buttons.some(t=>t.includes('连播'))&&document.querySelector('.wb-select').hidden;})()")),"Pictures have their own entry points and no always-visible selection checkbox");
    action("selection.mode",new JSONObject().put("enabled",true));expression(library,"(document.querySelector('.cover-button').click(),true)");require(((JSONObject)action("workbench.diagnostics",new JSONObject())).getInt("selected")==1,"A cover click in selection mode selects instead of opening a viewer");require(Boolean.TRUE.equals(expression(library,"!document.getElementById('image-dialog').open")),"Selecting does not open image playback");expression(library,"(document.querySelector('.card-title').click(),true)");require(((JSONObject)action("workbench.diagnostics",new JSONObject())).getInt("selected")==0,"The same click deselects");require(Boolean.TRUE.equals(expression(library,"!document.getElementById('wb-selection').hidden")),"The empty active selection bar remains usable");action("selection.mode",new JSONObject().put("enabled",false));
    action("category",new JSONObject().put("kind","novel"));require(Boolean.TRUE.equals(expression(library,"![...document.querySelectorAll('.library-main > .wb-toolbar:not([hidden]) button:not([hidden])')].some(n=>/连播|放映|连续浏览/.test(n.textContent))")),"Novels do not show video playback actions");action("category",new JSONObject().put("kind","video"));require(Boolean.TRUE.equals(expression(library,"[...document.querySelectorAll('.library-main > .wb-toolbar:not([hidden]) button:not([hidden])')].some(n=>n.textContent==='按列表顺序连播')")),"Returning to video restores its sequential playback entry");
  }
  private void waitRuleTotal(int total)throws Exception{
    long end=System.currentTimeMillis()+12000;JSONObject state=null;do{state=(JSONObject)action("state",new JSONObject());if(!state.getBoolean("loading")&&state.getInt("total")==total)return;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Tag filter did not reach "+total+" actual media entries: "+state);
  }
  private void dragRuleList()throws Exception{
    expression(library,"(document.querySelector('#wb-rules [data-rule-list]').scrollIntoView({block:'center'}),true)");
    float[] from=webStripPoint("#wb-rules [data-rule-list]",.5,.8),to=webStripPoint("#wb-rules [data-rule-list]",.5,.2);long down=SystemClock.uptimeMillis();
    MotionEvent event=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,from[0],from[1],0);try{require(getUiAutomation().injectInputEvent(event,true),"Tag-list touch DOWN accepted");}finally{event.recycle();}
    for(int i=1;i<=6;i++){Thread.sleep(25);event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,from[0],from[1]+(to[1]-from[1])*i/6,0);try{require(getUiAutomation().injectInputEvent(event,true),"Tag-list touch MOVE accepted");}finally{event.recycle();}}
    event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,to[0],to[1],0);try{require(getUiAutomation().injectInputEvent(event,true),"Tag-list touch UP accepted");}finally{event.recycle();}
  }
  private void checkTagRules()throws Exception{
    long readyEnd=System.currentTimeMillis()+15000;while(!Boolean.TRUE.equals(expression(library,"RHFilesAPI.snapshot().state.application.ready"))&&System.currentTimeMillis()<readyEnd)Thread.sleep(100);require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.snapshot().state.application.ready")),"The full packaged client, not a partially registered API, must initialize");
    expression(library,"RHVideoNative.request('preferences',{}).then(value=>RHVideoNative.request('preferences',{value:{...value,volume:31,rule:{mode:'and',include:'damaged saved list'}}}))");
    action("connection.connect",new JSONObject().put("server",args.getString("server")).put("username","preview").put("password","fixture-only"));JSONObject recovered=(JSONObject)action("preferences.state",new JSONObject());require(recovered.getInt("volume")==31&&recovered.getJSONObject("rule").getJSONArray("include").length()==0,"A damaged saved filter cannot block the actual release APK or erase other preferences");require(Boolean.TRUE.equals(expression(library,"document.getElementById('notice').textContent.includes('保存的标签筛选无效')")),"Saved-filter recovery is explained in the actual mobile UI");
    JSONObject rules=(JSONObject)action("rules.open",new JSONObject());require("gallery".equals(rules.getString("source"))&&rules.getJSONObject("catalog").getJSONArray("catalogs").getJSONObject(0).getInt("total")==240,"Tag counts use 240 source videos rather than the screenshot-frame count");require(rules.getJSONObject("catalog").getJSONArray("rows").length()==80,"The actual picker bounds its tag DOM");require(Boolean.TRUE.equals(expression(library,"!document.getElementById('wb-rule-json').closest('details').open")),"JSON is optional advanced UI, not the required editing workflow");require(Boolean.TRUE.equals(expression(library,"document.activeElement===document.getElementById('wb-rule-search')")),"Opening the tag editor focuses search like the reference");
    action("rules.search",new JSONObject().put("query","fengjing"));expression(library,"([...document.querySelectorAll('#wb-rules [role=checkbox]')].find(n=>n.getAttribute('aria-label')==='包含标签：风景').click(),true)");waitRuleTotal(2);
    action("rules.group.add",new JSONObject().put("path",new JSONArray()));action("rules.tag.toggle",new JSONObject().put("kind","include").put("label","城市").put("path",new JSONArray().put(0)));waitRuleTotal(1);expression(library,"(document.querySelector('#wb-rules [data-rule-control=root-or]').click(),true)");waitRuleTotal(3);action("rules.tag.toggle",new JSONObject().put("kind","exclude").put("label","旅行").put("path",new JSONArray()));waitRuleTotal(2);action("rules.save",new JSONObject().put("name","组合验证"));
    rules=(JSONObject)action("rules.state",new JSONObject());long oldRevision=rules.getLong("revision");action("rules.group.remove",new JSONObject().put("path",new JSONArray().put(0)));action("rules.group.add",new JSONObject().put("path",new JSONArray()));require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.rules.tag.toggle',{label:'旧点击',kind:'include',path:[0],expectedRevision:"+oldRevision+"}).then(()=>false,e=>/旧操作/.test(String(e)))")),"A removed/recreated group cannot accept an old rendered click");action("rules.restore",new JSONObject().put("name","组合验证"));waitRuleTotal(2);
    action("rules.search",new JSONObject().put("query","mulu"));rules=(JSONObject)action("rules.sort",new JSONObject().put("value","name-asc"));require(Boolean.TRUE.equals(expression(library,"document.querySelector('#wb-rules [data-rule-sort]').value==='name-asc'")),"The visible sort control follows the API");require(rules.getJSONObject("catalog").getInt("total")==237,"Pinyin search reaches every directory tag");
    require(Boolean.TRUE.equals(expression(library,"!document.querySelector('#wb-rules [data-rule-next],#wb-rules [data-rule-previous]')")),"The original continuous tag list is not replaced by pagination");action("rules.scroll",new JSONObject().put("index",79));dragRuleList();long scrollEnd=System.currentTimeMillis()+8000;do{rules=(JSONObject)action("rules.state",new JSONObject());if(!rules.getBoolean("busy")&&rules.getJSONObject("viewport").getInt("first")>80)break;Thread.sleep(100);}while(System.currentTimeMillis()<scrollEnd);require(rules.getJSONObject("viewport").getInt("first")>80,"A real finger gesture crosses the old eighty-tag boundary");require(Boolean.TRUE.equals(expression(library,"document.querySelectorAll('#wb-rules .wb-rule-choice').length<=80")),"Continuous scrolling keeps the actual DOM bounded");
    rules=(JSONObject)action("rules.scroll",new JSONObject().put("index",237));require(rules.getJSONObject("viewport").getInt("last")==237&&"目录239".equals(rules.getJSONObject("catalog").getJSONArray("rows").getJSONObject(79).getString("name")),"The final directory label remains reachable without a page button");action("rules.scroll",new JSONObject().put("top",0));rules=(JSONObject)action("rules.page",new JSONObject().put("direction",1));require(rules.getInt("offset")==80&&"目录083".equals(rules.getJSONObject("catalog").getJSONArray("rows").getJSONObject(0).getString("name")),"Legacy eighty-row API remains available without replacing continuous UI");double rememberedTop=rules.getJSONObject("viewport").getDouble("top");action("panel.close",new JSONObject().put("id","wb-rules"));rules=(JSONObject)action("rules.open",new JSONObject());require(rules.getString("search").isEmpty()&&Math.abs(rules.getJSONObject("viewport").getDouble("top")-rememberedTop)<1,"The reference clears search on reopen but remembers the shared drawer position");
    action("rules.search",new JSONObject().put("query",""));action("rules.sort",new JSONObject().put("value","recent"));action("rules.collapse",new JSONObject().put("collapsed",true));require(Boolean.TRUE.equals(expression(library,"document.querySelectorAll('#wb-rules .wb-rule-choice').length===0")),"Collapsing tags changes the real UI");action("rules.collapse",new JSONObject().put("collapsed",false));action("rules.search",new JSONObject().put("query","fengjing"));require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"All actual tag controls have semantic APIs");require(Boolean.TRUE.equals(expression(library,"document.documentElement.scrollWidth<=innerWidth+1&&document.getElementById('wb-rules').getBoundingClientRect().width<=innerWidth")),"The phone tag editor fits the actual viewport");screenshot("rhvideo-rules-qa.png");
    long now=SystemClock.uptimeMillis();require(getUiAutomation().injectInputEvent(new android.view.KeyEvent(now,now,android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_BACK,0),true),"Owned native Back down accepted");require(getUiAutomation().injectInputEvent(new android.view.KeyEvent(now,SystemClock.uptimeMillis(),android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_BACK,0),true),"Owned native Back up accepted");long end=System.currentTimeMillis()+5000;do{rules=(JSONObject)action("rules.state",new JSONObject());if(!rules.getBoolean("opened"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(!rules.getBoolean("opened")&&((JSONObject)action("state",new JSONObject())).getBoolean("connected"),"Android Back closes the tag panel instead of leaving the library");
    action("category",new JSONObject().put("kind","picture"));rules=(JSONObject)action("rules.open",new JSONObject());require("picture".equals(rules.getJSONObject("catalog").getJSONArray("catalogs").getJSONObject(0).getString("kind"))&&rules.getJSONObject("catalog").getJSONArray("catalogs").getJSONObject(0).getInt("matching")==0,"The same global filter applies to pictures");boolean orphan=false;JSONArray rows=rules.getJSONObject("catalog").getJSONArray("rows");for(int i=0;i<rows.length();i++)if("风景".equals(rows.getJSONObject(i).getString("name"))&&rows.getJSONObject(i).getInt("count")==0)orphan=true;require(orphan,"Selected tags missing from this catalog stay removable");action("rules.clear",new JSONObject());waitRuleTotal(8);action("panel.close",new JSONObject().put("id","wb-rules"));
  }
  private void writeReceipt(JSONObject value)throws Exception{try(FileOutputStream out=new FileOutputStream(exportReceipt())){out.write(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}
  private void checkFavoriteExports(boolean recover)throws Exception{
    if(recover){
      JSONObject receipt=new JSONObject(new String(java.nio.file.Files.readAllBytes(exportReceipt().toPath()),java.nio.charset.StandardCharsets.UTF_8));JSONObject interrupted=downloadTask(receipt.getString("interruptedTask"));
      require(interrupted!=null&&"failed".equals(interrupted.getString("state"))&&!interrupted.getString("error").isEmpty(),"Interrupted process download must be a visible terminal failure, never an active ghost: "+interrupted);
      require(receipt.getString("interruptedPath").equals(interrupted.getString("path")),"Recovery keeps the exact task target");require(!"saved".equals(interrupted.getString("state")),"An interrupted partial ZIP cannot be reported saved");
      JSONObject saved=downloadTask(receipt.getString("savedTask"));require(saved!=null&&"saved".equals(saved.getString("state"))&&receipt.getString("savedUri").equals(saved.getString("path")),"Completed document history survives process restart");step("exports.recovery.readSavedDocument");require(receipt.getString("sha256").equals(hashZip(getTargetContext().getContentResolver().openInputStream(android.net.Uri.parse(saved.getString("path"))),null)),"The actual saved document is still readable after process restart");
      action("category",new JSONObject().put("kind","favorite"));action("exports.open",new JSONObject());action("exports.refresh",new JSONObject());require(Boolean.TRUE.equals(expression(library,"[...document.querySelectorAll('#wb-exports button')].every(n=>!(/重试/.test(n.textContent)))")),"Failed tasks never offer replay buttons");screenshot("rhvideo-export-recovery-qa.png");action("exports.close",new JSONObject());return;
    }
    for(String kind:new String[]{"video","picture","novel"}){action("category",new JSONObject().put("kind",kind));action("favorite.toggle",new JSONObject().put("kind",kind).put("id","real-"+kind));}
    require(((JSONObject)action("category",new JSONObject().put("kind","favorite"))).getInt("total")==3,"All real source kinds are favorites");action("preferences.set",new JSONObject().put("key","mediaType").put("value","novel"));action("exports.open",new JSONObject());
    require(((JSONObject)action("exports.state",new JSONObject())).getInt("selectionCount")==1,"Export panel freezes the whole novel-only selection");exportUi("wb-export-create");JSONObject filtered=((JSONObject)action("exports.state",new JSONObject())).getJSONObject("lastJob");require(waitExport(filtered.getString("id")).getInt("total")==1,"Actual create button exports the filtered selection");
    action("exports.scope",new JSONObject().put("value","all"));exportUi("wb-export-create");JSONObject all=((JSONObject)action("exports.state",new JSONObject())).getJSONObject("lastJob");all=waitExport(all.getString("id"));require(all.getInt("total")==3&&all.getJSONObject("progress").getInt("included")==3,"All-favorites UI scope includes video, picture and novel despite the filter");String export=all.getString("id");
    String chosen="RHFiles-保存测试-"+export.substring(0,8)+".zip";JSONObject picker=(JSONObject)action("exports.download",new JSONObject().put("id",export));require(picker.getBoolean("requested"),"Download opens the real system picker, not a fake saved response");saveZipPicker(chosen);
    library=waitView("RhVideoActivity");long end=System.currentTimeMillis()+10000;JSONObject transfer=null;boolean uiBusy=true;
    // Read the actual UI snapshot, not exports.downloads (which would manually
    // merge native state and conceal a missing callback/progress event bridge).
    do{JSONObject ui=(JSONObject)action("exports.state",new JSONObject());uiBusy=ui.getBoolean("busy");JSONArray tasks=ui.getJSONArray("downloads");for(int i=0;i<tasks.length();i++)if(export.equals(tasks.getJSONObject(i).getString("exportId"))){transfer=tasks.getJSONObject(i);break;}if(!uiBusy&&transfer!=null&&transfer.getLong("bytes")>0)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    boolean liveProgress=!uiBusy&&transfer!=null&&transfer.getLong("bytes")>0&&transfer.getLong("bytes")<transfer.getLong("total");
    if(!liveProgress){
      // Diagnostic reads only after the UI-only assertion has already failed:
      // never merge native state to make a missing event look successful.
      android.util.Log.e("RHVideoQA","ZIP_UI_PROGRESS_FAILURE native="+action("exports.downloads",new JSONObject()));
      for(java.util.Map.Entry<Thread,StackTraceElement[]> entry:Thread.getAllStackTraces().entrySet()){
        String stack=java.util.Arrays.toString(entry.getValue());if(stack.contains("RhVideo")||stack.contains("okhttp"))android.util.Log.e("RHVideoQA","ZIP_THREAD "+entry.getKey().getName()+" "+entry.getKey().getState()+" "+stack);
      }
    }
    require(liveProgress,"The real picker result and live transfer progress must reach the UI before closing: "+transfer+"; busy="+uiBusy);String taskId=transfer.getString("id");
    android.net.Uri selected=android.net.Uri.parse(transfer.getString("path"));boolean retained=false;for(android.content.UriPermission permission:getTargetContext().getContentResolver().getPersistedUriPermissions())if(permission.getUri().equals(selected)&&permission.isReadPermission()&&permission.isWritePermission())retained=true;require(retained,"The actual system-selected document grant is retained before closing its Activity");
    action("exports.close",new JSONObject());systemBack();main=waitView("MainActivity");
    try(ParcelFileDescriptor command=getUiAutomation().executeShellCommand("cmd statusbar expand-notifications")){}
    end=System.currentTimeMillis()+8000;boolean tapped=false;
    do{android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();if(root!=null&&"com.android.systemui".equals(String.valueOf(root.getPackageName()))){android.view.accessibility.AccessibilityNodeInfo note=systemNode(root,n->"RHFiles · 喜爱文件下载".equals(String.valueOf(n.getText())));if(note!=null){touchSystemNode(note);tapped=true;break;}}Thread.sleep(100);}while(System.currentTimeMillis()<end);require(tapped,"The real foreground progress notification must be visible and tappable");
    library=waitView("RhVideoActivity");ready(library,"RHVideoBack");end=System.currentTimeMillis()+15000;boolean opened=false;do{try{opened=((JSONObject)action("exports.state",new JSONObject())).getBoolean("opened");if(opened)break;}catch(Exception ignored){}Thread.sleep(100);}while(System.currentTimeMillis()<end);require(opened,"Notification returns to the dedicated export/download UI");
    JSONObject saved=waitDownload(taskId,"saved");require(chosen.equals(saved.getString("name"))&&saved.getString("path").startsWith("content:"),"Task uses the actual system-chosen display name and document URI: "+saved);require(saved.getLong("bytes")==all.getLong("archive_bytes"),"The complete archive size is reported");
    String hash=hashZip(getTargetContext().getContentResolver().openInputStream(android.net.Uri.parse(saved.getString("path"))),new File(getTargetContext().getExternalFilesDir(null),"rhvideo-export-qa.zip"));
    require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.exports.download.cancel',"+new JSONObject().put("taskId",taskId)+").then(()=>false,()=>true)")),"A saved file rejects late cancellation");
    int before=((JSONObject)action("exports.downloads",new JSONObject())).getJSONArray("items").length();action("exports.download",new JSONObject().put("id",export));cancelZipPicker();library=waitView("RhVideoActivity");end=System.currentTimeMillis()+10000;do{if(!((JSONObject)action("exports.state",new JSONObject())).getBoolean("busy"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(!((JSONObject)action("exports.state",new JSONObject())).getBoolean("busy"),"Cancelling the real picker clears choosing state");require(((JSONObject)action("exports.downloads",new JSONObject())).getJSONArray("items").length()==before,"Picker cancellation must not create a download");
    require(((JSONObject)action("exports.state",new JSONObject())).getBoolean("opened"),"Cancelling the native save picker leaves the existing export panel open");
    File cache=new File(getTargetContext().getCacheDir(),"exports");require(cache.isDirectory()||cache.mkdirs(),"Owned export directory available");File race=new File(cache,"race-"+export+".zip");
    JSONObject first=(JSONObject)action("exports.download",new JSONObject().put("id",export).put("path",race.getAbsolutePath())),second=(JSONObject)action("exports.download",new JSONObject().put("id",export).put("path",race.getAbsolutePath()));
    String a=first.getJSONObject("task").getString("id"),b=second.getJSONObject("task").getString("id");end=System.currentTimeMillis()+30000;JSONObject ta=null,tb=null;
    do{ta=downloadTask(a);tb=downloadTask(b);if(ta!=null&&tb!=null&&java.util.Arrays.asList("saved","failed").contains(ta.getString("state"))&&java.util.Arrays.asList("saved","failed").contains(tb.getString("state")))break;Thread.sleep(150);}while(System.currentTimeMillis()<end);
    require(ta!=null&&tb!=null&&java.util.Arrays.asList("saved","failed").contains(ta.getString("state"))&&java.util.Arrays.asList("saved","failed").contains(tb.getString("state"))&&!ta.getString("state").equals(tb.getString("state")),"Concurrent native saves must finish with exactly one saved and one failed, never an active ghost: "+ta+" / "+tb);String raceHash=hashZip(new FileInputStream(race),null);require(hash.equals(raceHash),"The concurrent winner is the identical complete ZIP");
    File sentinel=new File(cache,"existing-"+export+".zip");try(FileOutputStream out=new FileOutputStream(sentinel)){out.write("owned-existing-data".getBytes(java.nio.charset.StandardCharsets.UTF_8));}JSONObject existing=(JSONObject)action("exports.download",new JSONObject().put("id",export).put("path",sentinel.getAbsolutePath()));waitDownload(existing.getJSONObject("task").getString("id"),"failed");require("owned-existing-data".equals(new String(java.nio.file.Files.readAllBytes(sentinel.toPath()),java.nio.charset.StandardCharsets.UTF_8)),"A preexisting file is never truncated");
    require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"Every export UI operation has a public action");require(((JSONObject)action("exports.state",new JSONObject())).getBoolean("opened"),"The screenshot must show the export panel and actual terminal downloads, not an unrelated underlying page");screenshot("rhvideo-export-qa.png");
    File interrupted=new File(cache,"interrupted-"+export+".zip");JSONObject armed=(JSONObject)action("exports.download",new JSONObject().put("id",export).put("path",interrupted.getAbsolutePath()));String interruptedId=armed.getJSONObject("task").getString("id");end=System.currentTimeMillis()+10000;JSONObject active=null;do{active=downloadTask(interruptedId);if(active!=null&&active.getLong("bytes")>0)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(active!=null&&"downloading".equals(active.getString("state"))&&active.getLong("bytes")>0&&active.getLong("bytes")<active.getLong("total"),"Arm a genuinely in-flight native download before process interruption: "+active);
    require(interrupted.getCanonicalPath().equals(active.getString("path")),"Admission binds the canonical requested output before interruption");
    writeReceipt(new JSONObject().put("exportId",export).put("sha256",hash).put("concurrentHash",raceHash).put("concurrentStates",new JSONArray().put(ta.getString("state")).put(tb.getString("state"))).put("savedTask",taskId).put("savedUri",saved.getString("path")).put("chosenName",chosen).put("interruptedTask",interruptedId).put("interruptedPath",active.getString("path")).put("requestedInterruptedPath",interrupted.getAbsolutePath()));
  }
  private void checkReferenceSingle()throws Exception{
    require("gallery".equals(((JSONObject)action("state",new JSONObject())).getString("view")),"Like RHVideo, the default main section is screenshot browsing");
    require("true".equals(eval(library,"!document.getElementById('gallery-panel').hidden&&document.querySelectorAll('dialog[open]').length===0")),"The primary gallery is a page, not a modal overlay");
    action("category",new JSONObject().put("kind","video"));
    action("media.open",new JSONObject().put("kind","video").put("id","video-0"));JSONObject cold=waitPlayer("video-0",true);require(!cold.getJSONObject("options").has("origin"),"Like the reference, a cold video click does not load or manufacture a screenshot parent");action("player.close",new JSONObject());library=waitView("RhVideoActivity");require(!((JSONObject)action("image.state",new JSONObject())).getBoolean("opened"),"A cold direct video leaves no hidden screenshot parent");
    long galleryDeadline=System.currentTimeMillis()+8000;JSONObject prepared;
    do{prepared=(JSONObject)action("gallery.state",new JSONObject());if(prepared.getBoolean("loaded"))break;Thread.sleep(100);}while(System.currentTimeMillis()<galleryDeadline);
    require(prepared.getBoolean("loaded")&&prepared.getInt("count")==1,"Login prepares the gallery in the background without blocking the first video: "+prepared);
    require("false".equals(eval(library,"!!document.querySelector('#wb-gallery[open]')")),"Background completion cannot pop a gallery in front of the library");
    action("gallery.show",new JSONObject());
    action("rules.apply",new JSONObject().put("rule",new JSONObject().put("mode","and").put("include",new JSONArray().put("no-such-fixture-folder")).put("exclude",new JSONArray())));
    require(((JSONObject)action("gallery.state",new JSONObject())).getInt("total")==0,"Changing a filter updates the already-open native library gallery");
    require("0".equals(eval(library,"document.querySelectorAll('#gallery-content .wb-frame').length")),"The old screenshot cards cannot remain after filtering");
    action("rules.apply",new JSONObject().put("rule",new JSONObject()));require(((JSONObject)action("gallery.state",new JSONObject())).getInt("total")==1,"Clearing the filter restores the parent pool");
    require("true".equals(eval(library,"!document.getElementById('gallery-panel').hidden&&document.querySelectorAll('dialog[open]').length===0")),"Filtering preserves the primary page rather than opening a hidden modal");
    long primaryDeadline=System.currentTimeMillis()+10000;while(!"true".equals(eval(library,"[...document.querySelectorAll('#gallery-content img')].some(i=>i.complete&&i.naturalWidth===800)"))&&System.currentTimeMillis()<primaryDeadline)Thread.sleep(100);
    require("true".equals(eval(library,"[...document.querySelectorAll('#gallery-content img')].some(i=>i.complete&&i.naturalWidth===800)")),"The actual primary screenshot must decode");screenshot("rhvideo-primary-gallery-qa.png");
    action("gallery.shuffle",new JSONObject());String orderSeed=((JSONObject)action("gallery.state",new JSONObject())).getString("seed");require(orderSeed.matches("[a-f0-9]{8}"),"Use a reference-compatible string shuffle seed");
    action("gallery.save",new JSONObject().put("name","Native order"));action("gallery.restore",new JSONObject());action("gallery.resume",new JSONObject().put("name","Native order"));require(orderSeed.equals(((JSONObject)action("gallery.state",new JSONObject())).getString("seed")),"Saved seed survives actual native persistence and restoration");
    action("preferences.set",new JSONObject().put("key","mixPictures").put("value",true));require(((JSONObject)action("gallery.state",new JSONObject())).getJSONArray("orders").length()==0,"Named mixed-picture scope is independent");action("gallery.restore",new JSONObject());
    action("gallery.inspect",new JSONObject().put("index",0));JSONObject mixed=waitImage(0);require("picture".equals(mixed.getJSONObject("current").getString("kind")),"Restored mixed gallery begins with pictures, not frames");checkImageToolbar();action("image.close",new JSONObject());action("gallery.resume",new JSONObject());require("picture".equals(waitImage(0).getJSONObject("current").getString("kind")),"Continue browsing really reopens the last picture");action("image.close",new JSONObject());
    action("preferences.set",new JSONObject().put("key","mixPictures").put("value",false));require(((JSONObject)action("gallery.state",new JSONObject())).getJSONArray("orders").length()==1,"Original scope retains its saved order");action("gallery.restore",new JSONObject());
    action("category",new JSONObject().put("kind","video"));
    action("media.open",new JSONObject().put("kind","video").put("id","video-0"));JSONObject first=waitPlayer("video-0",true);JSONObject parent=first.getJSONObject("options");require(parent.getInt("parentTotal")==1,"Fixture must expose an actual one-item parent");
    touchPlayerButton("exo_next");library=waitView("RhVideoActivity");JSONObject image=waitImage(0);require(image.getInt("total")==1,"An arrow pops the parent even when modulo position does not change");
    action("image.playVideo",new JSONObject());JSONObject current=waitPlayer("video-0",true);require(!current.getJSONObject("options").getString("parentPlayback").equals(parent.getString("parentPlayback")),"Every child launch must have a new identity");long input=current.getLong("inputId");
    JSONObject oldReturn=new JSONObject().put("generation",first.getJSONObject("queue").getLong("generation")).put("parentKey",parent.getString("parentKey")).put("parentPreview",parent.getString("parentPreview")).put("parentPlayback",parent.getString("parentPlayback")).put("close",true);
    require(((JSONObject)action("image.returnFromVideo",oldReturn)).optBoolean("stale")&&((JSONObject)action("player.state",new JSONObject())).getLong("inputId")==input,"Old whole-close cannot stop another child of the same screenshot");
    action("player.control",new JSONObject().put("command","options"));clickPlayerText("循环播放");current=(JSONObject)action("player.state",new JSONObject());require(current.getBoolean("repeat")&&current.getJSONObject("options").getBoolean("loop"),"The native repeat menu changes the same media controls as the public API");
    touchPlayerButton("exo_settings");clickPlayerText("速度","Speed","播放速度");clickPlayerText("1.5");current=(JSONObject)action("player.state",new JSONObject());require(Math.abs(current.getDouble("rate")-1.5)<.01&&Math.abs(current.getJSONObject("options").getDouble("rate")-1.5)<.01,"Actual controller speed is remembered, not just applied to one decoder");
    touchPlayerButton("rhvideo_player_close");library=waitView("RhVideoActivity");action("media.open",new JSONObject().put("kind","video").put("id","video-1"));current=waitPlayer("video-1",true);require(current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1.5)<.01&&!current.getJSONObject("options").has("origin"),"A source without a parent inherits ordinary-video controls too");
    touchPlayerButton("exo_settings");clickPlayerText("速度","Speed","播放速度");clickPlayerText("1.25");waitNativeRateAndDismissal(1.25);
    // A screenshot taken immediately after touch-up can contain the old
    // popup/checkmark even though the rate was accepted. Reopen the actual
    // controller and verify its selected row, not only the persisted API value.
    touchPlayerButton("exo_settings");clickPlayerText("速度","Speed","播放速度");waitSelectedNativeSpeed("1.25 倍","1.5 倍");screenshot("rhvideo-single-qa.png");clickPlayerText("1.25");waitNativeRateAndDismissal(1.25);
    action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("playlist.sequential",new JSONObject());current=waitPlayer(null,true);require(!current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1)<.01,"Sequential mode has separate controls");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("media.open",new JSONObject().put("kind","video").put("id","video-0"));current=waitPlayer("video-0",true);require(current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1.25)<.01,"A playlist cannot erase single-video control memory");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("connection.logout",new JSONObject());action("connection.connect",new JSONObject().put("server",args.getString("server")).put("username","preview").put("password","fixture-only"));action("media.open",new JSONObject().put("kind","video").put("id","video-0"));current=waitPlayer("video-0",true);require(!current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1)<.01,"Transient controls do not leak across logins");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private void checkFavoriteSlideshow()throws Exception{
    action("category",new JSONObject().put("kind","picture"));
    for(int i=5;i<8;i++){JSONObject favorite=(JSONObject)action("favorite.toggle",new JSONObject().put("kind","picture").put("id","picture-"+i));require(favorite.getBoolean("favorite"),"Own slideshow fixture starts without these favorites");}
    action("category",new JSONObject().put("kind","novel"));require(((JSONObject)action("favorite.toggle",new JSONObject().put("kind","novel").put("id","novel-0"))).getBoolean("favorite"),"Add one book to verify it is not playable");
    action("category",new JSONObject().put("kind","favorite"));
    action("preferences.set",new JSONObject().put("key","stay").put("value",7));action("preferences.set",new JSONObject().put("key","overlap").put("value",false));action("preferences.set",new JSONObject().put("key","favoriteStay").put("value",60));action("preferences.set",new JSONObject().put("key","favoriteFadeMs").put("value",1300));
    action("preferences.set",new JSONObject().put("key","mediaType").put("value","novel"));require(((JSONObject)action("viewer.open",new JSONObject().put("mode","slideshow").put("source","favorite"))).getInt("total")==0,"A novel-only favorite filter must not play hidden pictures");action("panel.close",new JSONObject().put("id","wb-viewer"));
    action("preferences.set",new JSONObject().put("key","mediaType").put("value",""));require(((JSONObject)action("viewer.open",new JSONObject().put("mode","slideshow").put("source","favorite"))).getInt("total")==3,"The mixed pool excludes novels");action("viewer.toggle",new JSONObject());
    require(Boolean.TRUE.equals(expression(library,"(()=>{const n=document.querySelector('.wb-slide:not(.outgoing)');return n.style.getPropertyValue('--stay')==='60s'&&n.style.getPropertyValue('--fade')==='1.3s'&&!n.classList.contains('ken-burns')&&n.querySelector('img').naturalWidth===800;})()")),"Actual decoded slide uses independent favorite dwell/fade, not ordinary Ken Burns settings");
    action("viewer.seek",new JSONObject().put("ratio",1));JSONObject last=(JSONObject)action("viewer.state",new JSONObject());String id=last.getJSONObject("current").getString("id");require(last.getInt("index")==2&&last.getInt("totalDuration")==180,"End selects the last item's start on a duration-weighted timeline");
    action("viewer.favorite",new JSONObject());require(!((JSONObject)action("viewer.state",new JSONObject())).getBoolean("favorite"),"Unfavorite the visible slide");action("viewer.step",new JSONObject().put("direction",-1));action("viewer.step",new JSONObject().put("direction",1));JSONObject revisited=(JSONObject)action("viewer.state",new JSONObject());require(id.equals(revisited.getJSONObject("current").getString("id"))&&revisited.getInt("total")==3&&!revisited.getBoolean("loading"),"A removed favorite remains decoded and reachable in the open snapshot");
    JSONArray controls=(JSONArray)expression(library,"RHFilesAPI.invoke('ui.list')");String controlId=null;for(int i=0;i<controls.length();i++)if("wb-viewer-favorite".equals(controls.getJSONObject(i).optString("id")))controlId=controls.getJSONObject(i).getString("controlId");require(controlId!=null,"Favorite button is a public UI control");expression(library,"RHFilesAPI.invoke('ui.invoke',"+new JSONObject().put("controlId",controlId)+")");require(((JSONObject)action("viewer.state",new JSONObject())).getBoolean("favorite"),"The visible button and typed action share the same favorite state");
    assertPreviewPixels("#wb-viewer .wb-slide:not(.outgoing) img","rhvideo-favorite-slideshow-qa.png");action("panel.close",new JSONObject().put("id","wb-viewer"));action("viewer.open",new JSONObject().put("mode","slideshow").put("source","favorite"));require(((JSONObject)action("viewer.state",new JSONObject())).getInt("index")==0,"Reopening starts a new favorite slideshow, like the reference");action("panel.close",new JSONObject().put("id","wb-viewer"));
  }
  private void waitNativeRateAndDismissal(double rate)throws Exception{
    long end=SystemClock.uptimeMillis()+5000;JSONObject state=null;boolean[] focused={false};
    do{state=(JSONObject)action("player.state",new JSONObject());runOnMainSync(()->focused[0]=current!=null&&!current.isFinishing()&&current.getWindow().getDecorView().hasWindowFocus());if(focused[0]&&Math.abs(state.optDouble("rate")-rate)<.01&&Math.abs(state.getJSONObject("options").optDouble("rate")-rate)<.01)return;Thread.sleep(50);}while(SystemClock.uptimeMillis()<end);
    throw new Exception("Selected native rate must be applied and its popup dismissed: expected="+rate+" focus="+focused[0]+" state="+state);
  }
  private boolean selectedNativeRow(android.view.accessibility.AccessibilityNodeInfo node){
    for(int depth=0;node!=null&&depth<5;depth++,node=node.getParent())if(node.isSelected())return true;
    return false;
  }
  private void waitSelectedNativeSpeed(String selected,String old)throws Exception{
    long end=SystemClock.uptimeMillis()+5000;StringBuilder last=new StringBuilder();
    do{android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();boolean found=false,stale=false;
      if(root!=null&&getTargetContext().getPackageName().equals(String.valueOf(root.getPackageName()))){
        for(android.view.accessibility.AccessibilityNodeInfo row:root.findAccessibilityNodeInfosByText(selected))if(row.isVisibleToUser()&&selected.equals(String.valueOf(row.getText())))found|=selectedNativeRow(row);
        for(android.view.accessibility.AccessibilityNodeInfo row:root.findAccessibilityNodeInfosByText(old))if(row.isVisibleToUser()&&old.equals(String.valueOf(row.getText())))stale|=selectedNativeRow(row);
        if(found&&!stale)return;last.setLength(0);collectNativeText(root,last);
      };Thread.sleep(50);
    }while(SystemClock.uptimeMillis()<end);
    throw new Exception("Visible native speed selection must move from "+old+" to "+selected+": "+last);
  }
  private void touchPlayerButton(String resource)throws Exception{
    // A selected PopupMenu row may return before its window has finished
    // dismissing. A touch during that interval only dismisses that old popup;
    // it never reaches the underlying player button. Observe window focus,
    // rather than injecting again or extending the controller's hide timeout.
    long focusStart=SystemClock.uptimeMillis(),focusEnd=focusStart+5000;boolean[] focused={false};
    do{runOnMainSync(()->focused[0]=current!=null&&!current.isFinishing()&&current.getWindow().getDecorView().hasWindowFocus());if(focused[0])break;Thread.sleep(50);}while(SystemClock.uptimeMillis()<focusEnd);
    require(focused[0],"Player window must regain focus after the previous popup before touching "+resource);
    step("native touch "+resource+" focusWaitMs="+(SystemClock.uptimeMillis()-focusStart));
    revealPlayerControlsByTouch();
    // A controller state flag / isShown() is not a screen-space hit target:
    // Media3 can still translate a child outside the window. Do not inject
    // there or replace a real touch with performClick(). Observe a visible,
    // stable center once; never resend the tap or keep revealing controls.
    long readyAt=SystemClock.uptimeMillis(),targetEnd=readyAt+5000;Activity targetActivity=current;int[] center={-1,-1},previous={-1,-1};String[] geometry={"not sampled"};int stable=0;
    do{
      center[0]=center[1]=-1;
      runOnMainSync(()->{
        if(current!=targetActivity||targetActivity==null||targetActivity.isFinishing()){geometry[0]="player Activity changed";return;}
        View decor=targetActivity.getWindow().getDecorView();int id=targetActivity.getResources().getIdentifier(resource,"id",getTargetContext().getPackageName());View button=targetActivity.findViewById(id);
        if(button==null){geometry[0]="button missing: "+resource;return;}
        int[] location={0,0};button.getLocationOnScreen(location);int x=location[0]+button.getWidth()/2,y=location[1]+button.getHeight()/2;
        android.graphics.Rect visible=new android.graphics.Rect(),window=new android.graphics.Rect();android.graphics.Point displaySize=new android.graphics.Point();if(decor.getDisplay()!=null)decor.getDisplay().getRealSize(displaySize);boolean clipped=button.getGlobalVisibleRect(visible),windowVisible=decor.getGlobalVisibleRect(window),opaque=true;StringBuilder ancestors=new StringBuilder();
        // getGlobalVisibleRect is ROOT-view space, not physical screen space.
        // A cutout/inset can put that root at (0,136); touch coordinates from
        // getLocationOnScreen must be compared with translated clipped bounds.
        int[] rootScreen={0,0};decor.getRootView().getLocationOnScreen(rootScreen);visible.offset(rootScreen[0],rootScreen[1]);window.offset(rootScreen[0],rootScreen[1]);
        for(View node=button;node!=null;node=node.getParent() instanceof View?(View)node.getParent():null){opaque&=node.getAlpha()>=.95f;ancestors.append(node.getClass().getSimpleName()).append(" y=").append(node.getY()).append(" ty=").append(node.getTranslationY()).append(" a=").append(node.getAlpha()).append(';');}
        geometry[0]="activity="+targetActivity.getClass().getName()+" resource="+resource+" center="+x+","+y+" visible="+visible+" window="+window+" rootScreen="+java.util.Arrays.toString(rootScreen)+" display="+displaySize+" focus="+decor.hasWindowFocus()+" shown="+button.isShown()+" ancestors="+ancestors;
        if(decor.hasWindowFocus()&&button.isShown()&&button.isEnabled()&&button.getWidth()>0&&button.getHeight()>0&&opaque&&clipped&&windowVisible&&visible.contains(x,y)&&window.contains(x,y)&&x>=0&&y>=0&&x<displaySize.x&&y<displaySize.y&&button.getWindowToken()==decor.getWindowToken()){center[0]=x;center[1]=y;}
      });
      if(center[0]>=0&&center[0]==previous[0]&&center[1]==previous[1])stable++;else stable=0;
      if(stable>=1)break;previous[0]=center[0];previous[1]=center[1];Thread.sleep(50);
    }while(SystemClock.uptimeMillis()<targetEnd);
    if(stable<1){step("native touch unavailable "+geometry[0]);try{screenshot("rhvideo-native-touch-failure-qa.png");}catch(Exception ignored){}throw new Exception("Native player button has no stable visible hit target: "+geometry[0]);}
    long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,center[0],center[1],0),up=MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,center[0],center[1],0);
    step("native touch "+resource+" center="+center[0]+","+center[1]+" readyToDownMs="+(now-readyAt)+" "+geometry[0]);
    try{sendPointerSync(down);sendPointerSync(up);}finally{down.recycle();up.recycle();}
  }
  private void revealPlayerControlsByTouch()throws Exception{
    // A background WebView's controls.show acknowledgement can arrive after
    // auto-hide. Exercise the actual user gesture once, without changing the
    // hide interval, repeatedly revealing, or using View.performClick().
    Activity owner=current;boolean[] visible={false};int[] point={-1,-1};
    runOnMainSync(()->{
      if(owner==null||owner!=current||owner.isFinishing())return;View decor=owner.getWindow().getDecorView();
      View bar=owner.findViewById(owner.getResources().getIdentifier("exo_bottom_bar","id",getTargetContext().getPackageName()));
      visible[0]=bar!=null&&bar.isShown();for(View node=bar;node!=null;node=node.getParent() instanceof View?(View)node.getParent():null)visible[0]&=node.getAlpha()>=.95f;
      if(visible[0])return;
      View content=owner.findViewById(owner.getResources().getIdentifier("exo_content_frame","id",getTargetContext().getPackageName()));
      android.graphics.Rect bounds=new android.graphics.Rect();if(content==null||!content.isShown()||!content.getGlobalVisibleRect(bounds)||!decor.hasWindowFocus())return;
      int[] rootScreen={0,0};decor.getRootView().getLocationOnScreen(rootScreen);bounds.offset(rootScreen[0],rootScreen[1]);android.graphics.Point screen=new android.graphics.Point();if(decor.getDisplay()!=null)decor.getDisplay().getRealSize(screen);
      int x=bounds.left+bounds.width()/4,y=bounds.top+bounds.height()/2;if(bounds.width()>0&&bounds.height()>0&&x>=0&&y>=0&&x<screen.x&&y<screen.y){point[0]=x;point[1]=y;}
    });
    if(visible[0]){step("native controller already visible; no reveal gesture");return;}
    require(point[0]>=0&&current==owner,"Player content must have a focused on-screen reveal target");long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,point[0],point[1],0),up=MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,point[0],point[1],0);
    try{sendPointerSync(down);sendPointerSync(up);}finally{down.recycle();up.recycle();}step("native controller revealed by one physical tap");
  }
  private void clickPlayerText(String... labels)throws Exception{
    long end=System.currentTimeMillis()+8000;
    do{android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();if(root!=null&&getTargetContext().getPackageName().equals(String.valueOf(root.getPackageName())))for(String label:labels)for(android.view.accessibility.AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText(label)){
      if(!node.isVisibleToUser()||!node.isEnabled())continue;
      // AppCompat PopupMenu rows dispatch through ListView.onItemClick rather
      // than advertising a clickable TextView/ancestor. Touch the visible row,
      // as a user does, instead of silently skipping its accessibility node.
      android.graphics.Rect bounds=new android.graphics.Rect();node.getBoundsInScreen(bounds);if(bounds.isEmpty())continue;
      long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,bounds.exactCenterX(),bounds.exactCenterY(),0),up=MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,bounds.exactCenterX(),bounds.exactCenterY(),0);
      try{sendPointerSync(down);sendPointerSync(up);}finally{down.recycle();up.recycle();}return;
    }Thread.sleep(150);}while(System.currentTimeMillis()<end);
    android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();StringBuilder visible=new StringBuilder();collectNativeText(root,visible);
    try{screenshot("rhvideo-menu-failure-qa.png");}catch(Exception ignored){}
    throw new Exception("Native controller menu item not available: "+java.util.Arrays.toString(labels)+"; package="+(root==null?"none":root.getPackageName())+"; visible="+visible);
  }
  private void collectNativeText(android.view.accessibility.AccessibilityNodeInfo node,StringBuilder out){if(node==null||out.length()>1600)return;if(node.isVisibleToUser()&&node.getText()!=null)out.append(node.getText()).append(" | ");for(int i=0;i<node.getChildCount();i++)collectNativeText(node.getChild(i),out);}
  private void checkReferencePlaylist()throws Exception{
    action("preferences.set",new JSONObject().put("key","segment").put("value",15));
    action("preferences.set",new JSONObject().put("key","fullLength").put("value",false));
    action("gallery.open",new JSONObject());action("playlist.start",new JSONObject());JSONObject state=waitPlayer("video-0",true);
    require(state.getInt("count")==6&&state.getJSONObject("options").getString("mode").equals("segments"),"Segment queue is the full gallery snapshot, not a card page");
    require(state.getLong("segmentEndMs")-state.getLong("segmentStartMs")==15000&&state.getLong("durationMs")>=19500,"Whole-file seekbar must not be replaced by clip-relative time: "+state);
    action("player.control",new JSONObject().put("command","pause"));action("player.control",new JSONObject().put("command","seek").put("value",500));state=waitPlayer("video-0",false);
    require(state.getLong("positionMs")>=400&&state.getLong("positionMs")<1000,"Can seek before the planned segment, in whole-file milliseconds");
    long input=state.getLong("inputId");action("player.options",new JSONObject().put("rate",1.5).put("loop",true));state=(JSONObject)action("player.state",new JSONObject());
    require(state.getLong("inputId")==input&&!state.getBoolean("playWhenReady"),"Rate/repeat must not rebuild or resume a paused decoder");
    long endpointTarget=state.getLong("segmentEndMs")-1500,seekFrames=state.getLong("renderedFrames");
    action("player.control",new JSONObject().put("command","seek").put("value",endpointTarget));state=waitPausedPlayerFrame("video-0",endpointTarget,seekFrames);long endpointFrames=state.getLong("renderedFrames");action("player.control",new JSONObject().put("command","resume"));
    // The one-shot observation includes the emulator's cold seek/decode, not
    // just delivery of the endpoint message. No intermediate status calls or
    // WebView timers can drive the transition during this interval.
    runOnMainSync(()->library.pauseTimers());try{Thread.sleep(8000);}finally{runOnMainSync(()->library.resumeTimers());}
    state=(JSONObject)action("player.state",new JSONObject());require(state.getString("id").equals("video-0")&&state.getLong("inputId")==input&&state.getLong("positionMs")<endpointTarget-500,"Native segment endpoint must wrap without web timers or status polling: "+state);
    // A wrapped position is not a displayed frame: cold decoder seek may still
    // be buffering. Separately require actual playback and new output buffers.
    state=waitPlayer("video-0",true);require(state.getLong("inputId")==input&&state.getLong("renderedFrames")>endpointFrames,"Loop recovery must display new frames in the same native input");
    action("player.control",new JSONObject().put("command","pause"));seekFrames=((JSONObject)action("player.state",new JSONObject())).getLong("renderedFrames");action("player.control",new JSONObject().put("command","seek").put("value",5000));waitPausedPlayerFrame("video-0",5000,seekFrames);action("player.next",new JSONObject());waitPlayer("video-1",true);
    JSONObject history=((JSONObject)action("playback.history",new JSONObject())).getJSONObject("items");require(Math.abs(history.getJSONObject("video-0").getDouble("seconds")-5)<.2,"Manual navigation saves the old video's actual whole-file position before replacing the window");action("panel.close",new JSONObject().put("id","wb-info"));action("player.previous",new JSONObject());waitPlayer("video-0",true);
    action("player.previous",new JSONObject());state=waitPlayer("video-5",true);require(state.getInt("index")==5,"Previous wraps around the full queue");
    require(Boolean.TRUE.equals(expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke('native.media.control',{command:'volume',value:13,expectedInputId:"+input+"}).then(()=>false,()=>true)")),"Late controls cannot mutate a replacement decoder even if the same video returns later");
    action("player.next",new JSONObject());waitPlayer("video-0",true);
    action("player.control",new JSONObject().put("command","pause"));action("player.options",new JSONObject().put("portraitOnly",true));state=waitPlayer("video-0",false);require(state.getInt("count")==3&&state.getJSONObject("options").getBoolean("fullLength"),"Portrait projection keeps only the three actual portrait sources");
    action("player.close",new JSONObject());library=waitView("RhVideoActivity");action("playlist.start",new JSONObject());state=waitPlayer("video-0",true);require(state.getInt("count")==3,"Reopen preserves the portrait mode, without discarding the original source pool");action("player.control",new JSONObject().put("command","pause"));
    action("player.options",new JSONObject().put("portraitOnly",false));state=waitPlayer("video-0",false);require(state.getInt("count")==6&&!state.getJSONObject("options").getBoolean("fullLength"),"Unfilter restores the original full gallery pool without resuming");
    action("player.seekQueue",new JSONObject().put("ratio",.5));state=waitPlayer("video-3",false);require(state.getInt("index")==3,"Total progress seeks over all weighted segment lengths");
    String lease=state.getString("lease");expression(library,"RHVideoNative.request('playlist.prepare',{ticket:'other-view-qa',reset:true,items:[{id:'video-51',title:'other viewer'}],options:{fullLength:true}})");
    action("player.next",new JSONObject());state=waitPlayer("video-4",true);require(state.getString("lease").equals(lease),"Preparing another viewer cannot destroy an active native queue");
    action("player.control",new JSONObject().put("command","pause"));action("player.control",new JSONObject().put("command","controls.show"));
    // Exercise the actual controller menu, not an SDK method R8 may inline
    // away from the minified APK's public interface used by a separate probe.
    touchPlayerButton("exo_settings");clickPlayerText("速度","Speed","播放速度");clickPlayerText("1.25");require(Math.abs(((JSONObject)action("player.state",new JSONObject())).getJSONObject("options").getDouble("rate")-1.25)<.01,"Native controller speed settings must use the same persistent mode options");
    screenshot("rhvideo-playlist-qa.png");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("playlist.start",new JSONObject());state=waitPlayer("video-4",true);require(Math.abs(state.getDouble("rate")-1.25)<.01&&state.getBoolean("repeat"),"Reopen restores the same ordered queue's mode controls and cursor");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("playlist.sequential",new JSONObject());state=waitPlayer(null,true);require(state.getInt("count")==52&&state.getJSONObject("options").getBoolean("fullLength")&&!state.getJSONObject("options").getBoolean("portraitOnly"),"Sequential queue is independent and uses the full current list");
    action("player.control",new JSONObject().put("command","pause"));action("player.seekQueue",new JSONObject().put("ratio",1));state=waitPlayer(null,false);require(state.getInt("index")==51&&state.getLong("positionMs")<1000,"Queue endpoint selects the last item's start, like reference");
    touchPlayerButton("exo_next");state=waitPlayer(null,true);require(state.getInt("index")==0,"Actual native Next button wraps globally beyond the 21-item decoder window");
    touchPlayerButton("exo_prev");state=waitPlayer(null,true);require(state.getInt("index")==51,"Actual native Previous button wraps globally beyond the decoder window");
    action("player.control",new JSONObject().put("command","seek").put("value",19500));library=waitView("RhVideoActivity");
    // Screenshot frame playback uses an explicit source time, not the queue's
    // default segment position; no fabricated HTML media element is involved.
    action("gallery.inspect",new JSONObject().put("index",1));JSONObject frame=((JSONObject)action("image.state",new JSONObject())).getJSONObject("current");long frameMs=Math.round(frame.getDouble("seconds")*1000);require(frameMs>0&&frameMs<17000,"Fixture must exercise a non-zero screenshot timestamp");action("image.playFrame",new JSONObject());state=waitPlayer(null,true);require(state.getLong("durationMs")>=19500&&state.getLong("positionMs")>=frameMs-200&&state.getLong("positionMs")<frameMs+3000,"Frame entry uses the submitted source time in native whole-file media: "+state);action("player.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private JSONObject waitImage(int index)throws Exception{
    long end=System.currentTimeMillis()+15000;JSONObject state=null;
    do{state=(JSONObject)action("image.state",new JSONObject());if(state.optBoolean("opened")&&state.optInt("index")==index&&eval(library,"document.getElementById('full-image').naturalWidth>0").equals("true"))return state;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    String ui=eval(library,"JSON.stringify((()=>{const image=document.getElementById('full-image');return {src:image.currentSrc||image.src,complete:image.complete,width:image.naturalWidth,height:image.naturalHeight,position:document.getElementById('image-position').textContent,notice:document.getElementById('notice').textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)};})())");
    throw new Exception("Parent screenshot did not return: "+state+" UI: "+ui);
  }
  private void checkImageToolbar()throws Exception{
    JSONObject image=(JSONObject)action("image.state",new JSONObject());
    JSONObject geometry=(JSONObject)expression(library,"(()=>{const bar=document.querySelector('#image-dialog .viewer-bar'),row=bar.querySelector(':scope>div'),title=document.getElementById('image-title').getBoundingClientRect(),close=document.getElementById('image-close'),r=row.getBoundingClientRect(),c=close.getBoundingClientRect(),buttons=[...row.children].filter(n=>n.tagName==='BUTTON'&&n!==close&&n.getClientRects().length);return {width:innerWidth,titleFits:title.left>=0&&title.right<=innerWidth,titleAbove:title.bottom<=r.top,closeVisible:c.left>=0&&c.right<=innerWidth&&c.top>=0&&c.bottom<=r.top&&close.contains(document.elementFromPoint(c.x+c.width/2,c.y+c.height/2)),touchTargets:buttons.length>=5&&buttons.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44}),separateLabels:buttons.every((n,i)=>!i||n.getBoundingClientRect().left>=buttons[i-1].getBoundingClientRect().right),overflow:row.scrollWidth>row.clientWidth+1,stageHeight:document.querySelector('#image-dialog .image-stage').clientHeight,viewportHeight:innerHeight};})()");
    require(geometry.getBoolean("titleFits")&&geometry.getBoolean("titleAbove")&&geometry.getBoolean("closeVisible")&&geometry.getBoolean("touchTargets")&&geometry.getBoolean("separateLabels")&&geometry.getInt("stageHeight")>geometry.getInt("viewportHeight")*.6,"Mobile preview title, fixed close and distinct touch targets must not crowd out the image: "+geometry);
    screenshot("rhvideo-image-toolbar-start-qa.png");
    if(geometry.getBoolean("overflow")){
      expression(library,"(()=>{const row=document.querySelector('#image-dialog .viewer-bar>div');window.__toolbarClicks=0;window.__toolbarClickObserver=()=>window.__toolbarClicks++;row.addEventListener('click',window.__toolbarClickObserver,true);return true;})()");
      try{
        touchStrip("#image-dialog .viewer-bar>div",true);long end=SystemClock.uptimeMillis()+5000;
        while(!Boolean.TRUE.equals(expression(library,"document.querySelector('#image-dialog .viewer-bar>div').scrollLeft>1"))&&SystemClock.uptimeMillis()<end)Thread.sleep(50);
        require(Boolean.TRUE.equals(expression(library,"(()=>{const row=document.querySelector('#image-dialog .viewer-bar>div'),close=document.getElementById('image-close'),c=close.getBoundingClientRect();return row.scrollLeft>1&&window.__toolbarClicks===0&&close.contains(document.elementFromPoint(c.x+c.width/2,c.y+c.height/2));})()")),"A physical toolbar swipe must reveal overflow without executing a command or moving the fixed close");
        JSONObject after=(JSONObject)action("image.state",new JSONObject());require(after.getString("previewId").equals(image.getString("previewId"))&&after.getInt("index")==image.getInt("index"),"Toolbar scrolling cannot navigate or close the preview");
        screenshot("rhvideo-image-toolbar-end-qa.png");
      }finally{expression(library,"(()=>{document.querySelector('#image-dialog .viewer-bar>div').removeEventListener('click',window.__toolbarClickObserver,true);delete window.__toolbarClickObserver;delete window.__toolbarClicks;return true;})()");}
    }else screenshot("rhvideo-image-toolbar-end-qa.png");
    step("mobile image toolbar geometry and real overflow gesture verified "+geometry);
  }
  private JSONObject waitPreviewResult()throws Exception{
    long end=System.currentTimeMillis()+15000;JSONObject state=null;
    do{state=(JSONObject)action("preview.state",new JSONObject());if(state.has("run")&&!state.optBoolean("running"))return state;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Preview writes did not finish: "+state);
  }
  private JSONObject waitFavorite(boolean enabled,boolean failure)throws Exception{
    long end=System.currentTimeMillis()+15000;JSONObject state=null;
    do{state=(JSONObject)action("player.state",new JSONObject());if(!state.optBoolean("favoriteBusy")&&state.optBoolean("favorite")==enabled&&(failure?!state.isNull("favoriteError"):state.isNull("favoriteError")))return state;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Native favorite did not finish: "+state);
  }
  private void waitNativeText(String text)throws Exception{
    long end=System.currentTimeMillis()+8000;do{android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();if(root!=null)for(android.view.accessibility.AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText(text))if(node.isVisibleToUser())return;Thread.sleep(100);}while(System.currentTimeMillis()<end);throw new Exception("Native text is not visible: "+text);
  }
  private JSONObject inspectVideoFrame(String id)throws Exception{
    action("gallery.open",new JSONObject());
    for(int index=0;index<48;index+=8){action("gallery.inspect",new JSONObject().put("index",index));JSONObject state=(JSONObject)action("image.state",new JSONObject());if(id.equals(state.getJSONObject("current").optString("videoId")))return state;}
    throw new Exception("Fixture video is missing from gallery: "+id);
  }
  private void checkReferencePreview()throws Exception{
    action("gallery.open",new JSONObject());action("gallery.inspect",new JSONObject().put("index",5));JSONObject image=waitImage(5);String preview=image.getString("previewId");
    action("image.playFrame",new JSONObject());JSONObject state=waitPlayer("video-0",true);action("player.control",new JSONObject().put("command","pause"));
    require(state.getLong("positionMs")>=9800,"Play-at-frame uses the parent screenshot's time");JSONObject parent=state.getJSONObject("options");long generation=((JSONObject)action("state",new JSONObject())).getLong("generation");
    touchPlayerButton("rhvideo_player_mark");require(((JSONObject)action("player.state",new JSONObject())).getBoolean("marked"),"Actual native mark button must set a preview mark");
    require(((JSONObject)action("workbench.diagnostics",new JSONObject())).getInt("selected")==0,"Preview marks are not the file-list multiselection");
    touchPlayerButton("rhvideo_player_favorite");waitFavorite(true,false);
    nativeCall("automation.back",new JSONObject());library=waitView("RhVideoActivity");image=waitImage(5);require(image.getString("previewId").equals(preview),"Back returns to the same parent preview nonce");
    require(((JSONObject)action("preview.pending",new JSONObject())).getJSONArray("items").length()==1&&((JSONObject)action("preview.state",new JSONObject())).length()==0,"Back defers marks until the parent closes");
    require(eval(library,"document.getElementById('wb-image-favorite').getAttribute('aria-pressed')==='true'").equals("true"),"Native favorite change updates the parent screenshot UI");screenshot("rhvideo-parent-qa.png");
    action("image.playVideo",new JSONObject());state=waitPlayer("video-0",true);require(state.getLong("positionMs")<3000,"Click source video starts from zero, not the screenshot time");action("player.control",new JSONObject().put("command","pause"));touchPlayerButton("exo_next");library=waitView("RhVideoActivity");waitImage(6);
    action("image.playVideo",new JSONObject());waitPlayer("video-0",true);action("player.control",new JSONObject().put("command","pause"));touchPlayerButton("exo_prev");library=waitView("RhVideoActivity");waitImage(5);
    action("image.playVideo",new JSONObject());waitPlayer("video-0",true);action("player.control",new JSONObject().put("command","pause"));touchPlayerButton("rhvideo_player_close");library=waitView("RhVideoActivity");
    JSONObject committed=waitPreviewResult();require(committed.getJSONArray("items").length()==1&&committed.getJSONArray("items").getJSONObject(0).getBoolean("success"),"Whole close commits explicit marks exactly once");
    require(!((JSONObject)action("image.state",new JSONObject())).getBoolean("opened"),"Whole close also closes the parent image");action("preview.commit",new JSONObject());action("panel.close",new JSONObject().put("id","wb-preview-results"));
    action("gallery.open",new JSONObject());action("gallery.inspect",new JSONObject().put("index",1));JSONObject newer=(JSONObject)action("image.state",new JSONObject());
    JSONObject stale=(JSONObject)action("image.returnFromVideo",new JSONObject().put("generation",generation).put("parentKey",parent.getString("parentKey")).put("parentPreview",preview).put("close",true));require(stale.optBoolean("stale")&&((JSONObject)action("image.state",new JSONObject())).getString("previewId").equals(newer.getString("previewId")),"A late old close cannot close a newer preview");action("image.close",new JSONObject());
    image=inspectVideoFrame("video-2");action("selection.markCurrent",new JSONObject());require(((JSONObject)action("workbench.diagnostics",new JSONObject())).getInt("selected")==0,"Image preview marks also use the independent pending set");action("image.close",new JSONObject());
    JSONObject failed=waitPreviewResult();require(failed.getInt("completed")==1&&!failed.getJSONArray("items").getJSONObject(0).getBoolean("success")&&((JSONObject)action("preview.pending",new JSONObject())).getJSONArray("items").length()==0,"Failed preview writes remain terminal and do not re-enter pending marks");
    action("preview.result",new JSONObject());require(eval(library,"document.getElementById('wb-preview-results').innerText.includes('失败')").equals("true"),"Failure details are visible in a persistent results UI");screenshot("rhvideo-preview-result-qa.png");action("panel.close",new JSONObject().put("id","wb-preview-results"));
    action("preview.state",new JSONObject());require(eval(library,"!document.getElementById('wb-preview-results').open").equals("true"),"Reading result state does not reopen a closed dialog");
    action("category",new JSONObject().put("kind","picture"));action("media.open",new JSONObject().put("kind","picture").put("id","picture-3"));action("image.close",new JSONObject());action("preview.commit",new JSONObject());
    require(((JSONObject)action("preview.state",new JSONObject())).getLong("run")==failed.getLong("run"),"A later unrelated close cannot create a retry run");
    action("category",new JSONObject().put("kind","video"));action("media.open",new JSONObject().put("kind","video").put("id","video-3"));state=waitPlayer("video-3",true);action("player.control",new JSONObject().put("command","pause"));
    require(state.getJSONObject("options").getString("origin").equals("frame")&&!((JSONObject)action("image.state",new JSONObject())).getBoolean("opened"),"A normal video card retains its first screenshot without flashing the gallery");
    long input=state.getLong("inputId");String lease=state.getString("lease");expression(library,"RHVideoNative.request('playlist.prepare',{ticket:'invalid-preview-qa',reset:true,items:[{id:'video-1'}],options:{fullLength:true}})");
    require(Boolean.TRUE.equals(expression(library,"RHVideoNative.request('play',{playlist:'invalid-preview-qa',id:'absent'}).then(()=>false,()=>true)")),"Invalid new target must be rejected");state=(JSONObject)action("player.state",new JSONObject());require(state.getLong("inputId")==input&&state.getString("lease").equals(lease),"Invalid new play must leave the current native input and lease intact");
    touchPlayerButton("rhvideo_player_favorite");waitFavorite(false,true);action("player.control",new JSONObject().put("command","options"));waitNativeText("收藏失败");
    screenshot("rhvideo-favorite-error-qa.png");nativeCall("automation.back",new JSONObject());
    require(((JSONObject)action("player.state",new JSONObject())).getLong("inputId")==input,"The public Back action dismisses the native menu without closing or replacing its video");
    action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("media.open",new JSONObject().put("kind","video").put("id","video-1"));waitPlayer("video-1",true);action("player.mark",new JSONObject());action("connection.logout",new JSONObject());library=waitView("RhVideoActivity");
  }
  private WebView find(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}return null;}
  private String eval(WebView web,String script)throws Exception{
    CountDownLatch latch=new CountDownLatch(1);String[] result={"null"};runOnMainSync(()->web.evaluateJavascript(script,r->{result[0]=r;latch.countDown();}));
    if(!latch.await(15,TimeUnit.SECONDS)){android.util.Log.e("RHVideoQA",playbackThreads());throw new Exception("JavaScript evaluation timed out");}return result[0];
  }
  private String playbackThreads(){StringBuilder text=new StringBuilder("Native playback thread snapshot (no arguments or media addresses)");for(java.util.Map.Entry<Thread,StackTraceElement[]> entry:Thread.getAllStackTraces().entrySet()){String name=entry.getKey().getName();if(!name.equals("main")&&!name.equals("RenderThread")&&!name.startsWith("ExoPlayer:")&&!name.startsWith("Loader:"))continue;text.append("\nTHREAD ").append(name).append(" ").append(entry.getKey().getState());for(StackTraceElement frame:entry.getValue())text.append("\n  ").append(frame);}return text.toString();}
  private Object expression(WebView web,String expression)throws Exception{
    String request=java.util.UUID.randomUUID().toString(),nonce=JSONObject.quote(request);
    // Reset separately: a syntax error in the next script must never leave a
    // previous successful result looking like this call's acknowledgement.
    eval(web,"window.__rhQa={request:"+nonce+"};true");
    eval(web,"void(async()=>{const publish=result=>{if(window.__rhQa?.request==="+nonce+")window.__rhQa={request:"+nonce+",...result};};try{const value=await ("+expression+");publish({value:value===undefined?null:value});}catch(e){publish({error:String(e)});}})();");
    long end=System.currentTimeMillis()+45000;
    do{Object text=new JSONTokener(eval(web,"JSON.stringify(window.__rhQa||{})")).nextValue();JSONObject result=new JSONObject(String.valueOf(text));
      if(request.equals(result.optString("request"))){if(result.has("error"))throw new Exception(result.getString("error"));if(result.has("value"))return result.get("value");}Thread.sleep(100);
    }while(System.currentTimeMillis()<end);throw new Exception("Action timed out");
  }
  private void observePlayerOpening(){
    // Instrumented ANRs are terminated before Android writes its usual trace.
    // Capture a bounded three read-only stacks before the 5 s input deadline,
    // including asynchronous Activity creation after media.open has returned.
    Thread observer=new Thread(()->{try{for(int i=0;i<3;i++){Thread.sleep(1500);android.util.Log.i("RHVideoQA","Opening snapshot uptime="+SystemClock.uptimeMillis()+" sample="+i+"\n"+playbackThreads());}}catch(InterruptedException e){Thread.currentThread().interrupt();}},"RHVideoQA-opening");observer.setDaemon(true);observer.start();
  }
  private Object action(String name,JSONObject p)throws Exception{Bundle step=new Bundle();step.putString("stream","STEP: rhvideo."+name+"\n");sendStatus(0,step);if("media.open".equals(name)||"image.playVideo".equals(name))observePlayerOpening();return expression(library,"RHFilesAPI.invoke("+JSONObject.quote("rhvideo."+name)+","+p+")");}
  private void step(String name){Bundle value=new Bundle();value.putString("stream","STEP: "+name+"\n");sendStatus(0,value);}
  private Object nativeCall(String name,JSONObject p)throws Exception{step("native."+name);return expression(main,"api.native("+JSONObject.quote(name)+","+p+")");}
  private Object mainAction(String name,JSONObject p)throws Exception{step("files."+name);return expression(main,"(RHFilesAPI.forPane?RHFilesAPI.forPane('active'):RHFilesAPI).invoke("+JSONObject.quote(name)+","+p+")");}
  private void assertPreviewPixels()throws Exception{
    assertPreviewPixels("#wb-image-preview img","rhvideo-image-content-qa.png");
  }
  private void assertRestoredCoverPixels()throws Exception{
    long end=System.currentTimeMillis()+8000;String diagnostic="";
    do{
      JSONObject rect=(JSONObject)expression(library,"(()=>{const n=document.querySelector('.cover-button img'),r=n?.getBoundingClientRect();return {loaded:!!n?.complete&&n.naturalWidth===1600&&n.naturalHeight===1000&&n.classList.contains('loaded'),opacity:n?Number(getComputedStyle(n).opacity):0,viewport:innerWidth,x:r?.x||0,y:r?.y||0,width:r?.width||0,height:r?.height||0};})()");
      int[] web={0,0,0};runOnMainSync(()->{library.getLocationOnScreen(web);web[2]=library.getWidth();});double scale=web[2]/rect.getDouble("viewport"),width=rect.getDouble("width"),height=rect.getDouble("height"),imageScale=Math.max(width/1600,height/1000);
      android.graphics.Bitmap pixels=getUiAutomation().takeScreenshot();boolean valid=pixels!=null&&rect.getBoolean("loaded")&&rect.getDouble("opacity")>=.98&&width>0&&height>0;StringBuilder colors=new StringBuilder();
      if(valid)for(int point=0;point<2;point++){
        double fraction=point==0?.25:.75;int x=web[0]+(int)((rect.getDouble("x")+width*fraction)*scale),y=web[1]+(int)((rect.getDouble("y")+height*fraction)*scale);
        if(x<0||y<0||x>=pixels.getWidth()||y>=pixels.getHeight()){valid=false;break;}
        // Real sibling fixture: nested 40px/20px RGB rectangles encoded as
        // WebP. Account for the card's object-fit:cover crop, not a CSS color.
        double sourceX=(width*fraction+(1600*imageScale-width)/2)/imageScale,sourceY=(height*fraction+(1000*imageScale-height)/2)/imageScale;
        int index=Math.min(39,Math.min((int)(sourceX/40),(int)(sourceY/20))),color=pixels.getPixel(x,y),r=(color>>16)&255,g=(color>>8)&255,b=color&255;
        colors.append(String.format(" %06x",color&0xffffff));valid&=Math.abs(r-(40+index*4))<=25&&Math.abs(g-(160-index*2))<=25&&Math.abs(b-(90+index*3))<=25;
      }
      if(valid){try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),"rhvideo-login-restored-qa.png"))){pixels.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}finally{pixels.recycle();}return;}
      if(pixels!=null)pixels.recycle();diagnostic=rect+"; actual pixels="+colors;Thread.sleep(100);
    }while(System.currentTimeMillis()<end);
    throw new Exception("Restored authenticated cover never appeared in native pixels: "+diagnostic);
  }
  private void assertPreviewPixels(String selector,String filename)throws Exception{
    long end=System.currentTimeMillis()+8000;String diagnostic="";
    do{
      JSONObject rect=(JSONObject)expression(library,"(()=>{const n=document.querySelector("+JSONObject.quote(selector)+"),r=n?.getBoundingClientRect(),w=n?.naturalWidth?Math.min(r.width,r.height*n.naturalWidth/n.naturalHeight):0,h=w?n.naturalHeight*w/n.naturalWidth:0;return {open:!!n?.closest('dialog')?.open,opacity:n?Number(getComputedStyle(n.closest('.wb-slide')||n).opacity):0,viewport:innerWidth,x:r?r.x+(r.width-w)/2:0,y:r?r.y+(r.height-h)/2:0,width:w,height:h};})()");
      int[] web={0,0,0};runOnMainSync(()->{library.getLocationOnScreen(web);web[2]=library.getWidth();});double scale=web[2]/rect.getDouble("viewport");
      android.graphics.Bitmap pixels=getUiAutomation().takeScreenshot();boolean valid=pixels!=null&&rect.getBoolean("open")&&rect.getDouble("opacity")>=.98&&rect.getDouble("width")>0&&rect.getDouble("height")>0;StringBuilder colors=new StringBuilder();
      if(valid)for(int corner=0;corner<4;corner++){
        int x=web[0]+(int)((rect.getDouble("x")+rect.getDouble("width")*(corner%2==0?.25:.75))*scale),y=web[1]+(int)((rect.getDouble("y")+rect.getDouble("height")*(corner<2?.25:.75))*scale);
        if(x<0||y<0||x>=pixels.getWidth()||y>=pixels.getHeight()){valid=false;break;}
        int color=pixels.getPixel(x,y),r=(color>>16)&255,g=(color>>8)&255,b=color&255;colors.append(String.format(" %06x",color&0xffffff));
        valid&=corner==0?r>160&&g<90&&b<90:corner==1?g>160&&r<90&&b<90:corner==2?b>160&&r<90&&g<90:r>160&&g>160&&b<90;
      }
      if(valid){try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),filename))){pixels.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}finally{pixels.recycle();}return;}
      if(pixels!=null)pixels.recycle();diagnostic=rect+"; actual pixels="+colors;Thread.sleep(100);
    }while(System.currentTimeMillis()<end);
    throw new Exception("Decoded image never appeared in the actual native screenshot: "+diagnostic);
  }
  private void requirePausedLifecycleState(JSONObject state,String phase)throws Exception{
    require("video-2".equals(state.getString("id"))&&!state.getBoolean("playWhenReady")&&!state.getBoolean("playing"),phase+": restore the actual paused source");
    require(Math.abs(state.getLong("positionMs")-5000)<500&&state.getLong("renderedFrames")>0,phase+": the restored decoder must produce a frame at the saved position");
    require(Math.abs(state.getDouble("rate")-1.25)<.01&&state.getBoolean("repeat")&&Math.abs(state.getDouble("volume")-37)<.1,phase+": speed, loop and local volume must survive");
    require(!state.getJSONObject("tracks").getBoolean("subtitlesEnabled"),phase+": explicitly disabled subtitles must not silently turn back on");
  }
  private void checkPlaybackLifecycle()throws Exception{
    action("media.open",new JSONObject().put("kind","video").put("id","video-2"));action("player.control",new JSONObject().put("command","pause"));
    JSONObject first=waitPlayer("video-2",false);boolean text=false;JSONArray groups=first.getJSONObject("tracks").getJSONArray("groups");for(int i=0;i<groups.length();i++)text|="text".equals(groups.getJSONObject(i).getString("type"));require(text,"Lifecycle fixture must contain a real subtitle track as well as video and AAC");
    action("player.control",new JSONObject().put("command","seek").put("value",5000));action("player.control",new JSONObject().put("command","rate").put("value",1.25));action("player.control",new JSONObject().put("command","repeat").put("enabled",true));action("player.control",new JSONObject().put("command","volume").put("value",37));mainAction("native.media.control",new JSONObject().put("command","subtitles").put("enabled",false));
    JSONObject before=waitPlayer("video-2",false);requirePausedLifecycleState(before,"before background");Activity original=current;Intent resume=new Intent(original.getIntent()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_REORDER_TO_FRONT|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    require(getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME),"Owned emulator HOME must be accepted");long end=SystemClock.uptimeMillis()+10000;while(!stoppedActivities.contains(original)&&SystemClock.uptimeMillis()<end)Thread.sleep(50);require(stoppedActivities.contains(original),"The actual Android onStop callback must occur before resuming");
    getTargetContext().startActivity(resume);end=SystemClock.uptimeMillis()+10000;while((stoppedActivities.contains(original)||current!=original)&&SystemClock.uptimeMillis()<end)Thread.sleep(50);require(current==original&&!stoppedActivities.contains(original),"Returning from HOME resumes the same Activity, not a newly opened player");
    JSONObject returned=waitPlayer("video-2",false);require(returned.getLong("inputId")!=before.getLong("inputId"),"A released native decoder must have a new identity after backgrounding");requirePausedLifecycleState(returned,"after background");
    Activity retiring=current;runOnMainSync(retiring::recreate);end=SystemClock.uptimeMillis()+15000;while((current==retiring||!current.getClass().getSimpleName().equals("PlaybackActivity"))&&SystemClock.uptimeMillis()<end)Thread.sleep(50);require(current!=retiring&&current.getClass().getSimpleName().equals("PlaybackActivity"),"Framework recreation must produce a new playback Activity");
    JSONObject recreated=waitPlayer("video-2",false);require(recreated.getString("lease").equals(returned.getString("lease"))&&recreated.getLong("inputId")!=returned.getLong("inputId"),"Recreation retains the viewer lease but not the retired decoder");requirePausedLifecycleState(recreated,"after recreation");
    boolean stale=false;try{mainAction("native.media.control",new JSONObject().put("command","volume").put("value",91).put("expectedInputId",returned.getLong("inputId")));}catch(Exception expected){stale=expected.toString().contains("播放输入已改变");}require(stale,"An old decoder control cannot alter the restored player");requirePausedLifecycleState((JSONObject)action("player.state",new JSONObject()),"after stale control");
    screenshot("rhvideo-lifecycle-player-qa.png");step("lifecycle actual HOME/onStop/resume and framework recreation verified");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private JSONObject waitPausedGridLifecycle(long previousFrames)throws Exception{
    long end=SystemClock.uptimeMillis()+30000;JSONObject state=null;
    do{state=(JSONObject)nativeCall("automation.grid.state",new JSONObject());JSONArray cells=state.getJSONArray("cells");boolean ready=cells.length()==3;
      for(int i=0;i<cells.length();i++){JSONObject cell=cells.getJSONObject(i);ready&=cell.getBoolean("paused")&&cell.getInt("playbackState")==3&&cell.getBoolean("rendered")&&cell.getLong("renderedFrames")>0;}
      if(ready){JSONObject cell=cells.getJSONObject(2);if(cell.getLong("submittedFrames")>previousFrames&&Math.abs(cell.getLong("frameTimeMs")-5000)<500&&Math.abs(cell.getLong("positionMs")-5000)<500)return state;}Thread.sleep(150);
    }while(SystemClock.uptimeMillis()<end);throw new Exception("Actual paused lifecycle grid frames did not settle: "+state);
  }
  private void requireGridLifecycleState(JSONObject state,String phase)throws Exception{
    require(gridIds(state).toString().equals("[\"video-0\",\"video-1\",\"video-2\"]"),phase+": retain the same ordered group");JSONObject cell=state.getJSONArray("cells").getJSONObject(2);
    require(Math.abs(cell.getDouble("rate")-1.25)<.01&&cell.getBoolean("repeat")&&cell.getInt("volume")==37&&!cell.getBoolean("muted"),phase+": retain each cell's speed, loop and volume");
    require(!cell.getJSONObject("tracks").getBoolean("subtitlesEnabled"),phase+": the selected grid cell's disabled subtitles must survive decoder replacement");
    for(int i=0;i<2;i++){JSONObject other=state.getJSONArray("cells").getJSONObject(i);require(other.getInt("volume")==100&&other.getJSONObject("tracks").getBoolean("subtitlesEnabled"),phase+": choices cannot leak into another grid cell");}
  }
  private void checkGridLifecycle()throws Exception{
    action("gallery.open",new JSONObject());action("grid.open",new JSONObject());gridControl(-1,"pause",0);JSONObject initial=waitGrid(3,true);
    JSONArray groups=initial.getJSONArray("cells").getJSONObject(2).getJSONObject("tracks").getJSONArray("groups");boolean text=false;for(int i=0;i<groups.length();i++)text|="text".equals(groups.getJSONObject(i).getString("type"));require(text,"Lifecycle grid must decode a real subtitle track");
    long frames=initial.getJSONArray("cells").getJSONObject(2).getLong("submittedFrames");gridControl(2,"seek",5000);gridControl(2,"rate",1.25);gridControl(2,"volume",37);mainAction("native.grid.control",new JSONObject().put("target",2).put("command","subtitles").put("enabled",false));JSONObject before=waitPausedGridLifecycle(frames);requireGridLifecycleState(before,"before grid background");
    Activity original=current;Intent resume=new Intent(original.getIntent()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_REORDER_TO_FRONT|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    require(getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME),"Grid HOME must be accepted");long end=SystemClock.uptimeMillis()+10000;while(!stoppedActivities.contains(original)&&SystemClock.uptimeMillis()<end)Thread.sleep(50);require(stoppedActivities.contains(original),"Grid must actually stop before resuming");
    getTargetContext().startActivity(resume);end=SystemClock.uptimeMillis()+10000;while((stoppedActivities.contains(original)||current!=original)&&SystemClock.uptimeMillis()<end)Thread.sleep(50);require(current==original&&!stoppedActivities.contains(original),"Grid HOME return must resume the same Activity");
    JSONObject returned=waitPausedGridLifecycle(0);require(returned.getString("lease").equals(before.getString("lease"))&&returned.getJSONArray("cells").getJSONObject(2).getLong("inputId")!=before.getJSONArray("cells").getJSONObject(2).getLong("inputId"),"Grid background retains the lease but replaces the decoder");requireGridLifecycleState(returned,"after grid background");
    Activity retiring=current;runOnMainSync(retiring::recreate);end=SystemClock.uptimeMillis()+15000;while((current==retiring||!current.getClass().getSimpleName().equals("RhVideoGridActivity"))&&SystemClock.uptimeMillis()<end)Thread.sleep(50);require(current!=retiring&&current.getClass().getSimpleName().equals("RhVideoGridActivity"),"Grid recreation must produce a new Activity");
    JSONObject recreated=waitPausedGridLifecycle(0);require(recreated.getString("lease").equals(returned.getString("lease"))&&recreated.getJSONArray("cells").getJSONObject(2).getLong("inputId")!=returned.getJSONArray("cells").getJSONObject(2).getLong("inputId"),"Grid recreation retains its viewer lease but replaces the decoder");requireGridLifecycleState(recreated,"after grid recreation");
    boolean stale=false;try{mainAction("native.grid.control",new JSONObject().put("command","volume").put("target",2).put("value",91).put("expectedInput",returned.getJSONArray("cells").getJSONObject(2).getLong("inputId")));}catch(Exception expected){stale=expected.toString().contains("播放输入已改变");}require(stale,"Retired grid controls cannot modify a replacement decoder");requireGridLifecycleState((JSONObject)action("grid.state",new JSONObject()),"after stale grid control");
    screenshot("rhvideo-lifecycle-grid-qa.png");action("grid.close",new JSONObject());library=waitView("RhVideoActivity");action("grid.open",new JSONObject());gridControl(-1,"pause",0);JSONObject reopened=waitGrid(3,true);for(int i=0;i<3;i++)require(reopened.getJSONArray("cells").getJSONObject(i).getJSONObject("tracks").getBoolean("subtitlesEnabled"),"A fresh viewer cannot inherit the old grid's track choices");action("grid.close",new JSONObject());library=waitView("RhVideoActivity");step("lifecycle grid HOME/onStop/resume and recreation verified without leaking cell or viewer choices");
  }
  private void checkImageContent()throws Exception{
    action("image.preview",new JSONObject().put("path","/storage/pictures/0.svg").put("title","内容探测图片"));
    long end=System.currentTimeMillis()+10000;boolean decoded=false;
    do{decoded="true".equals(eval(library,"document.querySelector('#wb-image-preview img')?.naturalWidth===800&&document.querySelector('#wb-image-preview img')?.naturalHeight===500"));if(decoded)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    require(decoded,"A split, octet-stream PNG must decode through the real image proxy");assertPreviewPixels();action("panel.close",new JSONObject().put("id","wb-image-preview"));
    action("image.preview",new JSONObject().put("path","/storage/pictures/owned-error.svg").put("title","错误响应"));
    end=System.currentTimeMillis()+10000;boolean rejected=false;
    do{rejected="true".equals(eval(library,"document.querySelector('#wb-image-preview .wb-content')?.textContent==='预览加载失败'"));if(rejected)break;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    require(rejected,"A mislabeled HTML error must settle visibly, never become an image: "+eval(library,"document.getElementById('wb-image-preview')?.textContent"));action("panel.close",new JSONObject().put("id","wb-image-preview"));
  }
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
  private void touchDuplicate(String selector)throws Exception{
    expression(library,"(async()=>{document.querySelector("+JSONObject.quote(selector)+").scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;})()");
    require(Boolean.TRUE.equals(expression(library,"(()=>{const n=document.querySelector("+JSONObject.quote(selector)+"),r=n.getBoundingClientRect();return !n.disabled&&r.width>0&&r.height>0&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()")),"Duplicate control must be a physical enabled hit target: "+selector);
    touchStrip(selector,false);
  }
  private JSONObject waitDuplicate(String condition,String label,long timeout)throws Exception{
    long end=System.currentTimeMillis()+timeout;JSONObject state=null;
    do{JSONObject sample=(JSONObject)expression(library,"RHFilesAPI.invoke('rhvideo.duplicates.state').then(s=>({state:s,ready:"+condition+"}))");state=sample.getJSONObject("state");if(sample.getBoolean("ready"))return state;Thread.sleep(150);}while(System.currentTimeMillis()<end);
    throw new Exception("Duplicate workflow did not settle: "+label+"; "+state);
  }
  private void checkActualDuplicates()throws Exception{
    touchDuplicate("#duplicates-nav");waitDuplicate("s.supported===true","actual duplicate status",10000);
    touchDuplicate("[data-api-action='rhvideo.duplicates.scan']");
    JSONObject state=waitDuplicate("['completed','failed','cancelled'].includes(s.scan?.status)","real fingerprints",60000);
    require("completed".equals(state.getJSONObject("scan").getString("status")),"Actual scan must finish: "+state);
    state=waitDuplicate("!s.loading&&s.groups.length===2","completed scan group projection",10000);
    require(state.getJSONObject("scan").getJSONObject("progress").getInt("done")==30&&state.getJSONArray("groups").length()==2,"Actual image/video fingerprint groups");
    touchDuplicate("[data-duplicate-kind='video']");waitDuplicate("s.groups.length===1&&s.groups[0].media_type==='video'","video filter",10000);
    touchDuplicate("[data-member-key='video:real-video'] [data-api-action='rhvideo.duplicates.play']");waitPlayer("real-video",true);
    action("player.back",new JSONObject());library=waitView("RhVideoActivity");
    touchDuplicate("[data-duplicate-kind='picture']");state=waitDuplicate("s.groups[0]?.media_type==='picture'","picture filter",10000);
    while(state.getJSONArray("groups").getJSONObject(0).getJSONObject("members").getJSONArray("items").length()<28){
      int count=state.getJSONArray("groups").getJSONObject(0).getJSONObject("members").getJSONArray("items").length();touchDuplicate("[data-api-action='rhvideo.duplicates.more']");
      state=waitDuplicate("s.groups[0].members.items.length>"+count,"real member page",10000);
    }
    touchDuplicate("[data-member-key='picture:real-picture'] [data-api-action='rhvideo.duplicates.preview']");
    long end=System.currentTimeMillis()+10000;while(!Boolean.TRUE.equals(expression(library,"!!document.querySelector('#wb-image-preview img')?.naturalWidth"))&&System.currentTimeMillis()<end)Thread.sleep(100);
    require(Boolean.TRUE.equals(expression(library,"document.querySelector('#wb-image-preview img')?.naturalWidth===320")),"The actual authenticated fingerprint WebP must decode at its source thumbnail size");
    screenshot("rhvideo-duplicate-preview-qa.png");action("panel.close",new JSONObject().put("id","wb-image-preview"));
    touchDuplicate("[data-member-key='picture:real-picture'] [data-api-action='rhvideo.duplicates.keep']");
    state=waitDuplicate("Object.values(s.choices).includes('picture:real-picture')","physical keeper selection",10000);
    require(Boolean.TRUE.equals(expression(library,"!!document.querySelector('[data-member-key=\"picture:real-picture\"].is-keeper')&&document.querySelector('[data-member-key=\"picture:real-picture\"] [data-api-action=\"rhvideo.duplicates.keep\"]').textContent.includes('已选保留')")),"The selected keeper must also be visibly marked, not only saved in the model");
    expression(library,"new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    JSONObject group=state.getJSONArray("groups").getJSONObject(0);String revision=state.getString("revision");
    screenshot("rhvideo-duplicates-qa.png");touchDuplicate("[data-api-action='rhvideo.duplicates.confirm']");waitDuplicate("s.reviews.length===1","real review accepted",10000);
    action("duplicates.close",new JSONObject());touchDuplicate("#duplicates-nav");
    state=waitDuplicate("['completed','partial','failed'].includes(s.reviews[0]?.status)","durable recoverable review",45000);
    JSONObject job=state.getJSONArray("reviews").getJSONObject(0);require("completed".equals(job.getString("status"))&&job.getInt("done")==27&&job.getInt("failed")==0,"Every actual member stages successfully: "+job);
    JSONObject stale=new JSONObject().put("groupId",group.getString("id")).put("scanId",group.getString("scan_id")).put("keeperKey","picture:real-picture").put("expectedRevision",revision);
    require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.duplicates.confirm',"+stale+").then(()=>false,()=>true)")),"Old snapshot never replays the destructive action");
    JSONObject detail=(JSONObject)action("duplicates.review",new JSONObject().put("id",job.getString("id")));require(detail.getJSONArray("items").length()==25&&detail.getInt("pages")==2,"Actual per-file review first page");
    detail=(JSONObject)action("duplicates.review",new JSONObject().put("id",job.getString("id")).put("page",2));require(detail.getJSONArray("items").length()==2,"Last review results remain reachable");
    action("panel.close",new JSONObject().put("id","wb-duplicate-review"));
    JSONObject trash=(JSONObject)action("remote.trash.list",new JSONObject());require(trash.getInt("retention_days")==30&&trash.getJSONArray("items").length()==27,"Actual sources are recoverable for 30 days");
    require(((JSONObject)action("category",new JSONObject().put("kind","picture"))).getInt("total")==1,"Completed duplicate job invalidates the native picture cache");
    JSONArray items=trash.getJSONArray("items");for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);require(item.getBoolean("has_source")&&"picture".equals(item.getString("media_type")),"Trash keeps the real source");action("remote.trash.restore",new JSONObject().put("params",new JSONObject().put("kind","picture").put("id",item.getString("id"))));}
    require(((JSONObject)action("category",new JSONObject().put("kind","picture"))).getInt("total")==28,"Restoring recovers the full native catalog");
    require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"Every duplicate UI operation has a public API");
  }
  private JSONObject waitTaskPriority(String id)throws Exception{
    long end=System.currentTimeMillis()+15000;JSONObject state=null;
    do{state=(JSONObject)action("task.priorityState",new JSONObject());require(state.optString("error").isEmpty(),"Priority operation failed: "+state);JSONObject receipt=state.optJSONObject("receipt");if(state.isNull("pending")&&receipt!=null&&id.equals(receipt.optString("id")))return state;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    throw new Exception("Priority receipt did not settle: "+id+"; "+state);
  }
  private JSONObject waitTaskCenter(String id)throws Exception{
    long end=System.currentTimeMillis()+15000;JSONObject value=null;
    do{value=(JSONObject)action("task.centerState",new JSONObject());require(value.optString("detailError").isEmpty(),"Task detail failed: "+value);if(id.equals(value.optString("selected"))&&!value.optBoolean("detailLoading")&&value.optJSONObject("detail")!=null)return value;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    throw new Exception("Inline task selection did not settle: "+value);
  }
  private void checkTaskCenter()throws Exception{
    action("server.open",new JSONObject().put("page","tasks"));JSONObject value=waitTaskCenter("video:metrics");
    require(value.getJSONObject("detail").getJSONArray("steps").length()==6,"All recorded workflow steps reach the packaged UI");
    require(value.getJSONObject("detail").getJSONObject("progress").getDouble("percent")==40,"Progress is the actual response value");
    require(Boolean.TRUE.equals(expression(library,"!document.getElementById('wb-info')?.open&&document.querySelectorAll('.rv-task-center table').length===0&&['1 GiB','1.5 KiB','24 fps','2×','耗时 0 秒'].every(text=>document.querySelector('.rv-task-inline-detail').textContent.includes(text))")),"Readable units and zero duration stay inside the task center");
    require(Boolean.TRUE.equals(expression(library,"document.querySelector('.rv-task-history-filters').hidden")),"History filters are not shown for live tasks");
    expression(library,"(()=>{window.__taskRow=document.querySelector('[data-task-id]');window.__taskStep=document.querySelector('.rv-task-inline-detail [data-step=probe]');window.__taskInput=document.querySelector('.rv-task-filters input');document.querySelector('.rv-task-inline-detail').scrollTop=180;window.__taskScroll=document.querySelector('.rv-task-inline-detail').scrollTop;return true})()");
    action("server.refresh",new JSONObject());require(Boolean.TRUE.equals(expression(library,"window.__taskRow===document.querySelector('[data-task-id]')&&window.__taskStep===document.querySelector('.rv-task-inline-detail [data-step=probe]')&&window.__taskInput===document.querySelector('.rv-task-filters input')&&window.__taskScroll===document.querySelector('.rv-task-inline-detail').scrollTop")),"Unchanged refresh preserves real nodes and reading position");
    touchDuplicate("[data-task-id='video:unknown'] [data-api-action='rhvideo.task.select']");value=waitTaskCenter("video:unknown");require(value.getJSONObject("detail").getJSONObject("progress").isNull("percent"),"An unknown percent is not fabricated zero");require(Boolean.TRUE.equals(expression(library,"!document.querySelector('.rv-task-inline-detail progress').hasAttribute('value')")),"Unknown progress is visually indeterminate");
    action("server.filter",new JSONObject().put("key","view").put("value","queued"));require(((JSONObject)action("task.centerState",new JSONObject())).getString("selected").isEmpty(),"Queued tasks wait for user selection");
    action("server.filter",new JSONObject().put("key","pageNumber").put("value",3));require(((JSONObject)action("task.centerState",new JSONObject())).getJSONArray("items").length()==5,"Last task page is accessible");
    touchDuplicate("[data-task-id='video:queue-54'] [data-api-action='rhvideo.task.select']");value=waitTaskCenter("video:queue-54");require(value.getJSONObject("detail").getString("note").contains("计划参数"),"Waiting tasks show planned parameters rather than fabricated results");
    action("server.filter",new JSONObject().put("key","view").put("value","history"));require(Boolean.TRUE.equals(expression(library,"!document.querySelector('.rv-task-history-filters').hidden&&[...document.querySelector('.rv-task-history-filters select:last-child').options].map(n=>n.value).join(',')==='all,succeeded,issues'")),"Default history exposes only meaningful result filters");
    require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.server.filter',{key:'status',value:'skipped'}).then(()=>false,()=>true)")),"Invalid default history filters are rejected by the public API");
    action("server.filter",new JSONObject().put("key","queue").put("value","replacement"));action("server.filter",new JSONObject().put("key","view").put("value","failed"));value=waitTaskCenter("replace:1");require(value.getJSONObject("detail").getString("statusLabel").equals("失败"),"Replacement failure details remain reachable");
    action("server.filter",new JSONObject().put("key","queue").put("value","default"));waitTaskCenter("video:metrics");
    Bundle signal=new Bundle();signal.putString("stream","QA: task-recovery-arm\n");sendStatus(0,signal);
    long end=System.currentTimeMillis()+45000;JSONObject refresh=null;
    do{refresh=(JSONObject)action("server.refreshState",new JSONObject());if(refresh.optInt("failures")==3&&!refresh.optBoolean("running")&&!refresh.optBoolean("scheduled"))break;Thread.sleep(250);}while(System.currentTimeMillis()<end);
    require(refresh!=null&&refresh.optInt("failures")==3&&!refresh.optBoolean("scheduled"),"Actual automatic failures must reach the bounded stop: "+refresh);
    touchDuplicate(".rv-task-inline-detail [data-api-action='rhvideo.task.refreshSelection']");end=System.currentTimeMillis()+15000;
    do{refresh=(JSONObject)action("server.refreshState",new JSONObject());if(refresh.optInt("failures")==0&&refresh.optString("error").isEmpty()&&refresh.optBoolean("enabled")&&refresh.optBoolean("scheduled"))break;Thread.sleep(100);}while(System.currentTimeMillis()<end);
    require(refresh!=null&&refresh.optInt("failures")==0&&refresh.optBoolean("scheduled"),"The physical detail refresh resumes automatic reads: "+refresh);
    end=System.currentTimeMillis()+10000;do{value=(JSONObject)action("task.centerState",new JSONObject());if(value.optString("error").isEmpty())break;Thread.sleep(100);}while(System.currentTimeMillis()<end);require(value.optString("error").isEmpty(),"An actual subsequent list read clears the prior read error");
    require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"Every task center UI action has a public API");
    require(Boolean.TRUE.equals(expression(library,"![...document.querySelectorAll('.rv-task-center button')].some(n=>/重试|取消任务/.test(n.textContent))")),"Task inspection does not add failed-task retry/cancel buttons");
    expression(library,"(()=>{document.querySelector('.rv-task-inline-detail').scrollTop=0;document.getElementById('wb-server').scrollTop=0;return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()");screenshot("rhvideo-task-center-qa.png");
    action("panel.close",new JSONObject().put("id","wb-server"));require(!((JSONObject)action("task.centerState",new JSONObject())).getBoolean("opened"),"Closed workspace drops its active UI state");
  }
  private void checkActualTaskPriority()throws Exception{
    action("server.open",new JSONObject().put("page","tasks"));
    require(Boolean.TRUE.equals(expression(library,"!!document.querySelector('[data-task-id=\"video:queue-running\"]')&&document.querySelectorAll('#wb-server [data-api-action=\"rhvideo.task.prioritize\"]').length===0")),"Running tasks cannot advertise promotion");
    action("server.filter",new JSONObject().put("key","view").put("value","queued"));action("server.filter",new JSONObject().put("key","pageNumber").put("value",3));
    JSONObject before=(JSONObject)action("remote.tasks.detail",new JSONObject().put("params",new JSONObject().put("queue","default").put("entry","video:queue-069")));
    touchDuplicate("[data-task-id='video:queue-069'] [data-api-action='rhvideo.task.prioritize']");waitTaskPriority("video:queue-069");
    require(((JSONObject)action("server.state",new JSONObject())).getInt("pageNumber")==1,"Promotion from page three returns the unchanged queue to page one");
    require(Boolean.TRUE.equals(expression(library,"document.querySelector('#wb-server [data-task-id]')?.dataset.taskId==='video:queue-069'")),"Actual first row shows the promoted task");
    JSONObject after=(JSONObject)action("remote.tasks.detail",new JSONObject().put("params",new JSONObject().put("queue","default").put("entry","video:queue-069")));require(before.getString("queued_at").equals(after.getString("queued_at")),"Promotion cannot erase original enqueue time");
    action("task.detail",new JSONObject().put("kind","default").put("id","video:queue-068"));touchDuplicate("#wb-info [data-api-action='rhvideo.task.prioritize']");waitTaskPriority("video:queue-068");
    action("panel.close",new JSONObject().put("id","wb-info"));action("server.open",new JSONObject().put("page","replacement"));action("server.filter",new JSONObject().put("key","view").put("value","failed"));
    require("replacement".equals(((JSONObject)action("server.state",new JSONObject())).getString("queue")),"Displayed queue and automation state agree");
    require(Boolean.TRUE.equals(expression(library,"document.querySelector('#wb-server .wb-server-body').textContent.includes('替换失败记录')&&document.querySelectorAll('#wb-server [data-api-action=\"rhvideo.task.prioritize\"]').length===0")),"Replacement failed records remain reachable without promotion/retry controls");
    action("server.filter",new JSONObject().put("key","view").put("value","queued"));action("server.filter",new JSONObject().put("key","pageNumber").put("value",3));
    touchDuplicate("[data-task-id='replace:60'] [data-api-action='rhvideo.task.prioritize']");waitTaskPriority("replace:60");
    require(Boolean.TRUE.equals(expression(library,"document.querySelector('#wb-server [data-task-id]')?.dataset.taskId==='replace:60'")),"Actual replacement queue order changes across pages");
    action("task.detail",new JSONObject().put("kind","replacement").put("id","replace:101"));touchDuplicate("#wb-info [data-api-action='rhvideo.task.prioritize']");JSONObject paused=waitTaskPriority("replace:101");
    require("paused".equals(paused.getJSONObject("receipt").getString("blocked_by")),"Paused queue remains paused after promotion");
    require(Boolean.TRUE.equals(expression(library,"document.querySelector('#wb-info .wb-task-priority-message').textContent.includes('队列恢复后')")),"Blocked receipt is explained inside the current panel");
    expression(library,"new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");screenshot("rhvideo-task-priority-qa.png");
    for(String[] target:new String[][]{{"default","video:queue-running"},{"replacement","replace:100"},{"replacement","replace:102"}}){
      JSONObject args=new JSONObject().put("kind",target[0]).put("id",target[1]).put("expectedRevision",((JSONObject)action("task.priorityState",new JSONObject())).getString("revision"));
      require(Boolean.TRUE.equals(expression(library,"RHFilesAPI.invoke('rhvideo.task.prioritize',"+args+").then(()=>false,()=>true)")),"Active/failed/private tasks cannot be promoted: "+target[1]);
    }
    require(((JSONObject)action("ui.contract",new JSONObject())).getJSONArray("missing").length()==0,"Every task control has a public API");
    require(Boolean.TRUE.equals(expression(library,"![...document.querySelectorAll('#wb-server button,#wb-info button')].some(n=>/重试|取消任务/.test(n.textContent))")),"No retry or cancellation of failed tasks");
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
    long end=System.currentTimeMillis()+15000;do{Activity a=current;if(a!=null&&a.getClass().getSimpleName().equals(name)){WebView[] view={null};runOnMainSync(()->view[0]=find(a.getWindow().getDecorView()));if(view[0]!=null)return view[0];}Thread.sleep(150);}while(System.currentTimeMillis()<end);
    String detail="";if(library!=null&&"RhVideoActivity".equals(name))try{detail=String.valueOf(action("player.state",new JSONObject()));screenshot("rhvideo-activity-failure-qa.png");}catch(Exception diagnostic){detail=diagnostic.toString();}
    throw new Exception("Missing activity "+name+"; actual="+(current==null?"none":current.getClass().getSimpleName())+"; player="+detail);
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
    Application.ActivityLifecycleCallbacks observer=new Application.ActivityLifecycleCallbacks(){public void onActivityResumed(Activity a){current=a;}public void onActivityCreated(Activity a,Bundle b){}public void onActivityStarted(Activity a){stoppedActivities.remove(a);}public void onActivityPaused(Activity a){}public void onActivityStopped(Activity a){stoppedActivities.add(a);}public void onActivitySaveInstanceState(Activity a,Bundle b){}public void onActivityDestroyed(Activity a){destroyedActivities.add(a);}};
    app.registerActivityLifecycleCallbacks(observer);
    try{
      String server=args.getString("server");require(ownedFixtureServer(server),"Only an explicit owned-emulator fixture transport is allowed");
      startActivitySync(new Intent().setClassName(getTargetContext(),"com.railgunhamster.rhfiles.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      main=waitView("MainActivity");ready(main,"api");nativeCall("automation.enable",new JSONObject().put("enabled",true));
      if("lifecycle".equals(args.getString("mode"))){nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));checkPlaybackLifecycle();checkGridLifecycle();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: native HTTP lifecycle, single and grid, real subtitles, HOME/stop/resume, Activity recreation, actual paused frames, isolated choices and retired-decoder rejection");finish(Activity.RESULT_OK,result);return;}
      if("task-center".equals(args.getString("mode"))){nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));checkTaskCenter();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: packaged task center, inline selection, readable workflow metrics, stable reading, unknown progress, queue/history filters and public actions");finish(Activity.RESULT_OK,result);return;}
      if("task-priority".equals(args.getString("mode"))){nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));checkActualTaskPriority();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: actual task priority, physical list/detail controls, real default/replacement queues, failed records, preserved enqueue time and paused receipt");finish(Activity.RESULT_OK,result);return;}
      if("rules".equals(args.getString("mode"))){nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");JSONObject connected=(JSONObject)action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));require(connected.getInt("total")==240,"Complete tag-fixture catalog loaded");checkTagRules();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: native tag rules, actual include/OR/collapse controls, nested NOT, pinyin, bounded paging, stale-group rejection, shared filters and native Back");finish(Activity.RESULT_OK,result);return;}
      if("duplicates".equals(args.getString("mode"))){nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");JSONObject connected=(JSONObject)action("connection.connect",new JSONObject().put("server",server).put("username","preview").put("password","fixture-only"));require(connected.getInt("total")==2,"Actual duplicate video catalog");checkActualDuplicates();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: actual duplicates, physical controls, native video, fingerprint WebP, bounded member/review pages, one-shot durable review and recoverable sources");finish(Activity.RESULT_OK,result);return;}
      if(!args.getString("mode","").startsWith("login")&&!args.getString("mode","").startsWith("exports")&&!"grid-rotation".equals(args.getString("mode"))&&!"grid".equals(args.getString("mode"))&&!"grid-restore".equals(args.getString("mode"))&&!"grid-surface-probe".equals(args.getString("mode"))&&!"single-clock".equals(args.getString("mode"))&&!"close-receipt".equals(args.getString("mode"))&&!"playlist".equals(args.getString("mode"))&&!"preview".equals(args.getString("mode"))&&!"single".equals(args.getString("mode"))&&!"favorites".equals(args.getString("mode"))&&!"strip".equals(args.getString("mode"))&&!"tickets".equals(args.getString("mode"))&&!"rotation".equals(args.getString("mode")))checkFileTaskAndSort();
      nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");
      if(args.getString("mode","").startsWith("login")){String mode=args.getString("mode");checkLoginContinuity(mode);result.putString("stream","PASS: native login phase "+mode);finish(Activity.RESULT_OK,result);return;}
      JSONObject login=new JSONObject().put("server",server).put("username","preview").put("password","fixture-only");
      JSONObject catalog=(JSONObject)action("connection.connect",login);require(catalog.getInt("total")==("single".equals(args.getString("mode"))?3:args.getString("mode","").startsWith("exports")?1:52),"Video catalog count");
      if(args.getString("mode","").startsWith("exports")){boolean recover="exports-recover".equals(args.getString("mode"));checkFavoriteExports(recover);result.putString("stream",recover?"PASS: favorite exports interrupted recovery, visible failure and no automatic download replay":"PASS: favorite exports recovery armed, real picker, foreground notification, library closure, native concurrent no-clobber and exact bytes");finish(Activity.RESULT_OK,result);return;}
      require("gallery".equals(catalog.getString("view")),"Fresh Android libraries keep the reference primary screenshot view");
      if(!"single".equals(args.getString("mode")))action("category",new JSONObject().put("kind","video"));
      if("close-receipt".equals(args.getString("mode"))){checkLibraryCloseReceipts(server);nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: library self-close semantic/UI process receipts, actual destruction and old-key rejection without repeating close");finish(Activity.RESULT_OK,result);return;}
      if("single-clock".equals(args.getString("mode"))){checkSingleClockProbe();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: single-player real-clock diagnostic; not full product acceptance");finish(Activity.RESULT_OK,result);return;}
      if("favorites".equals(args.getString("mode"))){checkFavoriteMixedBrowse();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference favorite mixed picture/video snapshot, native collection slider gesture, real picture pixels, favorite removal, return and stale-parent isolation");finish(Activity.RESULT_OK,result);return;}
      if("strip".equals(args.getString("mode"))){checkReferenceStrip();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference strip end, touch scrolling, linked rows, actual selection and star, enlarged image pixels, rotation, one-shot staging and stale viewer isolation");finish(Activity.RESULT_OK,result);return;}
      if("rotation".equals(args.getString("mode"))){checkReferenceRotation();nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference rotation toggle, actual native SurfaceView, paused time/speed, next source, stale inputs/settings and per-account persistence");finish(Activity.RESULT_OK,result);return;}
      if("grid-surface-probe".equals(args.getString("mode"))){checkGridSurfaceProbe();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: surface-only grid diagnostic; not complete product acceptance");finish(Activity.RESULT_OK,result);return;}
      if("grid-rotation".equals(args.getString("mode"))){checkGridRotation();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference grid native pixel rotation, paused input/time/speed/volume and group restoration");finish(Activity.RESULT_OK,result);return;}
      if("grid-restore".equals(args.getString("mode"))){checkReferenceGrid();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference grid restore with actual held-slider ABA and native paused frames");finish(Activity.RESULT_OK,result);return;}
      if("tickets".equals(args.getString("mode"))){checkPreparedTickets();nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: prepared ticket lifetime and native player replacement");finish(Activity.RESULT_OK,result);return;}
      if("grid".equals(args.getString("mode"))){checkReferenceGrid();checkFailedGrid();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference grid pool/layout, native frames, actual held-slider ABA, favorite/mark buttons and APIs, one-shot close, account dismissal, per-cell restoration, rotation, EOF loop, exact-group reopening and terminal HTTP errors");finish(Activity.RESULT_OK,result);return;}
      if("playlist".equals(args.getString("mode"))){checkReferencePlaylist();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference playlist segments, whole-file seek, native segment loop, global navigation, immutable pool, portrait projection, mode memory and native EOF close");finish(Activity.RESULT_OK,result);return;}
      if("preview".equals(args.getString("mode"))){checkPreparedTickets();checkLatestPlayIntent();checkReferencePreview();nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference preview parent stack, native favorite and mark controls, one-shot stage results, independent prepared tickets, late preparation isolation and account boundaries");finish(Activity.RESULT_OK,result);return;}
      if("single".equals(args.getString("mode"))){checkReferenceSingle();checkImageContent();checkContextControls();checkFavoriteSlideshow();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: contextual workflow entries and real card selection, reference single controls, actual sniffed image decode/rejected HTML, native menus, one-item parents, per-child return identity, independent mode/account state and filtered favorite slideshow snapshots");finish(Activity.RESULT_OK,result);return;}
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
      nativeCall("automation.media.control",new JSONObject().put("command","next"));library=waitView("RhVideoActivity");waitImage(9);
      action("image.playVideo",new JSONObject());waitPlayer("video-1",true);nativeCall("automation.media.control",new JSONObject().put("command","previous"));library=waitView("RhVideoActivity");waitImage(8);action("image.close",new JSONObject());
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
    finally{try{endGridVolumeGesture(true);getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);}catch(Exception ignored){}app.unregisterActivityLifecycleCallbacks(observer);}
  }
}
