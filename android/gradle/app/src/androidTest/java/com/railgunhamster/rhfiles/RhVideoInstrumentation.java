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
  private JSONObject waitPlayer(String id,boolean playing)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject state=null;
    do{try{state=(JSONObject)action("player.state",new JSONObject());if((id==null||id.equals(state.optString("id")))&&state.optBoolean("rendered")&&state.optInt("playbackState")==3&&state.optLong("renderedFrames")>0&&state.optBoolean("playing")==playing)return state;}catch(Exception ignored){}Thread.sleep(150);}while(System.currentTimeMillis()<end);
    throw new Exception("Native reference player did not settle: "+state);
  }
  private JSONObject waitPausedPlayerFrame(String id,long target,long previousFrames)throws Exception{
    long end=System.currentTimeMillis()+30000;JSONObject state=null;
    do{state=(JSONObject)action("player.state",new JSONObject());if(id.equals(state.optString("id"))&&!state.optBoolean("playWhenReady")&&state.optInt("playbackState")==3&&state.optLong("renderedFrames")>previousFrames&&Math.abs(state.optLong("positionMs")-target)<250)return state;Thread.sleep(150);}while(System.currentTimeMillis()<end);
    throw new Exception("Actual paused seek frame did not settle: "+state);
  }
  private void checkReferenceSingle()throws Exception{
    action("media.open",new JSONObject().put("kind","video").put("id","video-0"));JSONObject first=waitPlayer("video-0",true);JSONObject parent=first.getJSONObject("options");require(parent.getInt("parentTotal")==1,"Fixture must expose an actual one-item parent");
    touchPlayerButton("exo_next");library=waitView("RhVideoActivity");JSONObject image=waitImage(0);require(image.getInt("total")==1,"An arrow pops the parent even when modulo position does not change");
    action("image.playVideo",new JSONObject());JSONObject current=waitPlayer("video-0",true);require(!current.getJSONObject("options").getString("parentPlayback").equals(parent.getString("parentPlayback")),"Every child launch must have a new identity");long input=current.getLong("inputId");
    JSONObject oldReturn=new JSONObject().put("generation",first.getJSONObject("queue").getLong("generation")).put("parentKey",parent.getString("parentKey")).put("parentPreview",parent.getString("parentPreview")).put("parentPlayback",parent.getString("parentPlayback")).put("close",true);
    require(((JSONObject)action("image.returnFromVideo",oldReturn)).optBoolean("stale")&&((JSONObject)action("player.state",new JSONObject())).getLong("inputId")==input,"Old whole-close cannot stop another child of the same screenshot");
    action("player.control",new JSONObject().put("command","options"));clickPlayerText("循环播放");current=(JSONObject)action("player.state",new JSONObject());require(current.getBoolean("repeat")&&current.getJSONObject("options").getBoolean("loop"),"The native repeat menu changes the same media controls as the public API");
    touchPlayerButton("exo_settings");clickPlayerText("Speed","播放速度");clickPlayerText("1.5");current=(JSONObject)action("player.state",new JSONObject());require(Math.abs(current.getDouble("rate")-1.5)<.01&&Math.abs(current.getJSONObject("options").getDouble("rate")-1.5)<.01,"Actual controller speed is remembered, not just applied to one decoder");
    touchPlayerButton("rhvideo_player_close");library=waitView("RhVideoActivity");action("media.open",new JSONObject().put("kind","video").put("id","video-1"));current=waitPlayer("video-1",true);require(current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1.5)<.01&&!current.getJSONObject("options").has("origin"),"A source without a parent inherits ordinary-video controls too");
    touchPlayerButton("exo_settings");clickPlayerText("Speed","播放速度");clickPlayerText("1.25");screenshot("rhvideo-single-qa.png");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("playlist.sequential",new JSONObject());current=waitPlayer(null,true);require(!current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1)<.01,"Sequential mode has separate controls");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("media.open",new JSONObject().put("kind","video").put("id","video-0"));current=waitPlayer("video-0",true);require(current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1.25)<.01,"A playlist cannot erase single-video control memory");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
    action("connection.logout",new JSONObject());action("connection.connect",new JSONObject().put("server",args.getString("server")).put("username","preview").put("password","fixture-only"));action("media.open",new JSONObject().put("kind","video").put("id","video-0"));current=waitPlayer("video-0",true);require(!current.getBoolean("repeat")&&Math.abs(current.getDouble("rate")-1)<.01,"Transient controls do not leak across logins");action("player.close",new JSONObject());library=waitView("RhVideoActivity");
  }
  private void touchPlayerButton(String resource)throws Exception{
    JSONObject shown=(JSONObject)action("player.control",new JSONObject().put("command","controls.show"));
    long visibleEnd=System.currentTimeMillis()+5000;while(!shown.optBoolean("controls")&&System.currentTimeMillis()<visibleEnd){Thread.sleep(100);shown=(JSONObject)action("player.state",new JSONObject());}
    require(shown.optBoolean("controls"),"Wait for the actual controller reveal animation before touching "+resource+": "+shown);
    int[] center={-1,-1};runOnMainSync(()->{int id=current.getResources().getIdentifier(resource,"id",getTargetContext().getPackageName());View button=current.findViewById(id);if(button!=null&&button.isShown()&&button.isEnabled()&&button.getWidth()>0){button.getLocationOnScreen(center);center[0]+=button.getWidth()/2;center[1]+=button.getHeight()/2;}});
    require(center[0]>=0&&center[1]>=0,"Native player button must be visible and enabled: "+resource);
    long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,center[0],center[1],0),up=MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,center[0],center[1],0);
    try{sendPointerSync(down);sendPointerSync(up);}finally{down.recycle();up.recycle();}
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
    touchPlayerButton("exo_settings");clickPlayerText("Speed","播放速度");clickPlayerText("1.25");require(Math.abs(((JSONObject)action("player.state",new JSONObject())).getJSONObject("options").getDouble("rate")-1.25)<.01,"Native controller speed settings must use the same persistent mode options");
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
    require(latch.await(15,TimeUnit.SECONDS),"JavaScript evaluation timed out");return result[0];
  }
  private Object expression(WebView web,String expression)throws Exception{
    eval(web,"window.__rhQa=null;void(async()=>{try{const value=await ("+expression+");window.__rhQa={value:value===undefined?null:value}}catch(e){window.__rhQa={error:String(e)}}})();");
    long end=System.currentTimeMillis()+45000;
    do{Object text=new JSONTokener(eval(web,"JSON.stringify(window.__rhQa||{})")).nextValue();JSONObject result=new JSONObject(String.valueOf(text));
      if(result.has("error"))throw new Exception(result.getString("error"));if(result.has("value"))return result.get("value");Thread.sleep(100);
    }while(System.currentTimeMillis()<end);throw new Exception("Action timed out");
  }
  private Object action(String name,JSONObject p)throws Exception{Bundle step=new Bundle();step.putString("stream","STEP: rhvideo."+name+"\n");sendStatus(0,step);return expression(library,"RHFilesAPI.invoke("+JSONObject.quote("rhvideo."+name)+","+p+")");}
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
    Application.ActivityLifecycleCallbacks observer=new Application.ActivityLifecycleCallbacks(){public void onActivityResumed(Activity a){current=a;}public void onActivityCreated(Activity a,Bundle b){}public void onActivityStarted(Activity a){}public void onActivityPaused(Activity a){}public void onActivityStopped(Activity a){}public void onActivitySaveInstanceState(Activity a,Bundle b){}public void onActivityDestroyed(Activity a){}};
    app.registerActivityLifecycleCallbacks(observer);
    try{
      String server=args.getString("server");require(server!=null&&server.matches("http://127\\.0\\.0\\.1:[0-9]+/?"),"Only an ADB-reversed loopback fixture is allowed");
      startActivitySync(new Intent().setClassName(getTargetContext(),"com.railgunhamster.rhfiles.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      main=waitView("MainActivity");ready(main,"api");nativeCall("automation.enable",new JSONObject().put("enabled",true));
      if(!"grid".equals(args.getString("mode"))&&!"playlist".equals(args.getString("mode"))&&!"preview".equals(args.getString("mode"))&&!"single".equals(args.getString("mode")))checkFileTaskAndSort();
      nativeCall("rhvideo.open",new JSONObject());library=waitView("RhVideoActivity");ready(library,"RHVideoBack");
      JSONObject login=new JSONObject().put("server",server).put("username","preview").put("password","fixture-only");
      JSONObject catalog=(JSONObject)action("connection.connect",login);require(catalog.getInt("total")==("single".equals(args.getString("mode"))?3:52),"Video catalog count");
      if("grid".equals(args.getString("mode"))){checkReferenceGrid();checkFailedGrid();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference grid pool/layout, audible cells, native frames, pause/seek/mute/rate restoration, independent queue, rotation, EOF loop, exact-group reopening and terminal HTTP errors");finish(Activity.RESULT_OK,result);return;}
      if("playlist".equals(args.getString("mode"))){checkReferencePlaylist();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference playlist segments, whole-file seek, native segment loop, global navigation, immutable pool, portrait projection, mode memory and native EOF close");finish(Activity.RESULT_OK,result);return;}
      if("preview".equals(args.getString("mode"))){checkReferencePreview();nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference preview parent stack, native favorite and mark controls, one-shot stage results, stale-event isolation and account boundaries");finish(Activity.RESULT_OK,result);return;}
      if("single".equals(args.getString("mode"))){checkReferenceSingle();action("connection.logout",new JSONObject());nativeCall("automation.enable",new JSONObject().put("enabled",false));result.putString("stream","PASS: reference single controls, native menus, one-item parents, per-child return identity and independent mode/account state");finish(Activity.RESULT_OK,result);return;}
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
    finally{app.unregisterActivityLifecycleCallbacks(observer);}
  }
}
