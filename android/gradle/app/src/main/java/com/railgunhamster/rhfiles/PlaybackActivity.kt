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
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
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
    private var active=java.lang.ref.WeakReference<PlaybackActivity>(null)
    fun rhState()=active.get()?.automationState()?:error("原生播放器没有打开")
    fun rhControl(args:JSONObject)=active.get()?.automationControl(args)?:error("原生播放器没有打开")
    fun closeRhVideo(){active.get()?.let{if(it.intent.getStringExtra("path")?.startsWith("rhvideo://")==true)it.finish()}}
  }
  private lateinit var playerView:PlayerView
  private lateinit var header:LinearLayout
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
  override fun onCreate(savedInstanceState:Bundle?) {
    super.onCreate(savedInstanceState)
    NativeAutomation.install(this);active=java.lang.ref.WeakReference(this)
    onBackPressedDispatcher.addCallback(this){finish()}
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
      setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);setShowNextButton(queue.size>1);setShowPreviousButton(queue.size>1)
      setShowSubtitleButton(true);setShowRewindButton(true);setShowFastForwardButton(true)
      controllerShowTimeoutMs=3500;setKeepContentOnPlayerReset(true);resizeMode=resize
      controllerAutoShow=false
      setFullscreenButtonClickListener {full->landscape=full;requestedOrientation=if(full)ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED}
    }
    root.addView(playerView,FrameLayout.LayoutParams(-1,-1))
    header=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),dp(18),dp(8),dp(10));background=GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(0xBB000000.toInt(),0x00000000))}
    val back=ImageButton(this).apply{contentDescription="返回";setImageResource(R.drawable.ic_player_back);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{finish()}}
    titleView=TextView(this).apply{text=queue[index].name;setTextColor(Color.WHITE);textSize=16f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
    val more=ImageButton(this).apply{contentDescription="播放选项";setImageResource(R.drawable.ic_player_more);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{options(this)}}
    header.addView(back,LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(titleView,LinearLayout.LayoutParams(0,dp(48),1f));titleView.gravity=Gravity.CENTER_VERTICAL;header.addView(more,LinearLayout.LayoutParams(dp(48),dp(48)))
    root.addView(header,FrameLayout.LayoutParams(-1,-2,Gravity.TOP))
    failure=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(24),dp(24),dp(24),dp(24));setBackgroundColor(0xEE111318.toInt());visibility=View.GONE}
    root.addView(failure,FrameLayout.LayoutParams(-1,-1));setContentView(root)
    playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener{visibility->header.visibility=if(failure.visibility==View.VISIBLE)View.VISIBLE else visibility})
    playerView.hideController();header.visibility=View.GONE
  }
  private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
  internal fun automationState():JSONObject {
    val engine=player?:error("播放器尚未就绪")
    return JSONObject().put("path",path).put("index",engine.currentMediaItemIndex+(rhWindow?.offset?:0)).put("count",rhWindow?.total?:queue.size).put("playing",engine.isPlaying).put("playWhenReady",engine.playWhenReady).put("playbackState",engine.playbackState).put("suppressionReason",engine.playbackSuppressionReason).put("error",engine.playerError?.let{JSONObject().put("code",it.errorCodeName).put("message",it.cause?.message?:it.message?:"") }?:JSONObject.NULL).put("positionMs",engine.currentPosition).put("durationMs",if(engine.duration==C.TIME_UNSET)JSONObject.NULL else engine.duration).put("rate",engine.playbackParameters.speed).put("repeat",engine.repeatMode==Player.REPEAT_MODE_ONE).put("controls",playerView.isControllerFullyVisible)
      .put("volume",RhVideoVolume.local(engine)*100).put("decoderVolume",engine.volume*100).put("tracks",PlayerTracks.state(engine.currentTracks,engine.trackSelectionParameters))
  }
  internal fun automationControl(args:JSONObject):JSONObject {
    val engine=player?:error("播放器尚未就绪")
    if(args.has("expectedPath"))require(args.getString("expectedPath")==path){"播放文件已改变，请重新读取状态"}
    val command=args.getString("command")
    if(command in PlayerTracks.commands)engine.trackSelectionParameters=PlayerTracks.change(engine.currentTracks,engine.trackSelectionParameters,args)
    else when(command){
      "rewind"->engine.seekBack();"forward"->engine.seekForward()
      "toggle"->if(engine.playWhenReady)engine.pause()else engine.play()
      "play"->engine.play();"pause"->engine.pause()
      "next"->{check(engine.hasNextMediaItem()){"没有下一个文件"};val failed=engine.playbackState==Player.STATE_IDLE;engine.seekToNextMediaItem();if(failed){engine.prepare();engine.play()}}
      "previous"->{check(engine.hasPreviousMediaItem()){"没有上一个文件"};val failed=engine.playbackState==Player.STATE_IDLE;engine.seekToPreviousMediaItem();if(failed){engine.prepare();engine.play()}}
      "seek"->{val value=args.getDouble("value");require(value.isFinite()&&value>=0&&engine.duration!=C.TIME_UNSET&&value<=engine.duration){"跳转位置超出范围（毫秒）"};engine.seekTo(value.toLong())}
      "rate"->{val value=args.getDouble("value");require(value.isFinite()&&value in .25..4.0){"播放速度应为 0.25–4"};engine.setPlaybackSpeed(value.toFloat())}
      "volume"->{val value=args.getDouble("value");require(value.isFinite()&&value in 0.0..100.0);RhVideoVolume.setLocal(engine,(value/100).toFloat())}
      "rotate"->{val value=args.getInt("value");require(value in listOf(0,90,180,270));playerView.videoSurfaceView?.rotation=value.toFloat()}
      "repeat"->engine.repeatMode=if(args.getBoolean("enabled"))Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
      "fit"->{resize=AspectRatioFrameLayout.RESIZE_MODE_FIT;playerView.resizeMode=resize}
      "fill"->{resize=AspectRatioFrameLayout.RESIZE_MODE_ZOOM;playerView.resizeMode=resize}
      "controls.show"->playerView.showController();"controls.hide"->playerView.hideController()
      "options"->options(playerView)
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
  override fun onStart(){super.onStart();if(::source.isInitialized)startPlayer()}
  private fun startPlayer(){
    val engine=ExoPlayer.Builder(this,DefaultRenderersFactory(this).setEnableDecoderFallback(true))
      .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(this,DataSource.Factory{MediaRoutingDataSource(this,storage.remote)})))
      .setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).build()
    player=engine;playerView.player=engine
    if(path.startsWith("rhvideo://"))RhVideoVolume.track(engine,rhLocalGain)
    engine.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true)
    engine.setHandleAudioBecomingNoisy(true)
    engine.addListener(object:Player.Listener {
      override fun onPositionDiscontinuity(old:Player.PositionInfo,next:Player.PositionInfo,reason:Int){val ticket=rhTicket;val w=rhWindow;if(!rebuildingWindow&&ticket!=null&&w!=null)RhVideoClient.get(this@PlaybackActivity).rememberPlayback(ticket,w.offset+old.mediaItemIndex,old.positionMs,0)}
      override fun onMediaItemTransition(item:MediaItem?,reason:Int){
        index=engine.currentMediaItemIndex.coerceIn(0,queue.lastIndex);path=queue[index].path;source=sources[index];titleView.text=queue[index].name;title=queue[index].name
        failure.visibility=View.GONE
        val w=rhWindow
        if(!rebuildingWindow&&w!=null&&((index<=1&&w.offset>0)||(index>=queue.lastIndex-1&&w.offset+queue.size<w.total))){
          rebuildRhWindow(w.offset+index)
        }
      }
      override fun onRenderedFirstFrame(){playerView.videoSurfaceView?.rotation=(rhWindow?.options?.optInt("rotation",0)?:0).toFloat();if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","First video frame rendered")}
      override fun onPlaybackStateChanged(state:Int){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","Playback state=$state");if(state==Player.STATE_ENDED&&rhWindow?.options?.optBoolean("loop")==true)rebuildRhWindow(0)}
      override fun onIsPlayingChanged(isPlaying:Boolean){if(isPlaying)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
      override fun onPlayerError(error:PlaybackException){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback",error.errorCodeName);showError(error)}
    })
    engine.setMediaItems(sources.mapIndexed{i,uri->rhItem(i,uri)},index,position);engine.prepare();engine.playWhenReady=play;playerView.hideController()
  }
  private fun rhItem(i:Int,uri:Uri):MediaItem {
    val builder=MediaItem.Builder().setUri(uri).setMediaId(queue[i].path)
    rhWindow?.let{w->val clipping=MediaItem.ClippingConfiguration.Builder().setStartPositionMs(w.starts[i]);if(w.ends[i]>=0)clipping.setEndPositionMs(w.ends[i]);builder.setClippingConfiguration(clipping.build())}
    return builder.build()
  }
  private fun rebuildRhWindow(globalIndex:Int){
    val ticket=rhTicket?:return;val engine=player?:return
    try{rebuildingWindow=true;val w=RhVideoClient.get(this).playbackWindow(ticket,globalIndex);rhWindow=w;queue=w.items;sources=queue.map{Uri.parse(it.path)};index=w.index
      engine.setMediaItems(sources.mapIndexed{i,uri->rhItem(i,uri)},index,0);engine.prepare();engine.play()
    }catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();engine.pause()}finally{rebuildingWindow=false}
  }
  private fun showError(error:PlaybackException){
    failure.removeAllViews();failure.visibility=View.VISIBLE;header.visibility=View.VISIBLE
    val format=player?.videoFormat;val codecs=listOfNotNull(format?.sampleMimeType,format?.codecs,player?.audioFormat?.sampleMimeType).distinct().joinToString(" · ")
    val title=TextView(this).apply{text="暂时无法播放";textSize=21f;setTextColor(Color.WHITE);gravity=Gravity.CENTER}
    val detail=TextView(this).apply{text="MP4 等后缀表示容器，不代表内部编码一定受设备支持。\n"+codecs+"\n"+error.errorCodeName+"\n"+(error.cause?.message ?: error.message ?: "读取失败");setTextColor(0xFFB9BEC8.toInt());textSize=13f;setPadding(0,dp(16),0,dp(16));setTextIsSelectable(true)}
    failure.addView(title);failure.addView(detail)
    if(source.scheme !in listOf("remote","rhvideo"))failure.addView(Button(this).apply{text="用其他播放器打开";setOnClickListener{external()}})
    if(player?.hasNextMediaItem()==true)failure.addView(Button(this).apply{text="下一个";setOnClickListener{automationControl(JSONObject().put("command","next"))}})
    failure.addView(Button(this).apply{text="返回文件列表";setOnClickListener{finish()}})
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
    menu.setOnMenuItemClickListener{item->when(item.itemId){
      0->automationControl(JSONObject().put("command","fit"))
      1->automationControl(JSONObject().put("command","fill"))
      2->{val rates=arrayOf("0.5×","1×","1.25×","1.5×","2×");androidx.appcompat.app.AlertDialog.Builder(this).setTitle("播放速度").setItems(rates){_,index->automationControl(JSONObject().put("command","rate").put("value",floatArrayOf(.5f,1f,1.25f,1.5f,2f)[index]))}.show()}
      3->{automationControl(JSONObject().put("command","repeat").put("enabled",player?.repeatMode!=Player.REPEAT_MODE_ONE));Toast.makeText(this,if(player?.repeatMode==Player.REPEAT_MODE_ONE)"已开启循环" else "已关闭循环",Toast.LENGTH_SHORT).show()}
      4->external()
    };true};menu.show()
  }
  override fun onSaveInstanceState(outState:Bundle){outState.putFloat("rhLocalGain",player?.let{RhVideoVolume.local(it)}?:rhLocalGain);outState.putInt("index",player?.currentMediaItemIndex?:index);outState.putInt("rhGlobalIndex",(rhWindow?.offset?:0)+(player?.currentMediaItemIndex?:index));outState.putLong("position",player?.currentPosition ?: position);outState.putBoolean("play",player?.playWhenReady ?: play);super.onSaveInstanceState(outState)}
  override fun onStop(){player?.let{index=it.currentMediaItemIndex;position=it.currentPosition;rhTicket?.let{ticket->RhVideoClient.get(this).rememberPlayback(ticket,(rhWindow?.offset?:0)+index,position,it.duration)};play=it.playWhenReady;rhLocalGain=RhVideoVolume.local(it);RhVideoVolume.untrack(it);it.release()};if(::playerView.isInitialized)playerView.player=null;player=null;window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);super.onStop()}
  override fun onDestroy(){if(active.get()===this)active.clear();super.onDestroy()}
}
