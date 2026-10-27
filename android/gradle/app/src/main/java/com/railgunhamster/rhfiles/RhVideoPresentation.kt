package com.railgunhamster.rhfiles

import android.view.View
import android.view.TextureView
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import org.json.JSONObject

/** A bounded native video plane inside the packaged slideshow, not another activity/web player. */
@UnstableApi
internal class RhVideoPresentation(private val activity:AppCompatActivity,private val root:FrameLayout,private val web:WebView){
  private var engine:ExoPlayer?=null
  private var view:FrameLayout?=null
  private var texture:TextureView?=null
  private var videoWidth=1f
  private var videoHeight=1f
  private var rendered=false
  private var failure:String?=null
  private var title=""
  fun open(args:JSONObject):JSONObject{
    close()
    val playback=RhVideoClient.get(activity).playback(args,track=false)
    title=args.optString("title","视频")
    val storage=NativeStorage(activity.applicationContext)
    val player=ExoPlayer.Builder(activity,DefaultRenderersFactory(activity).setEnableDecoderFallback(true))
      .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(activity,DataSource.Factory{MediaRoutingDataSource(activity,storage.remote)}))).build()
    val surface=FrameLayout(activity).apply{setBackgroundColor(android.graphics.Color.BLACK);alpha=0f;contentDescription=title}
    val output=TextureView(activity);surface.addView(output,FrameLayout.LayoutParams(-1,-1));texture=output
    engine=player;view=surface;root.addView(surface,FrameLayout.LayoutParams(1,1));player.setVideoTextureView(output)
    output.addOnLayoutChangeListener{_,_,_,_,_,_,_,_,_->resize()}
    player.addListener(object:Player.Listener{
      override fun onRenderedFirstFrame(){rendered=true}
      override fun onVideoSizeChanged(size:VideoSize){videoWidth=(size.width*size.pixelWidthHeightRatio).coerceAtLeast(1f);videoHeight=size.height.coerceAtLeast(1).toFloat();resize()}
      override fun onPlayerError(error:PlaybackException){failure=error.errorCodeName+": "+(error.cause?.message?:error.message?:"")}
    })
    RhVideoVolume.track(player,0f);player.setMediaItem(MediaItem.fromUri(playback.path),playback.position);player.prepare();player.play()
    return state()
  }
  private fun resize(){val t=texture?:return;if(t.width<1||t.height<1)return;val scale=minOf(t.width/videoWidth,t.height/videoHeight);t.setTransform(android.graphics.Matrix().apply{setScale(scale*videoWidth/t.width,scale*videoHeight/t.height,t.width/2f,t.height/2f)})}
  fun bounds(args:JSONObject):JSONObject{
    val surface=view?:error("原生放映没有打开")
    val names=listOf("x","y","width","height");val values=names.map{args.getDouble(it).also{n->require(n.isFinite()&&n in 0.0..100000.0)}}
    val viewport=args.optDouble("viewportWidth",web.width/activity.resources.displayMetrics.density.toDouble());require(viewport.isFinite()&&viewport>0)
    val scale=web.width/viewport
    val x=(values[0]*scale).toInt().coerceIn(0,web.width);val y=(values[1]*scale).toInt().coerceIn(0,web.height)
    surface.layoutParams=FrameLayout.LayoutParams((values[2]*scale).toInt().coerceIn(1,(web.width-x).coerceAtLeast(1)),(values[3]*scale).toInt().coerceIn(1,(web.height-y).coerceAtLeast(1))).apply{leftMargin=x;topMargin=y}
    surface.alpha=args.optDouble("opacity",1.0).coerceIn(0.0,1.0).toFloat();surface.visibility=if(args.optBoolean("visible",true))View.VISIBLE else View.INVISIBLE
    return JSONObject().put("visible",surface.visibility==View.VISIBLE)
  }
  fun state():JSONObject{
    val player=engine?:return JSONObject().put("opened",false)
    return JSONObject().put("opened",true).put("title",title).put("nativeSurface",true).put("renderedFrames",if(rendered)1 else 0)
      .put("positionMs",player.currentPosition).put("durationMs",if(player.duration==C.TIME_UNSET)0 else player.duration)
      .put("playing",player.isPlaying).put("state",if(failure!=null)"error" else if(player.playbackState==Player.STATE_ENDED)"ended" else if(player.isPlaying)"playing"else"paused")
      .put("error",failure?:JSONObject.NULL)
      .put("volume",RhVideoVolume.local(player)*100).put("decoderVolume",player.volume*100)
  }
  fun control(args:JSONObject):JSONObject{
    val p=engine?:return state();val value=args.optDouble("value",0.0);require(value.isFinite())
    when(args.getString("command")){
      "pause"->p.pause();"resume"->p.play()
      "seek"->{require(value>=0&&p.duration!=C.TIME_UNSET&&value<=p.duration);p.seekTo(value.toLong())}
      "volume"->{require(value in 0.0..100.0);RhVideoVolume.setLocal(p,(value/100).toFloat())}
      "rate"->{require(value in .25..4.0);p.setPlaybackSpeed(value.toFloat())}
      else->error("未知放映操作")
    };return state()
  }
  fun pause(){engine?.pause()}
  fun close():JSONObject{view?.let{root.removeView(it)};engine?.clearVideoTextureView(texture);engine?.let{RhVideoVolume.untrack(it);it.release()};view=null;texture=null;engine=null;rendered=false;failure=null;return JSONObject().put("closed",true)}
}
