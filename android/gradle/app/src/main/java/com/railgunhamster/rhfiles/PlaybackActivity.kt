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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.doOnLayout
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
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
  private var rhFavoriteErrorDialog:androidx.appcompat.app.AlertDialog?=null
  companion object {
    private val nextRhInput=java.util.concurrent.atomic.AtomicLong()
    private var active=java.lang.ref.WeakReference<PlaybackActivity>(null)
    fun rhState()=active.get()?.takeIf{it.isRhVideo()&&!it.rhClosing}?.automationState()?:JSONObject().put("opened",false)
    fun rhControl(args:JSONObject):JSONObject {val target=active.get()?.takeIf{it.isRhVideo()&&!it.rhClosing};if(target==null){if(args.optString("command") in listOf("back","close"))return JSONObject().put("closed",true);error("原生播放器没有打开")};return target.automationControl(args)}
    fun closeRhVideo(){active.get()?.let{if(it.isRhVideo()){it.rhClosing=true;it.finish()}}}
    fun retireRhParent(context:android.content.Context,args:JSONObject):JSONObject{
      check(android.os.Looper.myLooper()==android.os.Looper.getMainLooper());val client=RhVideoClient.get(context);val old=active.get()?.takeIf{it.isRhVideo()}
      old?.takeIf{it.rhWindow?.options?.optString("parentPreview")==args.optString("parentPreview")&&(!args.has("parentPlayback")||it.rhWindow?.options?.optString("parentPlayback")==args.optString("parentPlayback"))}?.rememberRhCurrent()
      val retired=client.retireParent(args)
      if(retired.optBoolean("closed")&&old!=null&&old.rhTicket==retired.optString("ticket")&&old.rhWindow?.lease==retired.optString("lease")){
        old.rhClosing=true;old.rhUi.removeCallbacks(old.rhTick);old.rhEndMessage?.cancel();old.rhEndMessage=null
        old.player?.let{engine->RhVideoVolume.untrack(engine);old.playerView.player=null;(old.playerView as? RhVideoPlayerView)?.unbindRotationEngine(engine);old.player=null;engine.release()};old.finish()
      };return retired
    }
    fun launchRhVideo(owner:android.app.Activity,intent:Intent){
      check(android.os.Looper.myLooper()==android.os.Looper.getMainLooper())
      // The client has already atomically selected the new queue. Retire the
      // old surface/decoder before allocating another, without closing the new
      // queue or treating replacement as a user-requested staging commit.
      active.get()?.takeIf{it.isRhVideo()}?.let{old->
        old.rhClosing=true;old.rhUi.removeCallbacks(old.rhTick);old.rhEndMessage?.cancel();old.rhEndMessage=null
        old.player?.let{engine->RhVideoVolume.untrack(engine);old.playerView.player=null;(old.playerView as? RhVideoPlayerView)?.unbindRotationEngine(engine);old.player=null;engine.release()}
        old.finish()
      }
      owner.startActivity(intent)
    }
  }
  private lateinit var playerView:PlayerView
  private var mediaPageTouch:MediaPageTouch?=null
  private var filePlaybackTouch:FilePlaybackTouch?=null
  private var fileVideoSheet:View?=null
  private lateinit var pageHint:TextView
  private val clearPageHint=Runnable{pageHint.visibility=View.GONE}
  private val selectionMemory by lazy {ViewModelProvider(this,object:ViewModelProvider.Factory{
    @Suppress("UNCHECKED_CAST") override fun <T:ViewModel> create(modelClass:Class<T>):T {require(modelClass==PlaybackSelectionMemory::class.java);return PlaybackSelectionMemory() as T}
  })[PlaybackSelectionMemory::class.java]}
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
  private var filePlaybackRate=1f
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
  private val deleteIo=java.util.concurrent.Executors.newSingleThreadExecutor()
  private var deleteJob:String?=null
  private var deletingSelected:String?=null
  private var deletePending=false
  private var deleteDialog:androidx.appcompat.app.AlertDialog?=null
  private val rhUi=android.os.Handler(android.os.Looper.getMainLooper())
  private val rhTick=object:Runnable{override fun run(){if(rhWindow!=null&&player!=null){updateRhProgress();if(header.visibility==View.VISIBLE)rhUi.postDelayed(this,500)}}}
  override fun onCreate(savedInstanceState:Bundle?) {
    super.onCreate(savedInstanceState)
    NativeAutomation.install(this);active=java.lang.ref.WeakReference(this)
    onBackPressedDispatcher.addCallback(this){
      if(fileVideoSheet!=null)closeFileVideoSheet()
      else if(isRhVideo())rhUiAction(JSONObject().put("command","back"))else finish()
    }
    path=savedInstanceState?.getString("filePath")?:intent.getStringExtra("path") ?: run{finish();return}
    storage=NativeStorage(applicationContext)
    try {
      source=if(storage.isRemote(path)||path.startsWith("rhvideo://"))Uri.parse(path) else if(storage.isDocument(path))storage.docUri(path) else {
        val file=storage.local(path);require(file.isFile && file.canRead()) {"文件不存在或没有读取权限"};Uri.fromFile(file)
      }
      queue=PlaybackQueue.parse(JSONObject().put("path",path).put("name",intent.getStringExtra("name")).put("queue",JSONArray(savedInstanceState?.getString("fileQueue")?:intent.getStringExtra("queue")?:"[]")))
      deleteJob=savedInstanceState?.getString("deleteJob");deletingSelected=savedInstanceState?.getString("deletingSelected")
      rhTicket=intent.getStringExtra("rhvideoPlaylist")
      rhTicket?.let{ticket->
        val lease=intent.getStringExtra("rhvideoLease");val first=RhVideoClient.get(this).playbackWindow(ticket,0,lease)
        rhWindow=RhVideoClient.get(this).playbackWindow(ticket,(savedInstanceState?.getInt("rhGlobalIndex")?:intent.getIntExtra("rhvideoIndex",0)).coerceAtLeast(first.offset),lease)
        queue=rhWindow!!.items
      }
      sources=queue.map{item->if(storage.isRemote(item.path)||item.path.startsWith("rhvideo://"))Uri.parse(item.path)else if(storage.isDocument(item.path))storage.docUri(item.path)else Uri.fromFile(storage.local(item.path))}
      index=(rhWindow?.index?:savedInstanceState?.getInt("index")?:queue.indexOfFirst{it.path==path}).coerceIn(0,queue.lastIndex)
      path=queue[index].path;source=sources[index];title=queue[index].name
    }catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();finish();return}
    position=savedInstanceState?.getLong("position") ?: intent.getLongExtra("positionMs",0).coerceAtLeast(0);play=savedInstanceState?.getBoolean("play",true) ?: true
    landscape=savedInstanceState?.getBoolean("landscape")?:false
    resize=savedInstanceState?.getInt("resize",AspectRatioFrameLayout.RESIZE_MODE_FIT)?:AspectRatioFrameLayout.RESIZE_MODE_FIT
    filePlaybackRate=savedInstanceState?.getFloat("filePlaybackRate",1f)?:1f
    rhLocalGain=savedInstanceState?.getFloat("rhLocalGain",1f)?:1f
    WindowCompat.setDecorFitsSystemWindows(window,false)
    WindowInsetsControllerCompat(window,window.decorView).apply{hide(WindowInsetsCompat.Type.systemBars());systemBarsBehavior=WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE}
    val root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK)}
    playerView=(when {
      rhWindow!=null->RhVideoPlayerView(this)
      usesFileVideoControls()->layoutInflater.inflate(R.layout.rhfiles_playback_view,root,false) as PlayerView
      else->PlayerView(this)
    }).apply {
      if(this is RhVideoPlayerView){setAutoRotation(RhVideoClient.get(this@PlaybackActivity).rotationPreference(rhWindow!!.generation));onRotationRendererChanged={requestRhRotationRestart()};onPresentationFailure={message->showError(PlaybackException(message,null,PlaybackException.ERROR_CODE_VIDEO_FRAME_PROCESSING_FAILED))}}
      val parent=rhWindow?.options?.let{it.optString("origin") in listOf("frame","favorite")&&it.optInt("parentTotal")>0}==true
      setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);setShowNextButton(queue.size>1||parent);setShowPreviousButton(queue.size>1||parent)
      setShowSubtitleButton(!usesFileVideoControls());setShowRewindButton(true);setShowFastForwardButton(true)
      controllerShowTimeoutMs=if(usesFileVideoControls())5000 else 3500;setKeepContentOnPlayerReset(true);resizeMode=resize
      controllerAutoShow=false
      setFullscreenButtonClickListener {full->setPlaybackOrientation(full)}
    }
    root.addView(playerView,FrameLayout.LayoutParams(-1,-1))
    header=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),dp(18),dp(8),dp(10));background=GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(0xBB000000.toInt(),0x00000000))}
    val back=ImageButton(this).apply{contentDescription=when(rhWindow?.options?.optString("origin")){"favorite"->"返回收藏";"frame"->"返回截图";else->"返回"};setImageResource(R.drawable.ic_player_back);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{if(isRhVideo())rhUiAction(JSONObject().put("command","back"))else finish()}}
    titleView=TextView(this).apply{text=queue[index].name;setTextColor(Color.WHITE);textSize=16f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
    val more=ImageButton(this).apply{contentDescription="播放选项";setImageResource(R.drawable.ic_player_more);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{options(this)}}
    moreButton=more
    header.addView(back,LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(titleView,LinearLayout.LayoutParams(0,dp(48),1f));titleView.gravity=Gravity.CENTER_VERTICAL
    if(rhWindow!=null){
      fun actionButton(icon:Int,label:String,command:String)=ImageButton(this).apply{id=when(command){"favorite"->R.id.rhvideo_player_favorite;"mark"->R.id.rhvideo_player_mark;else->R.id.rhvideo_player_close};contentDescription=label;setImageResource(icon);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);var pressedInput:Long?=null;setOnTouchListener{_,event->if(event.actionMasked==android.view.MotionEvent.ACTION_DOWN)pressedInput=rhInputId;false};setOnClickListener{rhUiAction(JSONObject().put("command",command).put("expectedInputId",pressedInput?:rhInputId));pressedInput=null}}
      rhFavorite=actionButton(R.drawable.ic_player_favorite,"收藏","favorite");rhMark=actionButton(R.drawable.ic_player_mark,"标记待暂存","mark")
      header.addView(rhFavorite,LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(rhMark,LinearLayout.LayoutParams(dp(48),dp(48)))
      header.addView(actionButton(R.drawable.ic_player_close,"关闭预览","close"),LinearLayout.LayoutParams(dp(48),dp(48)))
      rhEvents=RhVideoClient.get(this).listen{name,payload->if(payload.optLong("generation")==rhWindow?.generation)runOnUiThread{if(!isDestroyed&&!rhClosing){if(name=="rhvideo-rotation-preference")(playerView as? RhVideoPlayerView)?.setAutoRotation(payload.getBoolean("enabled"));paintRhActions();if(name=="rhvideo-media-action"&&!payload.isNull("error")&&payload.optString("operation")!=rhFavoriteNotice){rhFavoriteNotice=payload.optString("operation");Toast.makeText(this,payload.optString("error"),Toast.LENGTH_LONG).show()}}}}
    }
    header.addView(more,LinearLayout.LayoutParams(dp(48),dp(48)))
    if(usesFileVideoControls()){
      back.setBackgroundResource(R.drawable.rhfiles_playback_button)
      more.setBackgroundResource(R.drawable.rhfiles_playback_button)
      titleView.setPadding(dp(12),0,dp(12),0)
      titleView.typeface=android.graphics.Typeface.create("sans-serif-medium",android.graphics.Typeface.NORMAL)
    }
    root.addView(header,FrameLayout.LayoutParams(-1,-2,Gravity.TOP))
    if(rhWindow?.options?.let{it.optBoolean("reference")||it.optString("origin")=="favorite"}==true){
      rhProgress=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(8),dp(12),dp(8));setBackgroundColor(0xDD15171D.toInt());visibility=View.GONE}
      rhQueueLabel=TextView(this).apply{setTextColor(Color.WHITE);textSize=12f}
      val favorite=rhWindow?.options?.optString("origin")=="favorite";var input=0L
      rhQueueSeek=SeekBar(this).apply{contentDescription=if(favorite)"收藏浏览位置"else"连播总进度";max=10000;setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{
        override fun onStartTrackingTouch(bar:SeekBar){input=rhInputId}
        override fun onProgressChanged(bar:SeekBar,value:Int,fromUser:Boolean){}
        override fun onStopTrackingTouch(bar:SeekBar){rhUiAction(JSONObject().put("command",if(favorite)"seekParent"else"seekQueue").put("value",bar.progress/10000.0).also{if(favorite)it.put("expectedInputId",input)})}
      })}
      rhProgress!!.addView(rhQueueLabel);rhProgress!!.addView(rhQueueSeek,LinearLayout.LayoutParams(-1,dp(36)))
      root.addView(rhProgress,FrameLayout.LayoutParams(-1,-2,Gravity.TOP).apply{topMargin=dp(76)})
    }
    failure=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(24),dp(24),dp(24),dp(24));setBackgroundColor(0xEE111318.toInt());visibility=View.GONE}
    root.addView(failure,FrameLayout.LayoutParams(-1,-1));setContentView(root)
    pageHint=TextView(this).apply{textSize=16f;setTextColor(Color.WHITE);setPadding(dp(20),dp(12),dp(20),dp(12));visibility=View.GONE;background=GradientDrawable().apply{setColor(0xE6272333.toInt());cornerRadius=dp(22).toFloat()}}
    root.addView(pageHint,FrameLayout.LayoutParams(-2,-2,Gravity.CENTER))
    val inputIdentity={player?.let{it to rhInputId}}
    mediaPageTouch=MediaPageTouch(
      identity=inputIdentity,
      preview={direction->rhUi.removeCallbacks(clearPageHint);pageHint.visibility=if(direction==null)View.GONE else View.VISIBLE;pageHint.text=if(direction==1)"下一个 →"else"← 上一个"},
      page={direction->
        val engine=player;val w=rhWindow
        if(engine!=null){
          val parent=w?.options?.optString("origin") in listOf("frame","favorite")
          val current=(w?.offset?:0)+engine.currentMediaItemIndex;val total=w?.total?:queue.size
          if(parent||(current+direction in 0 until total))rhUiAction(JSONObject().put("command",if(direction>0)"next"else"previous").put("expectedInputId",rhInputId))
          else Toast.makeText(this,if(direction>0)"已经是最后一个文件"else"已经是第一个文件",Toast.LENGTH_SHORT).show()
        }
      })
    if(usesFileVideoControls()){
      installFileVideoControls(root)
      filePlaybackTouch=FilePlaybackTouch(playerView,checkNotNull(mediaPageTouch),inputIdentity,::jumpFromSurface)
    }
    playerView.setOnTouchListener(filePlaybackTouch?:mediaPageTouch)
    playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener{visibility->header.visibility=if(failure.visibility==View.VISIBLE)View.VISIBLE else visibility;rhProgress?.visibility=visibility;rhUi.removeCallbacks(rhTick);if(visibility==View.VISIBLE)rhTick.run()})
    playerView.hideController();header.visibility=View.GONE;paintRhActions()
    deleteJob?.let{job->deletingSelected?.let{selected->header.visibility=View.VISIBLE;titleView.text="正在删除…";rhUi.post{watchDelete(job,selected)}}}
  }
  override fun onPause(){
    if(filePlaybackTouch!=null)filePlaybackTouch?.cancel()else mediaPageTouch?.cancel()
    closeFileVideoSheet(showControls=false)
    super.onPause()
  }
  private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
  private fun usesFileVideoControls()=rhWindow==null&&intent.getStringExtra("kind")!="audio"
  private fun installFileVideoControls(root:View){
    val bottom=playerView.findViewById<View>(R.id.file_player_bottom)
    ViewCompat.setOnApplyWindowInsetsListener(root){_,insets->
      val cutout=insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      header.setPadding(dp(8)+cutout.left,dp(8)+cutout.top,dp(8)+cutout.right,dp(10))
      bottom.setPadding(dp(16)+cutout.left,dp(8),dp(16)+cutout.right,dp(12)+cutout.bottom)
      insets
    }
    playerView.findViewById<View>(R.id.file_player_speed).setOnClickListener{rhUiAction(JSONObject().put("command","speed.options"))}
    playerView.findViewById<View>(R.id.file_player_fit).setOnClickListener{
      rhUiAction(JSONObject().put("command",if(resize==AspectRatioFrameLayout.RESIZE_MODE_FIT)"fill"else"fit"))
      playerView.showController()
    }
    playerView.findViewById<View>(R.id.file_player_orientation).setOnClickListener{
      rhUiAction(JSONObject().put("command","fullscreen").put("enabled",!landscape))
      playerView.showController()
    }
    playerView.findViewById<View>(R.id.file_player_shortcuts).setOnClickListener{rhUiAction(JSONObject().put("command","shortcuts"))}
    paintFileVideoControls()
  }
  private fun rateLabel(rate:Float)=rate.toString().removeSuffix(".0")
  private fun paintFileVideoControls(){
    if(!usesFileVideoControls())return
    playerView.findViewById<TextView>(R.id.file_player_speed).text=getString(R.string.file_player_speed,rateLabel(filePlaybackRate))
    val fit=resize==AspectRatioFrameLayout.RESIZE_MODE_FIT
    playerView.findViewById<TextView>(R.id.file_player_fit).apply{
      setText(if(fit)R.string.file_player_fit else R.string.file_player_fill)
      contentDescription=getString(if(fit)R.string.file_player_fill_action else R.string.file_player_fit_action)
    }
    playerView.findViewById<TextView>(R.id.file_player_orientation).setText(if(landscape)R.string.file_player_exit_landscape else R.string.file_player_landscape)
  }
  private fun setPlaybackOrientation(enabled:Boolean){
    landscape=enabled
    requestedOrientation=if(enabled)ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    paintFileVideoControls()
  }
  private fun jumpFromSurface(direction:Int){
    val command=if(direction<0)Player.COMMAND_SEEK_BACK else Player.COMMAND_SEEK_FORWARD
    if(player?.isCommandAvailable(command)!=true)return
    rhUiAction(JSONObject().put("command",if(direction<0)"rewind"else"forward").put("expectedInputId",rhInputId))
    pageHint.setText(if(direction<0)R.string.file_player_jump_back else R.string.file_player_jump_forward)
    pageHint.visibility=View.VISIBLE
    rhUi.removeCallbacks(clearPageHint)
    rhUi.postDelayed(clearPageHint,750)
  }
  private fun showSpeedOptions(){
    val engine=player?:return
    val input=rhInputId
    val rates=listOf(.5f,.75f,1f,1.25f,1.5f,1.75f,2f)
    fun select(rate:Float){rhUiAction(JSONObject().put("command","rate").put("value",rate).put("expectedInputId",input))}
    if(usesFileVideoControls()){
      openFileVideoSheet(R.string.file_player_speed_title){body->
        for(group in rates.chunked(4)){
          val row=LinearLayout(this)
          for(rate in group){
            val option=Button(this).apply{
              text=rateLabel(rate)+"×";isAllCaps=false;setTextColor(Color.WHITE)
              backgroundTintList=null
              setBackgroundResource(if(rate==engine.playbackParameters.speed)R.drawable.rhfiles_playback_primary else R.drawable.rhfiles_playback_chip)
              setOnClickListener{select(rate);closeFileVideoSheet()}
            }
            row.addView(option,LinearLayout.LayoutParams(0,dp(48),1f).apply{marginEnd=dp(4)})
          }
          body.addView(row,LinearLayout.LayoutParams(-1,-2))
        }
      }
      return
    }
    androidx.appcompat.app.AlertDialog.Builder(this).setTitle(R.string.file_player_speed_title)
      .setSingleChoiceItems(rates.map{rateLabel(it)+"×"}.toTypedArray(),rates.indexOf(engine.playbackParameters.speed)){dialog,selected->
        select(rates[selected])
        dialog.dismiss()
        playerView.showController()
      }.setNegativeButton(android.R.string.cancel,null).show()
  }
  private fun closeFileVideoSheet(showControls:Boolean=true){
    val sheet=fileVideoSheet?:return
    fileVideoSheet=null
    (sheet.parent as? FrameLayout)?.removeView(sheet)
    playerView.importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
    if(showControls)playerView.showController()
  }
  private fun openFileVideoSheet(title:Int,content:(LinearLayout)->Unit){
    closeFileVideoSheet()
    val parent=playerView.parent as FrameLayout
    val overlay=FrameLayout(this).apply{setBackgroundColor(0x77000000);setOnClickListener{closeFileVideoSheet()}}
    val panel=LinearLayout(this).apply{
      orientation=LinearLayout.VERTICAL;isClickable=true;setPadding(dp(16),dp(8),dp(16),dp(14))
      background=GradientDrawable().apply{cornerRadius=dp(24).toFloat();setColor(0xFF201C2A.toInt())}
    }
    val bar=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
    bar.addView(TextView(this).apply{setText(title);textSize=18f;setTextColor(Color.WHITE)},LinearLayout.LayoutParams(0,dp(48),1f).apply{gravity=Gravity.CENTER_VERTICAL})
    bar.addView(Button(this).apply{
      setText(android.R.string.ok);isAllCaps=false;setTextColor(Color.WHITE);backgroundTintList=null;setBackgroundResource(R.drawable.rhfiles_playback_chip)
      setOnClickListener{closeFileVideoSheet()}
    },LinearLayout.LayoutParams(dp(64),dp(48)))
    panel.addView(bar)
    val body=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
    content(body)
    panel.addView(ScrollView(this).apply{addView(body)},LinearLayout.LayoutParams(-1,-2,1f))
    val width=(parent.width-dp(24)).coerceIn(dp(1),dp(560))
    overlay.addView(panel,FrameLayout.LayoutParams(width,-2,Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply{topMargin=dp(12);bottomMargin=dp(12)})
    overlay.addOnLayoutChangeListener{_,left,_,right,_,_,_,_,_->
      val target=(right-left-dp(24)).coerceIn(dp(1),dp(560))
      if(panel.layoutParams.width!=target){panel.layoutParams.width=target;panel.requestLayout()}
    }
    parent.addView(overlay,FrameLayout.LayoutParams(-1,-1))
    fileVideoSheet=overlay
    playerView.hideController()
    playerView.importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    ViewCompat.setAccessibilityPaneTitle(panel,getString(title))
  }
  private fun isRhVideo()=::path.isInitialized&&path.startsWith("rhvideo://")
  private fun currentRhId():String {val w=rhWindow?:error("当前不是媒体库视频");return w.ids[(player?.currentMediaItemIndex?:w.index).coerceIn(0,w.ids.lastIndex)]}
  private fun paintRhActions(){val w=rhWindow?:return;val id=currentRhId();val client=RhVideoClient.get(this);val favorite=client.favoriteState("video",id,w.generation);rhFavorite?.apply{val busy=favorite.optBoolean("favoriteBusy");isEnabled=!busy;alpha=if(busy).4f else 1f;contentDescription=if(busy)"正在更新收藏"else if(favorite.optBoolean("favorite"))"取消收藏"else"收藏";setColorFilter(if(favorite.optBoolean("favorite"))0xFFFFCE61.toInt()else Color.WHITE)};val marked=client.previewMarked("video",id,w.generation);rhMark?.apply{contentDescription=if(marked)"取消暂存标记"else"标记待暂存";setColorFilter(if(marked)0xFFFF7979.toInt()else Color.WHITE)}}
  private fun rememberRhCurrent(){val engine=player?:return;val w=rhWindow?:return;RhVideoClient.get(this).rememberPlayback(rhTicket!!,w.offset+engine.currentMediaItemIndex,engine.currentPosition,engine.duration)}
  private fun closeRhPlayback(direction:Int=0,whole:Boolean=false,targetIndex:Int?=null):JSONObject {
    if(rhClosing)return JSONObject().put("closed",true)
    val w=rhWindow?:run{finish();return JSONObject().put("closed",true)}
    rememberRhCurrent();rememberRhPlaylist();rhClosing=true
    // Release the streamed file before a whole-close can submit its source to
    // the server's staging area; do not depend on the later Activity.onStop.
    rhUi.removeCallbacks(rhTick);rhEndMessage?.cancel();rhEndMessage=null
    player?.let{rhLocalGain=RhVideoVolume.local(it);RhVideoVolume.untrack(it);playerView.player=null;(playerView as? RhVideoPlayerView)?.unbindRotationEngine(it);player=null;it.release()}
    return try{RhVideoClient.get(this).closePlayback(rhTicket!!,w.lease,direction,whole,targetIndex)}finally{finish()}
  }
  internal fun automationState():JSONObject {
    if(deleteJob!=null&&player==null)return JSONObject().put("opened",true).put("deleting",true).put("path",path).put("index",index).put("count",queue.size).put("inputId",rhInputId).put("jobId",deleteJob)
    val engine=player?:error("播放器尚未就绪")
    engine.videoDecoderCounters?.ensureUpdated()
    val currentPosition=engine.currentPosition
    return JSONObject().put("opened",!rhClosing).put("path",path).put("index",engine.currentMediaItemIndex+(rhWindow?.offset?:0)).put("count",rhWindow?.total?:queue.size).put("playing",engine.isPlaying).put("playWhenReady",engine.playWhenReady).put("playbackState",engine.playbackState).put("suppressionReason",engine.playbackSuppressionReason).put("error",engine.playerError?.let{JSONObject().put("code",it.errorCodeName).put("message",it.cause?.message?:it.message?:"") }?:JSONObject.NULL).put("positionMs",currentPosition).put("durationMs",if(engine.duration==C.TIME_UNSET)JSONObject.NULL else engine.duration).put("rate",engine.playbackParameters.speed).put("repeat",engine.repeatMode==Player.REPEAT_MODE_ONE).put("controls",playerView.isControllerFullyVisible)
      .put("volume",RhVideoVolume.local(engine)*100).put("decoderVolume",engine.volume*100).put("tracks",PlayerTracks.state(engine.currentTracks,engine.trackSelectionParameters))
      .put("rendered",rhRendered).put("renderedFrames",engine.videoDecoderCounters?.renderedOutputBufferCount?:0).put("inputId",rhInputId)
      .also{state->(playerView as? RhVideoPlayerView)?.rotationState()?.let{rotation->rotation.keys().forEach{state.put(it,rotation.get(it))}}}
      .also{state->rhWindow?.let{w->val local=engine.currentMediaItemIndex.coerceIn(0,w.items.lastIndex);state.put("id",w.ids[local]).put("lease",w.lease).put("options",JSONObject(w.options.toString())).put("segmentStartMs",w.starts[local]).put("segmentEndMs",w.ends[local]).put("queueDurationMs",w.totalMs).put("queuePositionMs",rhQueuePosition(w,local,currentPosition));state.put("queue",JSONObject().put("id",w.ids[local]).put("index",w.offset+local).put("total",w.total).put("options",JSONObject(w.options.toString())).put("generation",w.generation));val favorite=RhVideoClient.get(this).favoriteState("video",w.ids[local],w.generation);favorite.keys().forEach{state.put(it,favorite.get(it))};state.put("marked",RhVideoClient.get(this).previewMarked("video",w.ids[local],w.generation))}}
  }
  internal fun automationControl(args:JSONObject):JSONObject {
    val engine=player?:error("播放器尚未就绪")
    if(args.has("expectedPath"))require(args.getString("expectedPath")==path){"播放文件已改变，请重新读取状态"}
    if(args.has("expectedInputId"))require(args.getLong("expectedInputId")==rhInputId){"播放输入已改变，请重新读取状态"}
    val command=args.getString("command")
    if(command=="back"&&fileVideoSheet!=null){closeFileVideoSheet();return automationState()}
    if(command=="delete"){require(!isRhVideo()){"媒体库请使用暂存标记"};requestDelete();return automationState()}
    rhWindow?.let{w->try{RhVideoClient.get(this).checkPlayback(rhTicket!!,w.lease)}catch(e:Exception){if(command in listOf("back","close")){rhClosing=true;finish();return JSONObject().put("closed",true).put("stale",true)}else throw e}}
    if(command=="back"||command=="close")return closeRhPlayback(whole=command=="close")
    if(command in PlayerTracks.commands)engine.trackSelectionParameters=PlayerTracks.change(engine.currentTracks,engine.trackSelectionParameters,args)
    else when(command){
      "rewind"->{if(rhWindow?.options?.optBoolean("reference")==true)automationControl(JSONObject().put("command","seek").put("value",(engine.currentPosition-10000).coerceAtLeast(0)))else engine.seekBack()}
      "forward"->{if(rhWindow?.options?.optBoolean("reference")==true)automationControl(JSONObject().put("command","seek").put("value",(engine.currentPosition+10000).coerceAtMost(engine.duration)))else engine.seekForward()}
      "toggle"->if(usesFileVideoControls())Util.handlePlayPauseButtonAction(engine)else if(engine.playWhenReady)engine.pause()else engine.play()
      "play"->engine.play();"pause"->engine.pause()
      "next"->{if(rhWindow?.options?.optString("origin") in listOf("frame","favorite"))return closeRhPlayback(1)else if(rhWindow?.options?.optBoolean("reference")==true)rhNavigate(1)else{check(engine.hasNextMediaItem()){"没有下一个文件"};val failed=engine.playbackState==Player.STATE_IDLE;engine.seekToNextMediaItem();if(failed){engine.prepare();engine.play()}}}
      "previous"->{if(rhWindow?.options?.optString("origin") in listOf("frame","favorite"))return closeRhPlayback(-1)else if(rhWindow?.options?.optBoolean("reference")==true)rhNavigate(-1)else{check(engine.hasPreviousMediaItem()){"没有上一个文件"};val failed=engine.playbackState==Player.STATE_IDLE;engine.seekToPreviousMediaItem();if(failed){engine.prepare();engine.play()}}}
      "seekParent"->{val w=rhWindow?:error("没有收藏浏览队列");val value=args.getDouble("value");require(w.options.optString("origin")=="favorite"&&value.isFinite()&&value in 0.0..1.0){"收藏浏览进度无效"};return closeRhPlayback(targetIndex=Math.round(value*(w.options.getInt("parentTotal")-1)).toInt())}
      "favorite"->{val w=rhWindow?:error("当前不是媒体库视频");val input=rhInputId;val client=RhVideoClient.get(this);val ticket=rhTicket!!;client.toggleFavorite("video",currentRhId(),w.generation){!rhClosing&&rhInputId==input&&runCatching{client.checkPlayback(ticket,w.lease)}.isSuccess};paintRhActions()}
      "mark"->{val w=rhWindow?:error("当前不是媒体库视频");val params=JSONObject().put("_sessionGeneration",w.generation).put("kind","video").put("id",currentRhId()).put("title",queue[engine.currentMediaItemIndex].name);if(args.has("enabled"))params.put("enabled",args.getBoolean("enabled"));val result=RhVideoClient.get(this).request("preview.mark",params) as JSONObject;paintRhActions();Toast.makeText(this,if(result.getBoolean("enabled"))"已标记；关闭预览时移入 RHVideo 暂存区（非永久删除）"else"已取消暂存标记",Toast.LENGTH_LONG).show()}
      "seek"->{val value=args.getDouble("value");require(value.isFinite()&&value>=0&&engine.duration!=C.TIME_UNSET&&value<=engine.duration){"跳转位置超出范围（毫秒）"};val w=rhWindow;val i=engine.currentMediaItemIndex;if(w?.options?.optBoolean("reference")==true&&w.options.optBoolean("loop")&&(value<w.starts[i]-500||value>w.ends[i]+1000))rhSetOptions(JSONObject().put("loop",false));engine.seekTo(value.toLong());armRhEnd()}
      "seekQueue"->{val w=rhWindow?:error("当前不是连播");val target=RhVideoClient.get(this).playbackTarget(rhTicket!!,w.lease,args.getDouble("value"));rebuildRhWindow(target.index,target.positionMs,engine.playWhenReady)}
      "playlist.options"->rhSetOptions(args.getJSONObject("options"))
      "rate"->{val value=args.getDouble("value");require(value.isFinite()&&value in .25..4.0){"播放速度应为 0.25–4"};if(rhWindow!=null)rhSetOptions(JSONObject().put("rate",value))else engine.setPlaybackSpeed(value.toFloat())}
      "volume"->{val value=args.getDouble("value");require(value.isFinite()&&value in 0.0..100.0);RhVideoVolume.setLocal(engine,(value/100).toFloat())}
      "rotate"->{val value=args.getInt("value");require(value in listOf(0,90,180,270));(playerView as? RhVideoPlayerView)?.setManualRotation(value)?:run{playerView.videoSurfaceView?.rotation=value.toFloat()}}
      "autoRotate"->{val w=rhWindow?:error("当前不是媒体库视频");val view=playerView as? RhVideoPlayerView?:error("原生旋转尚未就绪");val enabled=if(args.has("enabled")){require(args.get("enabled") is Boolean);args.getBoolean("enabled")}else !view.autoRotate;val selected=RhVideoClient.get(this).rotationPreference(w.generation,enabled);view.setAutoRotation(selected)}
      "repeat"->{if(rhWindow!=null)rhSetOptions(JSONObject().put("loop",args.getBoolean("enabled")))else engine.repeatMode=if(args.getBoolean("enabled"))Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF}
      "fit","fill"->{resize=if(command=="fit")AspectRatioFrameLayout.RESIZE_MODE_FIT else AspectRatioFrameLayout.RESIZE_MODE_ZOOM;playerView.resizeMode=resize;paintFileVideoControls()}
      "controls.show"->playerView.showController();"controls.hide"->playerView.hideController()
      "speed.options"->showSpeedOptions()
      "shortcuts"->{require(usesFileVideoControls());openFileVideoSheet(R.string.file_player_shortcuts_title){body->
        body.addView(TextView(this).apply{setText(R.string.file_player_shortcuts_body);textSize=14f;setTextColor(0xFFE1DAEA.toInt());setLineSpacing(dp(2).toFloat(),1f)})
      }}
      "favorite.error"->showRhFavoriteError()
      "options"->{
        playerView.showController()
        val input=rhInputId
        // Use the same visible anchor/callback as a real More tap. Anchoring a
        // popup to the full-screen video can place its content off screen.
        moreButton.doOnLayout{if(!rhClosing&&!isFinishing&&player===engine&&rhInputId==input)it.performClick()}
      }
      "external"->{require(source.scheme !in listOf("remote","rhvideo")){"受保护的远程媒体不能转交外部应用"};external()}
      "fullscreen"->setPlaybackOrientation(args.getBoolean("enabled"))
      else->error("未知播放器操作")
    };return automationState()
  }
  // PlayerView otherwise consumes the first hardware Back to hide controls.
  // System edge Back and hardware Back must both return to the file list.
  override fun dispatchKeyEvent(event:KeyEvent):Boolean {
    if(event.keyCode==KeyEvent.KEYCODE_BACK){if(event.action==KeyEvent.ACTION_UP && !event.isCanceled)onBackPressedDispatcher.onBackPressed();return true}
    if(usesFileVideoControls()&&player!=null&&fileVideoSheet==null){
      val command=when {
        event.hasNoModifiers()&&event.keyCode==KeyEvent.KEYCODE_SPACE->"toggle"
        event.hasNoModifiers()&&event.keyCode==KeyEvent.KEYCODE_J->"rewind"
        event.hasNoModifiers()&&event.keyCode==KeyEvent.KEYCODE_L->"forward"
        event.hasModifiers(KeyEvent.META_ALT_ON)&&event.keyCode==KeyEvent.KEYCODE_DPAD_LEFT->"previous"
        event.hasModifiers(KeyEvent.META_ALT_ON)&&event.keyCode==KeyEvent.KEYCODE_DPAD_RIGHT->"next"
        else->null
      }
      if(command!=null){
        if(event.action==KeyEvent.ACTION_UP&&!event.isCanceled)rhUiAction(JSONObject().put("command",command))
        return true
      }
    }
    return super.dispatchKeyEvent(event)
  }
  override fun onStart(){super.onStart();if(::source.isInitialized&&deleteJob==null)try{rhWindow?.let{RhVideoClient.get(this).checkPlayback(rhTicket!!,it.lease)};startPlayer()}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();finish()}}
  private fun requestRhRotationRestart(){
    val owner=player?:return;val input=rhInputId
    rhUi.post{if(player===owner&&rhInputId==input&&!rhClosing&&!isFinishing)restartRhRotation(owner)}
  }
  private fun restartRhRotation(old:ExoPlayer){
    selectionMemory.remember(old)
    index=old.currentMediaItemIndex;position=old.currentPosition;play=old.playWhenReady;val rate=old.playbackParameters.speed;val repeat=old.repeatMode
    rhLocalGain=RhVideoVolume.local(old);rhEndMessage?.cancel();rhEndMessage=null;playerView.player=null
    (playerView as? RhVideoPlayerView)?.unbindRotationEngine(old,true);RhVideoVolume.untrack(old);player=null;old.release()
    startPlayer(true,rate,repeat)
  }
  private fun startPlayer(keepInput:Boolean=false,restoredRate:Float?=null,restoredRepeat:Int?=null){
    rhFavoriteErrorDialog?.dismiss();rhFavoriteErrorDialog=null
    val mediaFactory=DefaultMediaSourceFactory(DefaultDataSource.Factory(this,DataSource.Factory{MediaRoutingDataSource(this,storage.remote)}))
    if(path.startsWith("rhvideo://"))mediaFactory.setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(0))
    val engine=ExoPlayer.Builder(this,DefaultRenderersFactory(this).setEnableDecoderFallback(true))
      .setMediaSourceFactory(mediaFactory)
      .setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).build()
    player=engine;selectionMemory.restore(engine);if(!keepInput)rhInputId=nextRhInput.incrementAndGet();rhRendered=false
    (playerView as? RhVideoPlayerView)?.bindRotationEngine(engine)
    playerView.player=if(rhWindow!=null)object:ForwardingPlayer(engine){
      override fun setVideoSurfaceView(surface:android.view.SurfaceView?){if((playerView as? RhVideoPlayerView)?.bindNativeSurface(engine,surface)!=true)super.setVideoSurfaceView(surface)}
      override fun clearVideoSurfaceView(surface:android.view.SurfaceView?){if((playerView as? RhVideoPlayerView)?.bindNativeSurface(engine,null)!=true)super.clearVideoSurfaceView(surface)}
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
      override fun getAvailableCommands():Player.Commands{val commands=super.getAvailableCommands().buildUpon();if(rhWindow?.options?.let{it.optBoolean("reference")||it.optString("origin") in listOf("frame","favorite")}==true)commands.addAll(Player.COMMAND_SEEK_TO_NEXT,Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,Player.COMMAND_SEEK_TO_PREVIOUS,Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM);return commands.build()}
    }else if(usesFileVideoControls())object:ForwardingPlayer(engine){
      // Media3's generic Previous restarts the current video after a few seconds.
      // File navigation uses adjacent queue items at any playback position.
      override fun seekToPrevious(){rhUiAction(JSONObject().put("command","previous"))}
      override fun seekToNext(){rhUiAction(JSONObject().put("command","next"))}
      override fun isCommandAvailable(command:Int)=when(command){
        Player.COMMAND_SEEK_TO_PREVIOUS->engine.hasPreviousMediaItem()
        Player.COMMAND_SEEK_TO_NEXT->engine.hasNextMediaItem()
        else->super.isCommandAvailable(command)
      }
      override fun getAvailableCommands():Player.Commands=super.getAvailableCommands().buildUpon()
        .removeIf(Player.COMMAND_SEEK_TO_PREVIOUS,!engine.hasPreviousMediaItem())
        .removeIf(Player.COMMAND_SEEK_TO_NEXT,!engine.hasNextMediaItem()).build()
    }else engine
    if(path.startsWith("rhvideo://"))RhVideoVolume.track(engine,rhLocalGain)
    engine.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true)
    engine.setHandleAudioBecomingNoisy(true)
    var restoredRotationSource=if(keepInput)queue[index].path else null
    engine.addListener(object:Player.Listener {
      override fun onPositionDiscontinuity(old:Player.PositionInfo,next:Player.PositionInfo,reason:Int){val ticket=rhTicket;val w=rhWindow;if(!rebuildingWindow&&ticket!=null&&w!=null)RhVideoClient.get(this@PlaybackActivity).rememberPlayback(ticket,w.offset+old.mediaItemIndex,old.positionMs,0)}
      override fun onMediaItemTransition(item:MediaItem?,reason:Int){
        val restoredInput=restoredRotationSource!=null&&item?.mediaId==restoredRotationSource&&reason==Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED
        restoredRotationSource=null
        index=engine.currentMediaItemIndex.coerceIn(0,queue.lastIndex);path=queue[index].path;source=sources[index];titleView.text=queue[index].name;title=queue[index].name
        failure.visibility=View.GONE;paintRhActions()
        val w=rhWindow
        if(w==null){rhInputId=nextRhInput.incrementAndGet();rhRendered=false}
        if(!rebuildingWindow&&w!=null){
          if((index<=1&&w.offset>0)||(index>=queue.lastIndex-1&&w.offset+queue.size<w.total))rebuildRhWindow(w.offset+index,if(w.options.optBoolean("reference"))w.starts[index]else 0,engine.playWhenReady)
          else{if(reason!=Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT&&!restoredInput){rhInputId=nextRhInput.incrementAndGet();rhRendered=false};if(w.options.optBoolean("reference")&&reason in listOf(Player.MEDIA_ITEM_TRANSITION_REASON_AUTO,Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT))engine.seekTo(w.starts[index]);armRhEnd();rememberRhPlaylist()}
        }
      }
      override fun onRenderedFirstFrame(){rhRendered=true;if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","First video frame rendered")}
      override fun onPlaybackParametersChanged(parameters:PlaybackParameters){if(usesFileVideoControls()){filePlaybackRate=parameters.speed;paintFileVideoControls()}}
      override fun onTracksChanged(tracks:Tracks){if(usesFileVideoControls()){
        playerView.setShowSubtitleButton(tracks.isTypeSupported(C.TRACK_TYPE_TEXT))
        val audioCount=tracks.groups.filter{it.type==C.TRACK_TYPE_AUDIO}.sumOf{group->(0 until group.length).count{group.isTrackSupported(it)}}
        playerView.findViewById<View>(androidx.media3.ui.R.id.exo_audio_track).visibility=if(audioCount>1)View.VISIBLE else View.GONE
      }}
      override fun onPlaybackStateChanged(state:Int){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","Playback state=$state");if(state==Player.STATE_ENDED&&rhWindow!=null){if(rhWindow!!.options.optBoolean("loop")){engine.seekTo(engine.currentMediaItemIndex,rhWindow!!.starts[engine.currentMediaItemIndex]);engine.play()}else if(rhWindow!!.options.optBoolean("closeAtEnd"))rhUiAction(JSONObject().put("command","close"))}}
      override fun onIsPlayingChanged(isPlaying:Boolean){if(isPlaying)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
      override fun onPlayerError(error:PlaybackException){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback",error.errorCodeName);showError(error);val w=rhWindow;if(w?.options?.optBoolean("reference")==true){Toast.makeText(this@PlaybackActivity,"视频加载失败：${queue[index].name}（${error.errorCodeName}）",Toast.LENGTH_LONG).show();val input=rhInputId;rhUi.post{if(player===engine&&rhInputId==input&&!isFinishing){if(w.offset+index+1<w.total)rebuildRhWindow(w.offset+index+1)else rhUiAction(JSONObject().put("command","close"))}}}}
    })
    rhWindow?.options?.let{engine.setPlaybackSpeed(it.optDouble("rate",1.0).toFloat());engine.repeatMode=if(it.optBoolean("loop"))Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF}
    if(usesFileVideoControls())engine.setPlaybackSpeed(filePlaybackRate)
    restoredRate?.let{engine.setPlaybackSpeed(it)};restoredRepeat?.let{engine.repeatMode=it}
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
  private fun rhQueuePosition(w:RhVideoClient.Window,local:Int,positionMs:Long):Long {
    val start=w.starts[local]
    // -1 leaves a full-length input open to its actual EOF, not zero length.
    // Read a known decoder duration for reporting only; never edit the plan
    // or add a MediaItem clipping end to make a progress value look correct.
    val end=w.ends[local].takeIf{it>=0}?:player?.duration?.takeIf{it>=0}
    val elapsed=(positionMs-start).coerceAtLeast(0)
    return w.beforeMs[local]+(end?.let{elapsed.coerceAtMost((it-start).coerceAtLeast(0))}?:elapsed)
  }
  private fun updateRhProgress(){val engine=player?:return;val w=rhWindow?:return;val local=engine.currentMediaItemIndex.coerceIn(0,w.items.lastIndex);if(w.options.optString("origin")=="favorite"){val count=w.options.getInt("parentTotal");val selected=w.options.getInt("parentIndex");rhQueueLabel?.text="${selected+1} / $count";if(rhQueueSeek?.isPressed!=true)rhQueueSeek?.progress=if(count>1)(selected*10000.0/(count-1)).toInt()else 0;return};rhQueueLabel?.text="${w.offset+local+1} / ${w.total} · ${if(w.options.optBoolean("fullLength",true))"全长"else "${w.options.optDouble("segment",3.0)} 秒片段"}";if(rhQueueSeek?.isPressed!=true)rhQueueSeek?.progress=(rhQueuePosition(w,local,engine.currentPosition)*10000/w.totalMs.coerceAtLeast(1)).toInt()}
  private fun showError(error:PlaybackException){
    failure.removeAllViews();failure.visibility=View.VISIBLE;header.visibility=View.VISIBLE
    val format=player?.videoFormat;val codecs=listOfNotNull(format?.sampleMimeType,format?.codecs,player?.audioFormat?.sampleMimeType).distinct().joinToString(" · ")
    val title=TextView(this).apply{text="暂时无法播放";textSize=21f;setTextColor(Color.WHITE);gravity=Gravity.CENTER}
    val detail=TextView(this).apply{text="MP4 等后缀表示容器，不代表内部编码一定受设备支持。\n"+codecs+"\n"+error.errorCodeName+"\n"+(error.cause?.message ?: error.message ?: "读取失败");setTextColor(0xFFB9BEC8.toInt());textSize=13f;setPadding(0,dp(16),0,dp(16));setTextIsSelectable(true)}
    failure.addView(title);failure.addView(detail)
    if(source.scheme !in listOf("remote","rhvideo"))failure.addView(Button(this).apply{text="用其他播放器打开";setOnClickListener{external()}})
    if(player?.hasNextMediaItem()==true||rhWindow?.options?.optString("origin") in listOf("frame","favorite"))failure.addView(Button(this).apply{text="下一个";setOnClickListener{rhUiAction(JSONObject().put("command","next"))}})
    failure.addView(Button(this).apply{text=if(isRhVideo())"返回"else"返回文件列表";setOnClickListener{if(isRhVideo())rhUiAction(JSONObject().put("command","back"))else finish()}})
  }
  private fun external(){try{
    val uri=if(source.scheme=="file")FileProvider.getUriForFile(this,"$packageName.fileprovider",java.io.File(source.path!!)) else source
    val intent=Intent(Intent.ACTION_VIEW).setDataAndType(uri,if(this.intent.getStringExtra("kind")=="audio")"audio/*" else "video/*")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply{clipData=ClipData.newRawUri("媒体文件",uri)}
    startActivity(Intent.createChooser(intent,"选择播放器").putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS,arrayOf(android.content.ComponentName(this,ExternalPlaybackActivity::class.java))))
  }catch(e:Exception){Toast.makeText(this,"打开播放器失败：${e.message}",Toast.LENGTH_LONG).show()}}
  private fun showRhFavoriteError(){
    val w=rhWindow?:error("当前不是媒体库视频")
    val error=RhVideoClient.get(this).favoriteState("video",currentRhId(),w.generation).optString("favoriteError")
    check(error.isNotEmpty()&&error!="null"){"当前没有收藏失败信息"}
    rhFavoriteErrorDialog?.dismiss()
    val dialog=androidx.appcompat.app.AlertDialog.Builder(this).setTitle("收藏失败")
      .setView(RhVideoMediaChrome.errorDetails(this,error)).setPositiveButton("关闭",null).create()
    rhFavoriteErrorDialog=dialog
    dialog.setOnDismissListener{if(rhFavoriteErrorDialog===dialog)rhFavoriteErrorDialog=null}
    dialog.show()
  }
  private fun options(anchor:View){
    val menu=PopupMenu(this,anchor)
    listOf("适应画面","填满画面（可能裁切）","播放速度","循环播放","用其他播放器打开").forEachIndexed{i,label->menu.menu.add(0,i,i,label)}
    menu.menu.findItem(4).isVisible=source.scheme !in listOf("remote","rhvideo")
    menu.menu.findItem(3).setCheckable(true).setChecked(player?.repeatMode==Player.REPEAT_MODE_ONE)
    val rotateInput=rhInputId
    val deleteInput=rhInputId;val deletePath=path
    if(!isRhVideo())menu.menu.add(0,10,0,"删除当前文件").isEnabled=!deletePending&&deleteJob==null
    (playerView as? RhVideoPlayerView)?.let{view->menu.menu.add(0,8,2,"智能旋转").setCheckable(true).setChecked(view.autoRotate)}
    rhWindow?.let{w->val error=RhVideoClient.get(this).favoriteState("video",currentRhId(),w.generation).optString("favoriteError");if(error.isNotEmpty()&&error!="null")menu.menu.add(0,9,4,"收藏失败 · 查看详情")}
    rhWindow?.takeIf{it.options.optBoolean("reference")}?.let{w->
      menu.menu.findItem(3).setTitle("循环当前${if(w.options.optBoolean("fullLength",true))"视频"else "片段"}").setCheckable(true).setChecked(w.options.optBoolean("loop"))
      menu.menu.add(0,5,5,"全长播放").setCheckable(true).setChecked(w.options.optBoolean("fullLength",true))
      menu.menu.add(0,6,6,"片段长度…")
      menu.menu.add(0,7,7,"仅竖屏").setCheckable(true).setChecked(w.options.optBoolean("portraitOnly"))
    }
    menu.setOnMenuItemClickListener{item->when(item.itemId){
      0->rhUiAction(JSONObject().put("command","fit"))
      1->rhUiAction(JSONObject().put("command","fill"))
      2->showSpeedOptions()
      3->{rhUiAction(JSONObject().put("command","repeat").put("enabled",player?.repeatMode!=Player.REPEAT_MODE_ONE));Toast.makeText(this,if(player?.repeatMode==Player.REPEAT_MODE_ONE)"已开启循环" else "已关闭循环",Toast.LENGTH_SHORT).show()}
      4->external()
      5->rhUiAction(JSONObject().put("command","playlist.options").put("options",JSONObject().put("fullLength",rhWindow?.options?.optBoolean("fullLength",true)!=true)))
      6->{val input=EditText(this).apply{inputType=android.text.InputType.TYPE_CLASS_NUMBER;setText((rhWindow?.options?.optDouble("segment",3.0)?:3.0).toInt().toString());hint="1–300 秒"};androidx.appcompat.app.AlertDialog.Builder(this).setTitle("片段长度（秒）").setView(input).setNegativeButton("取消",null).setPositiveButton("确定"){_,_->rhUiAction(JSONObject().put("command","playlist.options").put("options",JSONObject().put("segment",input.text.toString().toDoubleOrNull()?:0)))}.show()}
      7->rhUiAction(JSONObject().put("command","playlist.options").put("options",JSONObject().put("portraitOnly",rhWindow?.options?.optBoolean("portraitOnly")!=true)))
      8->rhUiAction(JSONObject().put("command","autoRotate").put("expectedInputId",rotateInput))
      9->rhUiAction(JSONObject().put("command","favorite.error").put("expectedInputId",rotateInput))
      10->rhUiAction(JSONObject().put("command","delete").put("expectedInputId",deleteInput).put("expectedPath",deletePath))
    };true};menu.show()
  }
  private fun requestDelete(){
    check(!deletePending&&deleteJob==null){"正在处理删除"};val selected=path;val input=rhInputId;val selectedName=queue[index].name
    deletePending=true
    deleteIo.execute{
      try{
        val policy=DeletePolicy.describe(storage,listOf(selected))
        rhUi.post{
          if(isFinishing||isDestroyed||path!=selected||rhInputId!=input){deletePending=false;return@post}
          deleteDialog=androidx.appcompat.app.AlertDialog.Builder(this).setTitle("删除 $selectedName？").setMessage(policy.getString("message"))
            .setNegativeButton("取消",null).setPositiveButton(if(policy.getBoolean("recycle"))"移入回收站"else"永久删除"){_,_->
              if(path==selected&&rhInputId==input&&deleteJob==null)beginDelete(selected,policy)
              else Toast.makeText(this,"播放文件已改变，未删除",Toast.LENGTH_LONG).show()
            }.create().also{dialog->dialog.setOnDismissListener{deletePending=false;deleteDialog=null};dialog.show()}
        }
      }catch(error:Exception){rhUi.post{deletePending=false;if(!isFinishing&&!isDestroyed)Toast.makeText(this,error.message,Toast.LENGTH_LONG).show()}}
    }
  }
  private fun beginDelete(selected:String,policy:JSONObject){
    val engine=player?:return;play=engine.playWhenReady;position=engine.currentPosition
    // Release the network range reader and OS file handle before recycling.
    selectionMemory.remember(engine);RhVideoVolume.untrack(engine);playerView.player=null;engine.release();player=null
    val args=JSONObject().put("sources",JSONArray(listOf(selected))).put("permanent",!policy.getBoolean("recycle"))
    queue.firstOrNull{it.path==selected}?.revision?.let{args.put("revisions",JSONObject().put(selected,it))}
    try{deleteJob=FileTasks.start(this,if(policy.getString("kind")=="local")"trash"else"delete",args)}
    catch(error:Exception){deletePending=false;Toast.makeText(this,error.message,Toast.LENGTH_LONG).show();startPlayer();return}
    val job=deleteJob!!
    deletingSelected=selected;titleView.text="正在删除…";header.visibility=View.VISIBLE;moreButton.isEnabled=false
    rhUi.post{watchDelete(job,selected)}
  }
  private fun watchDelete(job:String,selected:String){
      if(isFinishing||isDestroyed||deleteJob!=job)return
      val result=FileTasks.status(this,job)
      if(result.getString("state") in listOf("queued","scanning","running","paused")){rhUi.postDelayed({watchDelete(job,selected)},250);return}
      deleteJob=null;deletingSelected=null;moreButton.isEnabled=true
      val completed=result.optJSONArray("completed")?:JSONArray()
      if((0 until completed.length()).any{completed.optString(it)==selected}){
        val selectedName=queue.first{it.path==selected}.name;val next=PlaybackQueue.afterDelete(queue,selected);queue=next.first;index=next.second
        if(queue.isEmpty()){Toast.makeText(this,"已删除，文件夹内没有其他视频",Toast.LENGTH_SHORT).show();finish();return}
        sources=queue.map{item->if(storage.isRemote(item.path))Uri.parse(item.path)else if(storage.isDocument(item.path))storage.docUri(item.path)else Uri.fromFile(storage.local(item.path))}
        path=queue[index].path;source=sources[index];position=0;play=true;titleView.text=queue[index].name;title=queue[index].name
        playerView.setShowNextButton(queue.size>1);playerView.setShowPreviousButton(queue.size>1)
        Toast.makeText(this,"已删除 $selectedName",Toast.LENGTH_SHORT).show()
      }else{
        Toast.makeText(this,result.optJSONArray("failures")?.optJSONObject(0)?.optString("message")?.takeIf{it.isNotBlank()}?:result.optString("message","删除失败，请核对目标"),Toast.LENGTH_LONG).show();play=false
      }
      if(lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED))startPlayer()
  }
  override fun onSaveInstanceState(outState:Bundle){if(!isRhVideo()){outState.putString("filePath",path);outState.putString("fileQueue",PlaybackQueue.json(queue));outState.putString("deleteJob",deleteJob);outState.putString("deletingSelected",deletingSelected)};player?.let(selectionMemory::remember);outState.putFloat("rhLocalGain",player?.let{RhVideoVolume.local(it)}?:rhLocalGain);outState.putInt("index",player?.currentMediaItemIndex?:index);outState.putInt("rhGlobalIndex",(rhWindow?.offset?:0)+(player?.currentMediaItemIndex?:index));outState.putLong("position",player?.currentPosition ?: position);outState.putBoolean("play",player?.playWhenReady ?: play);outState.putBoolean("landscape",landscape);outState.putInt("resize",resize);outState.putFloat("filePlaybackRate",filePlaybackRate);super.onSaveInstanceState(outState)}
  override fun onStop(){rhUi.removeCallbacks(rhTick);rhEndMessage?.cancel();rhEndMessage=null;rememberRhPlaylist();player?.let{selectionMemory.remember(it);index=it.currentMediaItemIndex;position=it.currentPosition;rhTicket?.let{ticket->RhVideoClient.get(this).rememberPlayback(ticket,(rhWindow?.offset?:0)+index,position,it.duration)};play=it.playWhenReady;rhLocalGain=RhVideoVolume.local(it);RhVideoVolume.untrack(it);playerView.player=null;(playerView as? RhVideoPlayerView)?.unbindRotationEngine(it);it.release()};player=null;window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);super.onStop()}
  override fun onDestroy(){deleteDialog?.dismiss();deleteDialog=null;deleteIo.shutdown();rhUi.removeCallbacksAndMessages(null);rhFavoriteErrorDialog?.dismiss();rhFavoriteErrorDialog=null;rhEvents?.close();rhEvents=null;if(active.get()===this)active.clear();super.onDestroy()}
}
