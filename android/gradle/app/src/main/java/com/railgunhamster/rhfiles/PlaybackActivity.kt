package com.railgunhamster.rhfiles

import android.content.ClipData
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.addCallback
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.doOnLayout
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.PlayerMessage
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DataSource
import org.json.JSONObject
import org.json.JSONArray
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/** Native local/content/remote playback with a real Media3 queue and range reads. */
@UnstableApi
class PlaybackActivity:AppCompatActivity() {
  companion object {
    private val nextRhInput=java.util.concurrent.atomic.AtomicLong()
    private var active=java.lang.ref.WeakReference<PlaybackActivity>(null)
    fun rhState()=active.get()?.takeIf{it.isRhVideo()&&!it.rhClosing}?.automationState()?:JSONObject().put("opened",false)
    fun rhControl(args:JSONObject):JSONObject {val target=active.get()?.takeIf{it.isRhVideo()&&!it.rhClosing};if(target==null){if(args.optString("command") in listOf("back","close"))return JSONObject().put("closed",true);error("原生播放器没有打开")};return target.automationControl(args)}
    fun closeRhVideo(){active.get()?.let{if(it.isRhVideo()){it.rhClosing=true;it.finish()}}}
  }
  private lateinit var playerView:PlayerView
  private lateinit var header:LinearLayout
  private lateinit var moreButton:ImageButton
  private lateinit var failure:LinearLayout
  private lateinit var source:Uri
  private lateinit var path:String
  private lateinit var titleView:TextView
  private var queue=listOf<PlaybackQueue.Item>()
  private var sources=listOf<Uri>()
  private var index=0
  private lateinit var storage:NativeStorage
  private var player:ExoPlayer?=null
  private var position=0L
  private var play=true
  private var landscape=false
  private var resize=AspectRatioFrameLayout.RESIZE_MODE_FIT
  private var rhWindow:RhVideoClient.Window?=null
  private var rhTicket:String?=null
  private var rhLocalGain=1f
  private var rebuildingWindow=false
  private var rhEndMessage:PlayerMessage?=null
  private var rhEndRevision=0L
  @Volatile private var rhInputId=0L
  @Volatile private var rhClosing=false
  private var rhFavorite:ImageButton?=null
  private var rhMark:ImageButton?=null
  private var rhEvents:java.io.Closeable?=null
  private var rhFavoriteNotice:String?=null
  private var rhRendered=false
  private var rhProgress:LinearLayout?=null
  private var rhQueueLabel:TextView?=null
  private var rhQueueSeek:SeekBar?=null
  private val rhUi=android.os.Handler(android.os.Looper.getMainLooper())
  private val rhTick=object:Runnable{override fun run(){if(rhWindow!=null&&player!=null){updateRhProgress();if(header.visibility==View.VISIBLE)rhUi.postDelayed(this,500)}}}
  override fun onCreate(savedInstanceState:Bundle?) {
    super.onCreate(savedInstanceState)
    NativeAutomation.install(this);active=java.lang.ref.WeakReference(this)
    onBackPressedDispatcher.addCallback(this){if(isRhVideo())rhUiAction(JSONObject().put("command","back"))else finish()}
    path=intent.getStringExtra("path") ?: run{finish();return}
    storage=NativeStorage(applicationContext)
    try {
      source=if(storage.isRemote(path)||path.startsWith("rhvideo://"))Uri.parse(path) else if(storage.isDocument(path))storage.docUri(path) else {
        val file=storage.local(path);require(file.isFile && file.canRead()) {"文件不存在或没有读取权限"};Uri.fromFile(file)
      }
      queue=PlaybackQueue.parse(JSONObject().put("path",path).put("name",intent.getStringExtra("name")).put("queue",JSONArray(intent.getStringExtra("queue")?:"[]")))
      rhTicket=intent.getStringExtra("rhvideoPlaylist")
      rhTicket?.let{ticket->
        val first=RhVideoClient.get(this).playbackWindow(ticket,0)
        rhWindow=RhVideoClient.get(this).playbackWindow(ticket,(savedInstanceState?.getInt("rhGlobalIndex")?:intent.getIntExtra("rhvideoIndex",0)).coerceAtLeast(first.offset))
        queue=rhWindow!!.items
      }
      sources=queue.map{item->if(storage.isRemote(item.path)||item.path.startsWith("rhvideo://"))Uri.parse(item.path)else if(storage.isDocument(item.path))storage.docUri(item.path)else Uri.fromFile(storage.local(item.path))}
      index=(rhWindow?.index?:savedInstanceState?.getInt("index")?:queue.indexOfFirst{it.path==path}).coerceIn(0,queue.lastIndex)
      path=queue[index].path;source=sources[index];title=queue[index].name
    }catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();finish();return}
    position=savedInstanceState?.getLong("position") ?: intent.getLongExtra("positionMs",0).coerceAtLeast(0);play=savedInstanceState?.getBoolean("play",true) ?: true
    rhLocalGain=savedInstanceState?.getFloat("rhLocalGain",1f)?:1f
    WindowCompat.setDecorFitsSystemWindows(window,false)
    WindowInsetsControllerCompat(window,window.decorView).apply{hide(WindowInsetsCompat.Type.systemBars());systemBarsBehavior=WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE}
    val root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK)}
    playerView=PlayerView(this).apply {
      val parent=rhWindow?.options?.let{it.optString("origin")=="frame"&&it.optInt("parentTotal")>0}==true
      setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);setShowNextButton(queue.size>1||parent);setShowPreviousButton(queue.size>1||parent)
      setShowSubtitleButton(true);setShowRewindButton(true);setShowFastForwardButton(true)
      controllerShowTimeoutMs=3500;setKeepContentOnPlayerReset(true);resizeMode=resize
      controllerAutoShow=false
      setFullscreenButtonClickListener {full->landscape=full;requestedOrientation=if(full)ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED}
    }
    root.addView(playerView,FrameLayout.LayoutParams(-1,-1))
    header=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),dp(18),dp(8),dp(10));background=GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(0xBB000000.toInt(),0x00000000))}
    val back=ImageButton(this).apply{contentDescription="返回";setImageResource(R.drawable.ic_player_back);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{if(isRhVideo())rhUiAction(JSONObject().put("command","back"))else finish()}}
    titleView=TextView(this).apply{text=queue[index].name;setTextColor(Color.WHITE);textSize=16f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
    val more=ImageButton(this).apply{contentDescription="播放选项";setImageResource(R.drawable.ic_player_more);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{options(this)}}
    moreButton=more
    header.addView(back,LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(titleView,LinearLayout.LayoutParams(0,dp(48),1f));titleView.gravity=Gravity.CENTER_VERTICAL
    if(rhWindow!=null){
      fun actionButton(icon:Int,label:String,command:String)=ImageButton(this).apply{id=when(command){"favorite"->R.id.rhvideo_player_favorite;"mark"->R.id.rhvideo_player_mark;else->R.id.rhvideo_player_close};contentDescription=label;setImageResource(icon);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);var pressedInput:Long?=null;setOnTouchListener{_,event->if(event.actionMasked==android.view.MotionEvent.ACTION_DOWN)pressedInput=rhInputId;false};setOnClickListener{rhUiAction(JSONObject().put("command",command).put("expectedInputId",pressedInput?:rhInputId));pressedInput=null}}
      rhFavorite=actionButton(R.drawable.ic_player_favorite,"收藏","favorite");rhMark=actionButton(R.drawable.ic_player_mark,"标记待暂存","mark")
      header.addView(rhFavorite,LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(rhMark,LinearLayout.LayoutParams(dp(48),dp(48)))
      header.addView(actionButton(R.drawable.ic_player_close,"关闭预览","close"),LinearLayout.LayoutParams(dp(48),dp(48)))
      rhEvents=RhVideoClient.get(this).listen{name,payload->if(payload.optLong("generation")==rhWindow?.generation)runOnUiThread{if(!isDestroyed&&!rhClosing){paintRhActions();if(name=="rhvideo-media-action"&&!payload.isNull("error")&&payload.optString("operation")!=rhFavoriteNotice){rhFavoriteNotice=payload.optString("operation");Toast.makeText(this,payload.optString("error"),Toast.LENGTH_LONG).show()}}}}
    }
    header.addView(more,LinearLayout.LayoutParams(dp(48),dp(48)))
    root.addView(header,FrameLayout.LayoutParams(-1,-2,Gravity.TOP))
    if(rhWindow?.options?.optBoolean("reference")==true){
      rhProgress=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(8),dp(12),dp(8));setBackgroundColor(0xDD15171D.toInt());visibility=View.GONE}
      rhQueueLabel=TextView(this).apply{setTextColor(Color.WHITE);textSize=12f}
      rhQueueSeek=SeekBar(this).apply{contentDescription="连播总进度";max=10000;setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{
        override fun onStartTrackingTouch(bar:SeekBar){}
        override fun onProgressChanged(bar:SeekBar,value:Int,fromUser:Boolean){}
        override fun onStopTrackingTouch(bar:SeekBar){rhUiAction(JSONObject().put("command","seekQueue").put("value",bar.progress/10000.0))}
      })}
      rhProgress!!.addView(rhQueueLabel);rhProgress!!.addView(rhQueueSeek,LinearLayout.LayoutParams(-1,dp(36)))
      root.addView(rhProgress,FrameLayout.LayoutParams(-1,-2,Gravity.TOP).apply{topMargin=dp(76)})
    }
    failure=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(24),dp(24),dp(24),dp(24));setBackgroundColor(0xEE111318.toInt());visibility=View.GONE}
    root.addView(failure,FrameLayout.LayoutParams(-1,-1));setContentView(root)
    playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener{visibility->header.visibility=if(failure.visibility==View.VISIBLE)View.VISIBLE else visibility;rhProgress?.visibility=visibility;rhUi.removeCallbacks(rhTick);if(visibility==View.VISIBLE)rhTick.run()})
    playerView.hideController();header.visibility=View.GONE;paintRhActions()
  }
  private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
  private fun isRhVideo()=::path.isInitialized&&path.startsWith("rhvideo://")
  private fun currentRhId():String {val w=rhWindow?:error("当前不是媒体库视频");return w.ids[(player?.currentMediaItemIndex?:w.index).coerceIn(0,w.ids.lastIndex)]}
  private fun paintRhActions(){val w=rhWindow?:return;val id=currentRhId();val client=RhVideoClient.get(this);val favorite=client.favoriteState("video",id,w.generation);rhFavorite?.apply{val busy=favorite.optBoolean("favoriteBusy");isEnabled=!busy;alpha=if(busy).4f else 1f;contentDescription=if(busy)"正在更新收藏"else if(favorite.optBoolean("favorite"))"取消收藏"else"收藏";setColorFilter(if(favorite.optBoolean("favorite"))0xFFFFCE61.toInt()else Color.WHITE)};val marked=client.previewMarked("video",id,w.generation);rhMark?.apply{contentDescription=if(marked)"取消暂存标记"else"标记待暂存";setColorFilter(if(marked)0xFFFF7979.toInt()else Color.WHITE)}}
  private fun rememberRhCurrent(){val engine=player?:return;val w=rhWindow?:return;RhVideoClient.get(this).rememberPlayback(rhTicket!!,w.offset+engine.currentMediaItemIndex,engine.currentPosition,engine.duration)}
  private fun closeRhPlayback(direction:Int=0,whole:Boolean=false):JSONObject {
    if(rhClosing)return JSONObject().put("closed",true)
    val w=rhWindow?:run{finish();return JSONObject().put("closed",true)}
    rememberRhCurrent();rememberRhPlaylist();rhClosing=true
    // Release the streamed file before a whole-close can submit its source to
    // the server's staging area; do not depend on the later Activity.onStop.
    rhUi.removeCallbacks(rhTick);rhEndMessage?.cancel();rhEndMessage=null
    player?.let{rhLocalGain=RhVideoVolume.local(it);RhVideoVolume.untrack(it);playerView.player=null;player=null;it.release()}
    return try{RhVideoClient.get(this).closePlayback(rhTicket!!,w.lease,direction,whole)}finally{finish()}
  }
  internal fun automationState():JSONObject {
    val engine=player?:error("播放器尚未就绪")
    engine.videoDecoderCounters?.ensureUpdated()
    return JSONObject().put("opened",!rhClosing).put("path",path).put("index",engine.currentMediaItemIndex+(rhWindow?.offset?:0)).put("count",rhWindow?.total?:queue.size).put("playing",engine.isPlaying).put("playWhenReady",engine.playWhenReady).put("playbackState",engine.playbackState).put("suppressionReason",engine.playbackSuppressionReason).put("error",engine.playerError?.let{JSONObject().put("code",it.errorCodeName).put("message",it.cause?.message?:it.message?:"") }?:JSONObject.NULL).put("positionMs",engine.currentPosition).put("durationMs",if(engine.duration==C.TIME_UNSET)JSONObject.NULL else engine.duration).put("rate",engine.playbackParameters.speed).put("repeat",engine.repeatMode==Player.REPEAT_MODE_ONE).put("controls",playerView.isControllerFullyVisible)
      .put("volume",RhVideoVolume.local(engine)*100).put("decoderVolume",engine.volume*100).put("tracks",PlayerTracks.state(engine.currentTracks,engine.trackSelectionParameters))
      .put("rendered",rhRendered).put("renderedFrames",engine.videoDecoderCounters?.renderedOutputBufferCount?:0).put("inputId",rhInputId)
      .also{state->rhWindow?.let{w->val local=engine.currentMediaItemIndex.coerceIn(0,w.items.lastIndex);state.put("id",w.ids[local]).put("lease",w.lease).put("options",JSONObject(w.options.toString())).put("segmentStartMs",w.starts[local]).put("segmentEndMs",w.ends[local]).put("queueDurationMs",w.totalMs).put("queuePositionMs",rhQueuePosition(w,local,engine.currentPosition));state.put("queue",JSONObject().put("id",w.ids[local]).put("index",w.offset+local).put("total",w.total).put("options",JSONObject(w.options.toString())).put("generation",w.generation));val favorite=RhVideoClient.get(this).favoriteState("video",w.ids[local],w.generation);favorite.keys().forEach{state.put(it,favorite.get(it))};state.put("marked",RhVideoClient.get(this).previewMarked("video",w.ids[local],w.generation))}}
  }
  internal fun automationControl(args:JSONObject):JSONObject {
    val engine=player?:error("播放器尚未就绪")
    if(args.has("expectedPath"))require(args.getString("expectedPath")==path){"播放文件已改变，请重新读取状态"}
    if(args.has("expectedInputId"))require(args.getLong("expectedInputId")==rhInputId){"播放输入已改变，请重新读取状态"}
    val command=args.getString("command")
    rhWindow?.let{w->try{RhVideoClient.get(this).checkPlayback(rhTicket!!,w.lease)}catch(e:Exception){if(command in listOf("back","close")){rhClosing=true;finish();return JSONObject().put("closed",true).put("stale",true)}else throw e}}
    if(command=="back"||command=="close")return closeRhPlayback(whole=command=="close")
    if(command in PlayerTracks.commands)engine.trackSelectionParameters=PlayerTracks.change(engine.currentTracks,engine.trackSelectionParameters,args)
    else when(command){
      "rewind"->{if(rhWindow?.options?.optBoolean("reference")==true)automationControl(JSONObject().put("command","seek").put("value",(engine.currentPosition-10000).coerceAtLeast(0)))else engine.seekBack()}
      "forward"->{if(rhWindow?.options?.optBoolean("reference")==true)automationControl(JSONObject().put("command","seek").put("value",(engine.currentPosition+10000).coerceAtMost(engine.duration)))else engine.seekForward()}
      "toggle"->if(engine.playWhenReady)engine.pause()else engine.play()
      "play"->engine.play();"pause"->engine.pause()
      "next"->{if(rhWindow?.options?.optString("origin")=="frame")return closeRhPlayback(1)else if(rhWindow?.options?.optBoolean("reference")==true)rhNavigate(1)else{check(engine.hasNextMediaItem()){"没有下一个文件"};val failed=engine.playbackState==Player.STATE_IDLE;engine.seekToNextMediaItem();if(failed){engine.prepare();engine.play()}}}
      "previous"->{if(rhWindow?.options?.optString("origin")=="frame")return closeRhPlayback(-1)else if(rhWindow?.options?.optBoolean("reference")==true)rhNavigate(-1)else{check(engine.hasPreviousMediaItem()){"没有上一个文件"};val failed=engine.playbackState==Player.STATE_IDLE;engine.seekToPreviousMediaItem();if(failed){engine.prepare();engine.play()}}}
      "favorite"->{val w=rhWindow?:error("当前不是媒体库视频");val input=rhInputId;val client=RhVideoClient.get(this);val ticket=rhTicket!!;client.toggleFavorite("video",currentRhId(),w.generation){!rhClosing&&rhInputId==input&&runCatching{client.checkPlayback(ticket,w.lease)}.isSuccess};paintRhActions()}
      "mark"->{val w=rhWindow?:error("当前不是媒体库视频");val params=JSONObject().put("_sessionGeneration",w.generation).put("kind","video").put("id",currentRhId()).put("title",queue[engine.currentMediaItemIndex].name);if(args.has("enabled"))params.put("enabled",args.getBoolean("enabled"));val result=RhVideoClient.get(this).request("preview.mark",params) as JSONObject;paintRhActions();Toast.makeText(this,if(result.getBoolean("enabled"))"已标记；关闭预览时移入 RHVideo 暂存区（非永久删除）"else"已取消暂存标记",Toast.LENGTH_LONG).show()}
      "seek"->{val value=args.getDouble("value");require(value.isFinite()&&value>=0&&engine.duration!=C.TIME_UNSET&&value<=engine.duration){"跳转位置超出范围（毫秒）"};val w=rhWindow;val i=engine.currentMediaItemIndex;if(w?.options?.optBoolean("reference")==true&&w.options.optBoolean("loop")&&(value<w.starts[i]-500||value>w.ends[i]+1000))rhSetOptions(JSONObject().put("loop",false));engine.seekTo(value.toLong());armRhEnd()}
      "seekQueue"->{val w=rhWindow?:error("当前不是连播");val target=RhVideoClient.get(this).playbackTarget(rhTicket!!,w.lease,args.getDouble("value"));rebuildRhWindow(target.index,target.positionMs,engine.playWhenReady)}
      "playlist.options"->rhSetOptions(args.getJSONObject("options"))
      "rate"->{val value=args.getDouble("value");require(value.isFinite()&&value in .25..4.0){"播放速度应为 0.25–4"};if(rhWindow!=null)rhSetOptions(JSONObject().put("rate",value))else engine.setPlaybackSpeed(value.toFloat())}
      "volume"->{val value=args.getDouble("value");require(value.isFinite()&&value in 0.0..100.0);RhVideoVolume.setLocal(engine,(value/100).toFloat())}
      "rotate"->{val value=args.getInt("value");require(value in listOf(0,90,180,270));playerView.videoSurfaceView?.rotation=value.toFloat()}
      "repeat"->{if(rhWindow!=null)rhSetOptions(JSONObject().put("loop",args.getBoolean("enabled")))else engine.repeatMode=if(args.getBoolean("enabled"))Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF}
      "fit"->{resize=AspectRatioFrameLayout.RESIZE_MODE_FIT;playerView.resizeMode=resize}
      "fill"->{resize=AspectRatioFrameLayout.RESIZE_MODE_ZOOM;playerView.resizeMode=resize}
      "controls.show"->playerView.showController();"controls.hide"->playerView.hideController()
      "options"->{
        playerView.showController()
        val input=rhInputId
        // Use the same visible anchor/callback as a real More tap. Anchoring a
        // popup to the full-screen video can place its content off screen.
        moreButton.doOnLayout{if(!rhClosing&&!isFinishing&&player===engine&&rhInputId==input)it.performClick()}
      }
      "external"->{require(source.scheme !in listOf("remote","rhvideo")){"受保护的远程媒体不能转交外部应用"};external()}
      "fullscreen"->{landscape=args.getBoolean("enabled");requestedOrientation=if(landscape)ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED}
      else->error("未知播放器操作")
    };return automationState()
  }
  // PlayerView otherwise consumes the first hardware Back to hide controls.
  // System edge Back and hardware Back must both return to the file list.
  override fun dispatchKeyEvent(event:KeyEvent):Boolean {
    if(event.keyCode==KeyEvent.KEYCODE_BACK){if(event.action==KeyEvent.ACTION_UP && !event.isCanceled)onBackPressedDispatcher.onBackPressed();return true}
    return super.dispatchKeyEvent(event)
  }
  override fun onStart(){super.onStart();if(::source.isInitialized)try{rhWindow?.let{RhVideoClient.get(this).checkPlayback(rhTicket!!,it.lease)};startPlayer()}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();finish()}}
  private fun startPlayer(){
    val mediaFactory=DefaultMediaSourceFactory(DefaultDataSource.Factory(this,DataSource.Factory{MediaRoutingDataSource(this,storage.remote)}))
    if(path.startsWith("rhvideo://"))mediaFactory.setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(0))
    val engine=ExoPlayer.Builder(this,DefaultRenderersFactory(this).setEnableDecoderFallback(true))
      .setMediaSourceFactory(mediaFactory)
      .setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).build()
    player=engine;rhInputId=nextRhInput.incrementAndGet();rhRendered=false
    playerView.player=if(rhWindow!=null)object:ForwardingPlayer(engine){
      override fun seekToNextMediaItem(){rhUiAction(JSONObject().put("command","next"))}
      override fun seekToNext(){seekToNextMediaItem()}
      override fun seekToPreviousMediaItem(){rhUiAction(JSONObject().put("command","previous"))}
      override fun seekToPrevious(){seekToPreviousMediaItem()}
      override fun seekBack(){rhUiAction(JSONObject().put("command","rewind"))}
      override fun seekForward(){rhUiAction(JSONObject().put("command","forward"))}
      override fun setPlaybackSpeed(speed:Float){rhUiAction(JSONObject().put("command","rate").put("value",speed))}
      override fun setPlaybackParameters(parameters:PlaybackParameters){setPlaybackSpeed(parameters.speed)}
      override fun seekTo(positionMs:Long){rhUiAction(JSONObject().put("command","seek").put("value",positionMs))}
      override fun seekTo(mediaItemIndex:Int,positionMs:Long){if(mediaItemIndex==engine.currentMediaItemIndex)seekTo(positionMs)else rebuildRhWindow(rhWindow!!.offset+mediaItemIndex,positionMs,engine.playWhenReady)}
      override fun isCommandAvailable(command:Int)=getAvailableCommands().contains(command)
      override fun getAvailableCommands():Player.Commands{val commands=super.getAvailableCommands().buildUpon();if(rhWindow?.options?.let{it.optBoolean("reference")||it.optString("origin")=="frame"}==true)commands.addAll(Player.COMMAND_SEEK_TO_NEXT,Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,Player.COMMAND_SEEK_TO_PREVIOUS,Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM);return commands.build()}
    }else engine
    if(path.startsWith("rhvideo://"))RhVideoVolume.track(engine,rhLocalGain)
    engine.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true)
    engine.setHandleAudioBecomingNoisy(true)
    engine.addListener(object:Player.Listener {
      override fun onPositionDiscontinuity(old:Player.PositionInfo,next:Player.PositionInfo,reason:Int){val ticket=rhTicket;val w=rhWindow;if(!rebuildingWindow&&ticket!=null&&w!=null)RhVideoClient.get(this@PlaybackActivity).rememberPlayback(ticket,w.offset+old.mediaItemIndex,old.positionMs,0)}
      override fun onMediaItemTransition(item:MediaItem?,reason:Int){
        index=engine.currentMediaItemIndex.coerceIn(0,queue.lastIndex);path=queue[index].path;source=sources[index];titleView.text=queue[index].name;title=queue[index].name
        failure.visibility=View.GONE;paintRhActions()
        val w=rhWindow
        if(!rebuildingWindow&&w!=null){
          if((index<=1&&w.offset>0)||(index>=queue.lastIndex-1&&w.offset+queue.size<w.total))rebuildRhWindow(w.offset+index,if(w.options.optBoolean("reference"))w.starts[index]else 0,engine.playWhenReady)
          else{if(reason!=Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT){rhInputId=nextRhInput.incrementAndGet();rhRendered=false};if(w.options.optBoolean("reference")&&reason in listOf(Player.MEDIA_ITEM_TRANSITION_REASON_AUTO,Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT))engine.seekTo(w.starts[index]);armRhEnd();rememberRhPlaylist()}
        }
      }
      override fun onRenderedFirstFrame(){rhRendered=true;playerView.videoSurfaceView?.rotation=(rhWindow?.options?.optInt("rotation",0)?:0).toFloat();if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","First video frame rendered")}
      override fun onPlaybackStateChanged(state:Int){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","Playback state=$state");if(state==Player.STATE_ENDED&&rhWindow!=null){if(rhWindow!!.options.optBoolean("loop")){engine.seekTo(engine.currentMediaItemIndex,rhWindow!!.starts[engine.currentMediaItemIndex]);engine.play()}else if(rhWindow!!.options.optBoolean("closeAtEnd"))rhUiAction(JSONObject().put("command","close"))}}
      override fun onIsPlayingChanged(isPlaying:Boolean){if(isPlaying)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
      override fun onPlayerError(error:PlaybackException){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback",error.errorCodeName);showError(error);val w=rhWindow;if(w?.options?.optBoolean("reference")==true){Toast.makeText(this@PlaybackActivity,"视频加载失败：${queue[index].name}（${error.errorCodeName}）",Toast.LENGTH_LONG).show();val input=rhInputId;rhUi.post{if(player===engine&&rhInputId==input&&!isFinishing){if(w.offset+index+1<w.total)rebuildRhWindow(w.offset+index+1)else rhUiAction(JSONObject().put("command","close"))}}}}
    })
    rhWindow?.options?.let{engine.setPlaybackSpeed(it.optDouble("rate",1.0).toFloat());engine.repeatMode=if(it.optBoolean("loop"))Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF}
    engine.setMediaItems(sources.mapIndexed{i,uri->rhItem(i,uri)},index,position);engine.prepare();engine.playWhenReady=play;armRhEnd();playerView.hideController()
  }
  private fun rhItem(i:Int,uri:Uri):MediaItem {
    val builder=MediaItem.Builder().setUri(uri).setMediaId(queue[i].path)
    rhWindow?.takeUnless{it.options.optBoolean("reference")}?.let{w->val clipping=MediaItem.ClippingConfiguration.Builder().setStartPositionMs(w.starts[i]);if(w.ends[i]>=0)clipping.setEndPositionMs(w.ends[i]);builder.setClippingConfiguration(clipping.build())}
    return builder.build()
  }
  private fun rebuildRhWindow(globalIndex:Int,targetMs:Long?=null,playing:Boolean=true,saveCurrent:Boolean=true){
    val ticket=rhTicket?:return;val engine=player?:return
    if(saveCurrent)rememberRhCurrent()
    try{rebuildingWindow=true;rhEndMessage?.cancel();val w=RhVideoClient.get(this).playbackWindow(ticket,globalIndex,rhWindow?.lease);rhWindow=w;queue=w.items;sources=queue.map{Uri.parse(it.path)};index=w.index
      rhInputId=nextRhInput.incrementAndGet();rhRendered=false
      engine.setMediaItems(sources.mapIndexed{i,uri->rhItem(i,uri)},index,targetMs?:if(w.options.optBoolean("reference"))w.starts[index]else 0);engine.prepare();engine.playWhenReady=playing
    }catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();engine.pause()}finally{rebuildingWindow=false}
    armRhEnd();rememberRhPlaylist();updateRhProgress()
  }
  private fun rhUiAction(args:JSONObject){try{automationControl(args)}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show()}}
  private fun rhNavigate(direction:Int){val w=rhWindow?:return;val current=w.offset+(player?.currentMediaItemIndex?:w.index);rebuildRhWindow(Math.floorMod(current+direction,w.total))}
  private fun rememberRhPlaylist(){val w=rhWindow?:return;if(w.options.optBoolean("reference"))runCatching{RhVideoClient.get(this).rememberPlaylist(rhTicket!!,w.lease,w.offset+(player?.currentMediaItemIndex?:w.index))}}
  private fun rhSetOptions(patch:JSONObject){
    val w=rhWindow?:error("当前不是媒体库播放");require(w.options.optBoolean("reference")||patch.keys().asSequence().all{it in setOf("loop","rate")}){"单视频只能修改循环和速度"};val engine=player?:error("播放器尚未就绪");val current=w.offset+engine.currentMediaItemIndex
    rememberRhCurrent()
    val selected=RhVideoClient.get(this).playbackOptions(rhTicket!!,w.lease,current,patch)
    val updated=RhVideoClient.get(this).playbackWindow(rhTicket!!,selected,w.lease)
    val same=patch.keys().asSequence().all{it in setOf("loop","rate")}
    rhWindow=if(same)w.copy(options=updated.options)else updated;engine.repeatMode=if(updated.options.optBoolean("loop"))Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF;engine.setPlaybackSpeed(updated.options.optDouble("rate",1.0).toFloat())
    if(same){armRhEnd();rememberRhPlaylist();updateRhProgress()}else rebuildRhWindow(selected,playing=engine.playWhenReady,saveCurrent=false)
  }
  private fun armRhEnd(){
    rhEndMessage?.cancel();rhEndMessage=null;val revision=++rhEndRevision
    val engine=player?:return;val w=rhWindow?:return;if(!w.options.optBoolean("reference")||rebuildingWindow||isFinishing)return
    val local=engine.currentMediaItemIndex;if(local !in w.ends.indices)return
    val input=rhInputId;val threshold=(w.ends[local]-300).coerceAtLeast(w.starts[local]+1)
    val ended={
      if(player===engine&&!isFinishing&&rhInputId==input&&rhWindow?.lease==w.lease&&rhEndRevision==revision){
        if(rhWindow!!.options.optBoolean("loop")){engine.seekTo(w.starts[local]);armRhEnd()}
        else if(w.offset+local+1<w.total)rebuildRhWindow(w.offset+local+1)
        else rhUiAction(JSONObject().put("command","close"))
      };Unit
    }
    if(engine.currentPosition>=threshold)rhUi.post{ended()}
    else rhEndMessage=engine.createMessage{_,_->ended()}.setLooper(engine.applicationLooper).setPosition(local,threshold).send()
  }
  private fun rhQueuePosition(w:RhVideoClient.Window,local:Int,positionMs:Long)=w.beforeMs[local]+(positionMs-w.starts[local]).coerceIn(0,(w.ends[local]-w.starts[local]).coerceAtLeast(0))
  private fun updateRhProgress(){val engine=player?:return;val w=rhWindow?:return;val local=engine.currentMediaItemIndex.coerceIn(0,w.items.lastIndex);rhQueueLabel?.text="${w.offset+local+1} / ${w.total} · ${if(w.options.optBoolean("fullLength",true))"全长"else "${w.options.optDouble("segment",3.0)} 秒片段"}";if(rhQueueSeek?.isPressed!=true)rhQueueSeek?.progress=(rhQueuePosition(w,local,engine.currentPosition)*10000/w.totalMs.coerceAtLeast(1)).toInt()}
  private fun showError(error:PlaybackException){
    failure.removeAllViews();failure.visibility=View.VISIBLE;header.visibility=View.VISIBLE
    val format=player?.videoFormat;val codecs=listOfNotNull(format?.sampleMimeType,format?.codecs,player?.audioFormat?.sampleMimeType).distinct().joinToString(" · ")
    val title=TextView(this).apply{text="暂时无法播放";textSize=21f;setTextColor(Color.WHITE);gravity=Gravity.CENTER}
    val detail=TextView(this).apply{text="MP4 等后缀表示容器，不代表内部编码一定受设备支持。\n"+codecs+"\n"+error.errorCodeName+"\n"+(error.cause?.message ?: error.message ?: "读取失败");setTextColor(0xFFB9BEC8.toInt());textSize=13f;setPadding(0,dp(16),0,dp(16));setTextIsSelectable(true)}
    failure.addView(title);failure.addView(detail)
    if(source.scheme !in listOf("remote","rhvideo"))failure.addView(Button(this).apply{text="用其他播放器打开";setOnClickListener{external()}})
    if(player?.hasNextMediaItem()==true||rhWindow?.options?.optString("origin")=="frame")failure.addView(Button(this).apply{text="下一个";setOnClickListener{rhUiAction(JSONObject().put("command","next"))}})
    failure.addView(Button(this).apply{text=if(isRhVideo())"返回"else"返回文件列表";setOnClickListener{if(isRhVideo())rhUiAction(JSONObject().put("command","back"))else finish()}})
  }
  private fun external(){try{
    val uri=if(source.scheme=="file")FileProvider.getUriForFile(this,"$packageName.fileprovider",java.io.File(source.path!!)) else source
    val intent=Intent(Intent.ACTION_VIEW).setDataAndType(uri,if(this.intent.getStringExtra("kind")=="audio")"audio/*" else "video/*")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply{clipData=ClipData.newRawUri("媒体文件",uri)}
    startActivity(Intent.createChooser(intent,"选择播放器").putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS,arrayOf(android.content.ComponentName(this,ExternalPlaybackActivity::class.java))))
  }catch(e:Exception){Toast.makeText(this,"打开播放器失败：${e.message}",Toast.LENGTH_LONG).show()}}
  private fun options(anchor:View){
    val menu=PopupMenu(this,anchor)
    listOf("适应画面","填满画面（可能裁切）","播放速度","循环播放","用其他播放器打开").forEachIndexed{i,label->menu.menu.add(0,i,i,label)}
    menu.menu.findItem(4).isVisible=source.scheme !in listOf("remote","rhvideo")
    menu.menu.findItem(3).setCheckable(true).setChecked(player?.repeatMode==Player.REPEAT_MODE_ONE)
    rhWindow?.let{w->val error=RhVideoClient.get(this).favoriteState("video",currentRhId(),w.generation).optString("favoriteError");if(error.isNotEmpty()&&error!="null")menu.menu.add("收藏失败：$error").isEnabled=false}
    rhWindow?.takeIf{it.options.optBoolean("reference")}?.let{w->
      menu.menu.findItem(3).setTitle("循环当前${if(w.options.optBoolean("fullLength",true))"视频"else "片段"}").setCheckable(true).setChecked(w.options.optBoolean("loop"))
      menu.menu.add(0,5,5,"全长播放").setCheckable(true).setChecked(w.options.optBoolean("fullLength",true))
      menu.menu.add(0,6,6,"片段长度…")
      menu.menu.add(0,7,7,"仅竖屏").setCheckable(true).setChecked(w.options.optBoolean("portraitOnly"))
    }
    menu.setOnMenuItemClickListener{item->when(item.itemId){
      0->rhUiAction(JSONObject().put("command","fit"))
      1->rhUiAction(JSONObject().put("command","fill"))
      2->{val rates=arrayOf("0.5×","1×","1.25×","1.5×","2×");androidx.appcompat.app.AlertDialog.Builder(this).setTitle("播放速度").setItems(rates){_,index->rhUiAction(JSONObject().put("command","rate").put("value",floatArrayOf(.5f,1f,1.25f,1.5f,2f)[index]))}.show()}
      3->{rhUiAction(JSONObject().put("command","repeat").put("enabled",player?.repeatMode!=Player.REPEAT_MODE_ONE));Toast.makeText(this,if(player?.repeatMode==Player.REPEAT_MODE_ONE)"已开启循环" else "已关闭循环",Toast.LENGTH_SHORT).show()}
      4->external()
      5->rhUiAction(JSONObject().put("command","playlist.options").put("options",JSONObject().put("fullLength",rhWindow?.options?.optBoolean("fullLength",true)!=true)))
      6->{val input=EditText(this).apply{inputType=android.text.InputType.TYPE_CLASS_NUMBER;setText((rhWindow?.options?.optDouble("segment",3.0)?:3.0).toInt().toString());hint="1–300 秒"};androidx.appcompat.app.AlertDialog.Builder(this).setTitle("片段长度（秒）").setView(input).setNegativeButton("取消",null).setPositiveButton("确定"){_,_->rhUiAction(JSONObject().put("command","playlist.options").put("options",JSONObject().put("segment",input.text.toString().toDoubleOrNull()?:0)))}.show()}
      7->rhUiAction(JSONObject().put("command","playlist.options").put("options",JSONObject().put("portraitOnly",rhWindow?.options?.optBoolean("portraitOnly")!=true)))
    };true};menu.show()
  }
  override fun onSaveInstanceState(outState:Bundle){outState.putFloat("rhLocalGain",player?.let{RhVideoVolume.local(it)}?:rhLocalGain);outState.putInt("index",player?.currentMediaItemIndex?:index);outState.putInt("rhGlobalIndex",(rhWindow?.offset?:0)+(player?.currentMediaItemIndex?:index));outState.putLong("position",player?.currentPosition ?: position);outState.putBoolean("play",player?.playWhenReady ?: play);super.onSaveInstanceState(outState)}
  override fun onStop(){rhUi.removeCallbacks(rhTick);rhEndMessage?.cancel();rhEndMessage=null;rememberRhPlaylist();player?.let{index=it.currentMediaItemIndex;position=it.currentPosition;rhTicket?.let{ticket->RhVideoClient.get(this).rememberPlayback(ticket,(rhWindow?.offset?:0)+index,position,it.duration)};play=it.playWhenReady;rhLocalGain=RhVideoVolume.local(it);RhVideoVolume.untrack(it);it.release()};if(::playerView.isInitialized)playerView.player=null;player=null;window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);super.onStop()}
  override fun onDestroy(){rhEvents?.close();rhEvents=null;if(active.get()===this)active.clear();super.onDestroy()}
}
