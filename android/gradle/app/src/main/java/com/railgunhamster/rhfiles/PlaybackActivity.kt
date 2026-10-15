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
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/** Native local/content playback: no WebView asset protocol, MIME guess or stretched icon. */
@UnstableApi
class PlaybackActivity:AppCompatActivity() {
  private lateinit var playerView:PlayerView
  private lateinit var header:LinearLayout
  private lateinit var failure:LinearLayout
  private lateinit var source:Uri
  private lateinit var path:String
  private var player:ExoPlayer?=null
  private var position=0L
  private var play=true
  private var landscape=false
  private var resize=AspectRatioFrameLayout.RESIZE_MODE_FIT
  override fun onCreate(savedInstanceState:Bundle?) {
    super.onCreate(savedInstanceState)
    onBackPressedDispatcher.addCallback(this){finish()}
    path=intent.getStringExtra("path") ?: run{finish();return}
    val storage=NativeStorage(this)
    try {
      source=if(storage.isDocument(path))storage.docUri(path) else {
        val file=storage.local(path);require(file.isFile && file.canRead()) {"文件不存在或没有读取权限"};Uri.fromFile(file)
      }
    }catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();finish();return}
    position=savedInstanceState?.getLong("position") ?: 0;play=savedInstanceState?.getBoolean("play",true) ?: true
    WindowCompat.setDecorFitsSystemWindows(window,false)
    WindowInsetsControllerCompat(window,window.decorView).apply{hide(WindowInsetsCompat.Type.systemBars());systemBarsBehavior=WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE}
    val root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK)}
    playerView=PlayerView(this).apply {
      setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);setShowNextButton(false);setShowPreviousButton(false)
      setShowSubtitleButton(true);setShowRewindButton(true);setShowFastForwardButton(true)
      controllerShowTimeoutMs=3500;setKeepContentOnPlayerReset(true);resizeMode=resize
      setFullscreenButtonClickListener {full->landscape=full;requestedOrientation=if(full)ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED}
    }
    root.addView(playerView,FrameLayout.LayoutParams(-1,-1))
    header=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),dp(18),dp(8),dp(10));background=GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(0xBB000000.toInt(),0x00000000))}
    val back=ImageButton(this).apply{contentDescription="返回";setImageResource(R.drawable.ic_player_back);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{finish()}}
    val title=TextView(this).apply{text=intent.getStringExtra("name") ?: path.substringAfterLast('/');setTextColor(Color.WHITE);textSize=16f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
    val more=ImageButton(this).apply{contentDescription="播放选项";setImageResource(R.drawable.ic_player_more);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);setOnClickListener{options(this)}}
    header.addView(back,LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(title,LinearLayout.LayoutParams(0,dp(48),1f));title.gravity=Gravity.CENTER_VERTICAL;header.addView(more,LinearLayout.LayoutParams(dp(48),dp(48)))
    root.addView(header,FrameLayout.LayoutParams(-1,-2,Gravity.TOP))
    failure=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(24),dp(24),dp(24),dp(24));setBackgroundColor(0xEE111318.toInt());visibility=View.GONE}
    root.addView(failure,FrameLayout.LayoutParams(-1,-1));setContentView(root)
    playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener{visibility->header.visibility=if(failure.visibility==View.VISIBLE)View.VISIBLE else visibility})
  }
  private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
  // PlayerView otherwise consumes the first hardware Back to hide controls.
  // System edge Back and hardware Back must both return to the file list.
  override fun dispatchKeyEvent(event:KeyEvent):Boolean {
    if(event.keyCode==KeyEvent.KEYCODE_BACK){if(event.action==KeyEvent.ACTION_UP && !event.isCanceled)onBackPressedDispatcher.onBackPressed();return true}
    return super.dispatchKeyEvent(event)
  }
  override fun onStart(){super.onStart();if(::source.isInitialized)startPlayer()}
  private fun startPlayer(){
    val engine=ExoPlayer.Builder(this,DefaultRenderersFactory(this).setEnableDecoderFallback(true))
      .setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).build()
    player=engine;playerView.player=engine
    engine.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true)
    engine.setHandleAudioBecomingNoisy(true)
    engine.addListener(object:Player.Listener {
      override fun onRenderedFirstFrame(){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","First video frame rendered")}
      override fun onPlaybackStateChanged(state:Int){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback","Playback state=$state")}
      override fun onIsPlayingChanged(isPlaying:Boolean){if(isPlaying)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
      override fun onPlayerError(error:PlaybackException){if(BuildConfig.DEBUG)android.util.Log.d("RHFilesPlayback",error.errorCodeName);showError(error)}
    })
    engine.setMediaItem(MediaItem.fromUri(source));engine.seekTo(position);engine.prepare();engine.playWhenReady=play
  }
  private fun showError(error:PlaybackException){
    failure.removeAllViews();failure.visibility=View.VISIBLE;header.visibility=View.VISIBLE
    val format=player?.videoFormat;val codecs=listOfNotNull(format?.sampleMimeType,format?.codecs,player?.audioFormat?.sampleMimeType).distinct().joinToString(" · ")
    val title=TextView(this).apply{text="暂时无法播放";textSize=21f;setTextColor(Color.WHITE);gravity=Gravity.CENTER}
    val detail=TextView(this).apply{text="MP4 等后缀表示容器，不代表内部编码一定受设备支持。\n"+codecs+"\n"+error.errorCodeName+"\n"+(error.cause?.message ?: error.message ?: "读取失败");setTextColor(0xFFB9BEC8.toInt());textSize=13f;setPadding(0,dp(16),0,dp(16));setTextIsSelectable(true)}
    failure.addView(title);failure.addView(detail)
    failure.addView(Button(this).apply{text="用其他播放器打开";setOnClickListener{external()}})
    failure.addView(Button(this).apply{text="重试";setOnClickListener{failure.visibility=View.GONE;player?.prepare();player?.play()}})
    failure.addView(Button(this).apply{text="返回文件列表";setOnClickListener{finish()}})
  }
  private fun external(){try{
    val uri=if(source.scheme=="file")FileProvider.getUriForFile(this,"$packageName.fileprovider",java.io.File(source.path!!)) else source
    val intent=Intent(Intent.ACTION_VIEW).setDataAndType(uri,if(this.intent.getStringExtra("kind")=="audio")"audio/*" else "video/*")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply{clipData=ClipData.newRawUri("媒体文件",uri)}
    startActivity(Intent.createChooser(intent,"选择播放器"))
  }catch(e:Exception){Toast.makeText(this,"打开播放器失败：${e.message}",Toast.LENGTH_LONG).show()}}
  private fun options(anchor:View){
    val menu=PopupMenu(this,anchor)
    listOf("适应画面","填满画面（可能裁切）","播放速度","循环播放","用其他播放器打开").forEachIndexed{i,label->menu.menu.add(0,i,i,label)}
    menu.setOnMenuItemClickListener{item->when(item.itemId){
      0->{resize=AspectRatioFrameLayout.RESIZE_MODE_FIT;playerView.resizeMode=resize}
      1->{resize=AspectRatioFrameLayout.RESIZE_MODE_ZOOM;playerView.resizeMode=resize}
      2->{val rates=arrayOf("0.5×","1×","1.25×","1.5×","2×");androidx.appcompat.app.AlertDialog.Builder(this).setTitle("播放速度").setItems(rates){_,index->player?.setPlaybackSpeed(floatArrayOf(.5f,1f,1.25f,1.5f,2f)[index])}.show()}
      3->{player?.repeatMode=if(player?.repeatMode==Player.REPEAT_MODE_ONE)Player.REPEAT_MODE_OFF else Player.REPEAT_MODE_ONE;Toast.makeText(this,if(player?.repeatMode==Player.REPEAT_MODE_ONE)"已开启循环" else "已关闭循环",Toast.LENGTH_SHORT).show()}
      4->external()
    };true};menu.show()
  }
  override fun onSaveInstanceState(outState:Bundle){outState.putLong("position",player?.currentPosition ?: position);outState.putBoolean("play",player?.playWhenReady ?: play);super.onSaveInstanceState(outState)}
  override fun onStop(){player?.let{position=it.currentPosition;play=it.playWhenReady;it.release()};if(::playerView.isInitialized)playerView.player=null;player=null;window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);super.onStop()}
}
