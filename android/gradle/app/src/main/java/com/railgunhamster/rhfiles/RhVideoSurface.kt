package com.railgunhamster.rhfiles

import android.graphics.Rect
import android.graphics.Color
import android.view.Surface
import android.view.SurfaceControl
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import androidx.annotation.RequiresApi
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import kotlin.math.roundToInt

/** App-owned child layer: never mutate the SurfaceView-owned parent control.
 * Public APIs only. Codec buffers go straight to the system compositor; turning
 * an already paused picture does not reopen HTTP, create a decoder or copy pixels.
 * https://developer.android.com/reference/android/view/SurfaceView#getSurfaceControl()
 */
@RequiresApi(29)
@UnstableApi
internal class RhVideoSurface(private val player:ExoPlayer,private val onFailure:(String)->Unit={}){
  private var view:SurfaceView?=null
  private var control:SurfaceControl?=null
  private var placement:SurfaceControl?=null
  private var surface:Surface?=null
  private var aspect=0.0
  private var angle=0
  private var fill=false
  var error:String?=null;private set
  val attached get()=control?.isValid==true&&placement?.isValid==true&&surface?.isValid==true
  private val layout=View.OnLayoutChangeListener{_,_,_,_,_,_,_,_,_->present()}
  private val lifecycle=object:SurfaceHolder.Callback{
    override fun surfaceCreated(holder:SurfaceHolder){backdrop();create()}
    override fun surfaceChanged(holder:SurfaceHolder,format:Int,width:Int,height:Int){backdrop();present()}
    override fun surfaceDestroyed(holder:SurfaceHolder){drop()}
  }
  fun attach(next:SurfaceView?){
    if(view===next){present();return}
    detach();view=next
    next?.let{it.holder.addCallback(lifecycle);it.addOnLayoutChangeListener(layout);if(it.holder.surface.isValid){backdrop();create()}}
  }
  fun source(ratio:Double){aspect=ratio;present()}
  fun rotation(value:Int){angle=value;present()}
  fun fill(value:Boolean){fill=value;present()}
  private fun backdrop(){
    // SurfaceView's BLAST sync must receive its first parent buffer before it
    // exposes child layers through the window. Only a black resize/creation
    // buffer; decoded frames still go straight to our separate child Surface.
    val holder=view?.holder?:return
    try{val canvas=holder.lockCanvas()?:return;try{canvas.drawColor(Color.BLACK)}finally{holder.unlockCanvasAndPost(canvas)}}catch(failure:Exception){report("无法初始化视频背景：${failure.message}")}
  }
  private fun create(){
    val target=view?:return;val parent=target.surfaceControl?:return
    if(control!=null)return
    try{
      // Surface(SurfaceControl) owns a BLAST buffer child which normalizes codec
      // buffers to the builder's default size. Keep that space explicitly 1x1.
      // Rotate this unit square, then scale/place a separate ancestor. Applying
      // a source-pixel scale to a unit layer shrinks the picture to a few pixels;
      // setBufferTransform on its empty parent does not rotate the codec child.
      val frame=SurfaceControl.Builder().setName("RHFiles RHVideo placement").setParent(parent).setBufferSize(1,1).build()
      placement=frame
      val layer=SurfaceControl.Builder().setName("RHFiles RHVideo").setParent(frame).setBufferSize(1,1).setOpaque(true).build()
      control=layer;val output=Surface(layer);surface=output
      SurfaceControl.Transaction().use{it.setLayer(frame,1).setVisibility(frame,true).setVisibility(layer,true).apply()}
      player.setVideoSurface(output);error=null;present()
    }catch(failure:Exception){drop();report("无法创建原生视频图层：${failure.message}")}
  }
  private fun present(){
    val target=view?:return;val layer=control?.takeIf{it.isValid}?:return;val frame=placement?.takeIf{it.isValid}?:return
    if(target.width<=0||target.height<=0||!aspect.isFinite()||aspect<=0)return
    val quarter=angle%180!=0;val ratio=if(quarter)1/aspect else aspect
    val destination=bounds(ratio,target.width,target.height,fill)
    try{SurfaceControl.Transaction().use{transaction->
      // Public API 29+, including its matrix transform of descendant buffers.
      // Only a unit-square rotation uses setGeometry: source-pixel destination
      // scaling in this legacy API is incorrect for non-square quarter turns.
      @Suppress("DEPRECATION")
      transaction.setGeometry(layer,Rect(0,0,1,1),Rect(0,0,1,1),bufferTransform(angle))
      val origin=rotationOrigin(angle);transaction.setPosition(layer,origin.first,origin.second)
      transaction.setScale(frame,destination.width().toFloat(),destination.height().toFloat()).setPosition(frame,destination.left.toFloat(),destination.top.toFloat())
      transaction.apply()
    };error=null}catch(failure:Exception){report("无法调整视频画面：${failure.message}")}
  }
  private fun report(message:String){if(error!=message){error=message;onFailure(message)}}
  private fun drop(){
    val output=surface;surface=null;output?.let{runCatching{player.clearVideoSurface(it)};it.release()}
    val layers=listOfNotNull(control,placement);control=null;placement=null
    for(layer in layers){runCatching{if(layer.isValid)SurfaceControl.Transaction().use{it.setVisibility(layer,false).reparent(layer,null).apply()}};runCatching{layer.release()}}
  }
  fun detach(){view?.let{it.holder.removeCallback(lifecycle);it.removeOnLayoutChangeListener(layout)};drop();view=null}
  companion object{
    // setGeometry's JNI passes its integer straight to native setGeometry,
    // which consumes ANATIVEWINDOW_TRANSFORM_* flags, not Surface.ROTATION_*.
    // Passing ROTATION_90 (1) horizontally mirrors instead of rotating. The
    // native helper's off-diagonal matrix terms are transposed relative to its
    // translation: flag 4 produced [0,+1;-1,0] at (1,0), entirely off screen.
    // Use the opposite quarter-turn flag and explicitly place the unit square
    // in positive coordinates. Acceptance checks actual pixels, not the enum's
    // name or View.rotation. These native flags are available on API 29-32
    // too, before public SurfaceControl.BUFFER_TRANSFORM_* names existed.
    // frameworks/base/core/jni/android_view_SurfaceControl.cpp nativeSetGeometry
    // frameworks/native/libs/gui/SurfaceComposerClient.cpp Transaction::setGeometry
    fun bufferTransform(angle:Int):Int=when(angle){0->0;90->7;180->3;270->4;else->throw IllegalArgumentException("旋转角度无效")}
    fun rotationOrigin(angle:Int):Pair<Float,Float> = when(angle){0->0f to 0f;90->1f to 0f;180->1f to 1f;270->0f to 1f;else->throw IllegalArgumentException("旋转角度无效")}
    fun bounds(aspect:Double,width:Int,height:Int,fill:Boolean):Rect{
      require(aspect.isFinite()&&aspect>0&&width>0&&height>0)
      val wider=width.toDouble()/height>aspect
      val h=if(wider==fill)width/aspect else height.toDouble();val w=h*aspect
      val left=((width-w)/2).roundToInt();val top=((height-h)/2).roundToInt()
      return Rect(left,top,left+w.roundToInt().coerceAtLeast(1),top+h.roundToInt().coerceAtLeast(1))
    }
  }
}
