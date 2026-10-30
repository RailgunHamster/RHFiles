package com.railgunhamster.rhfiles

import android.app.Activity
import android.graphics.Color
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.view.ViewGroup
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

/** Owned-emulator diagnostic, not a viewer or an alternative RHVideo engine.
 * Same app UID/R8/Media3 as the candidate, but plain PlayerViews and local files.
 * The publisher does not set the compile-time gate; automation alone is not enough. */
@UnstableApi
internal object RhVideoLocalClockProbe {
  private class Cell(val player:ExoPlayer,val view:PlayerView,val path:String,val input:Long){
    var rendered=false;var error:String?=null
    val frames=AtomicLong();val pts=AtomicLong(-1)
  }
  private val sequence=AtomicLong()
  private val cells=mutableListOf<Cell>()
  private var owner=WeakReference<Activity>(null)
  private var layer:LinearLayout?=null
  private var runId:String?=null

  internal fun sources(base:File,directory:String,count:Int):List<File>{
    require(count==1||count==3){"The local clock control accepts exactly one or three inputs"}
    require(directory.length in 1..4096)
    val requested=File(directory)
    require(requested.name.matches(Regex("rhvideo-local-grid-[a-f0-9]{32}")))
    val folder=requested.canonicalFile
    require(folder.isDirectory&&folder.parentFile==base.canonicalFile){"Only the generated app-owned fixture directory is allowed"}
    val names=if(count==1)listOf("portrait.mp4")else listOf("portrait.mp4","portrait.mp4","landscape.mp4")
    return names.map{name->File(folder,name).also{file->
      require(file.canonicalFile.parentFile==folder&&file.isFile&&file.length() in 1..16L*1024*1024){"Invalid local fixture"}
    }}
  }
  fun request(activity:Activity,args:JSONObject):JSONObject{
    check(BuildConfig.RHVIDEO_QA_LOCAL_CLOCK&&NativeAutomation.enabled(activity)){"Local clock is only available in opted-in QA builds"}
    check(android.os.Build.VERSION.SDK_INT>=29&&activity is MainActivity){"Use the owned modern-emulator MainActivity"}
    return when(args.getString("operation")){
      "start"->{check(runId==null){"A local clock control is already active"};start(activity,args)}
      "state"->{check(args.getString("runId")==runId&&owner.get()===activity){"Local clock control changed"};snapshot()}
      "close"->{check(args.getString("runId")==runId&&owner.get()===activity){"Local clock control changed"};val key=runId;close();JSONObject().put("closed",true).put("runId",key)}
      else->error("Unknown local clock control operation")
    }
  }
  private fun start(activity:Activity,args:JSONObject):JSONObject{
    val files=sources(activity.getExternalFilesDir(null)?:error("External app files unavailable"),args.getString("directory"),args.getInt("count"))
    val host=activity.findViewById<ViewGroup>(android.R.id.content)
    val root=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.BLACK)}
    owner=WeakReference(activity);runId=UUID.randomUUID().toString();layer=root
    try{
      host.addView(root,FrameLayout.LayoutParams(-1,-1))
      val rows=if(files.size==1)listOf(1)else listOf(2,1);var index=0
      for(size in rows){
        val row=LinearLayout(activity);root.addView(row,LinearLayout.LayoutParams(-1,0,1f))
        repeat(size){
          val file=files[index++];val engine=ExoPlayer.Builder(activity,DefaultRenderersFactory(activity).setEnableDecoderFallback(true)).build()
          val view=PlayerView(activity).apply{useController=false;player=engine}
          val cell=Cell(engine,view,file.absolutePath,sequence.incrementAndGet());cells.add(cell)
          row.addView(view,LinearLayout.LayoutParams(0,-1,1f))
          engine.addListener(object:Player.Listener{
            override fun onRenderedFirstFrame(){cell.rendered=true}
            override fun onPlayerError(error:PlaybackException){cell.error=error.errorCodeName}
          })
          engine.setVideoFrameMetadataListener{timeUs,_,_,_->cell.pts.set(timeUs/1000);cell.frames.incrementAndGet()}
          engine.volume=.2f;engine.repeatMode=Player.REPEAT_MODE_ONE
          engine.setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(file)));engine.playWhenReady=true;engine.prepare()
        }
      }
      return snapshot()
    }catch(error:Exception){try{close()}catch(cleanup:Exception){error.addSuppressed(cleanup)};throw error}
  }
  private fun snapshot()=JSONObject().put("diagnosticOnly",true).put("runId",runId).put("uid",android.os.Process.myUid())
    .put("cells",JSONArray(cells.map{cell->val p=cell.player;val counters=p.videoDecoderCounters?.also{it.ensureUpdated()};JSONObject()
      .put("inputId",cell.input).put("path",cell.path).put("playing",p.isPlaying).put("playWhenReady",p.playWhenReady)
      .put("playbackState",p.playbackState).put("error",cell.error?:JSONObject.NULL).put("suppressionReason",p.playbackSuppressionReason)
      .put("positionMs",p.currentPosition).put("durationMs",p.duration).put("bufferedPositionMs",p.bufferedPosition)
      .put("rendered",cell.rendered).put("renderedFrames",counters?.renderedOutputBufferCount?:0).put("frameTimeMs",cell.pts.get())
      .put("rate",p.playbackParameters.speed).put("decoderVolume",p.volume*100).put("repeat",p.repeatMode==Player.REPEAT_MODE_ONE)
      .put("surfaceType",cell.view.videoSurfaceView?.javaClass?.simpleName?:JSONObject.NULL)
      .put("tracks",PlayerTracks.state(p.currentTracks,p.trackSelectionParameters))}))
  fun stopped(activity:Activity){if(owner.get()===activity)try{close()}catch(error:Exception){android.util.Log.e("RHVideoLocalClock","QA cleanup failed: ${error.javaClass.simpleName}")}}
  private fun close(){
    val old=cells.toList();cells.clear();val oldLayer=layer;layer=null;runId=null;owner.clear()
    var failure:Exception?=null
    try{old.forEach{cell->try{try{cell.view.player=null}finally{cell.player.release()}}catch(error:Exception){if(failure==null)failure=error else failure?.addSuppressed(error)}}}
    finally{(oldLayer?.parent as? ViewGroup)?.removeView(oldLayer)}
    failure?.let{throw it}
  }
}
