package com.railgunhamster.rhfiles

import android.content.Context
import android.os.Build
import android.view.SurfaceView
import androidx.media3.common.Format
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.exoplayer.DecoderReuseEvaluation
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONObject

// The embedded mobile library is zh-CN. Media3 must use that same language,
// including its speed/track menus, without changing the Activity/system locale.
private fun rhVideoControlContext(context:Context):Context {
  val configuration=android.content.res.Configuration(context.resources.configuration).apply{setLocale(java.util.Locale.SIMPLIFIED_CHINESE)}
  return android.view.ContextThemeWrapper(context.createConfigurationContext(configuration),context.theme)
}

/** Transform our own compositor layer, never the SurfaceView-owned parent or
 * controls. Android 9 and earlier retain the Media3-effect fallback. The input
 * format (not transformed output size) decides whether rotation improves fit.
 */
@UnstableApi
internal open class RhVideoPlayerView(context:Context):PlayerView(rhVideoControlContext(context)) {
  var autoRotate=false;private set
  var videoRotation=0;private set
  private var sourceAspect=0.0
  private var manualRotation:Int?=null
  private var engine:ExoPlayer?=null
  private var formats:AnalyticsListener?=null
  private var pipeline=false
  private var compositor:RhVideoSurface?=null
  @get:androidx.annotation.ChecksSdkIntAtLeast(api=29)
  private val nativeComposition get()=Build.VERSION.SDK_INT>=29
  var onRotationRendererChanged:(()->Unit)?=null
  var onPresentationFailure:((String)->Unit)?=null
  // Must be called before prepare(), as required by ExoPlayer.setVideoEffects.
  // No replay-frame cache or CPU bitmap copies. Rotation changes rebuild the
  // renderer at the same timestamp: live effects can lose a paused frame.
  fun bindRotationEngine(value:ExoPlayer){
    formats?.let{engine?.removeAnalyticsListener(it)}
    engine=value;pipeline=!nativeComposition&&videoRotation!=0
    if(nativeComposition)compositor=RhVideoSurface(value){message->if(engine===value)onPresentationFailure?.invoke(message)}.also{it.rotation(videoRotation);it.fill(resizeMode==AspectRatioFrameLayout.RESIZE_MODE_ZOOM)}
    else if(pipeline)value.setVideoEffects(listOf(rotationEffect(videoRotation)))
    formats=object:AnalyticsListener{
      override fun onVideoInputFormatChanged(eventTime:AnalyticsListener.EventTime,format:Format,decoderReuseEvaluation:DecoderReuseEvaluation?){
        if(engine!==value)return
        sourceFormat(format)
      }
    }.also{value.addAnalyticsListener(it)}
  }
  fun unbindRotationEngine(value:ExoPlayer,keepSource:Boolean=false){
    if(engine!==value)return
    formats?.let{value.removeAnalyticsListener(it)}
    if(nativeComposition){compositor?.detach();compositor=null};engine=null;formats=null;pipeline=false
    if(!keepSource){sourceAspect=0.0;videoRotation=0;manualRotation=null}
  }
  fun setAutoRotation(enabled:Boolean){manualRotation=null;autoRotate=enabled;chooseRotation()}
  internal fun sourceFormat(format:Format){
    val pixelRatio= format.pixelWidthHeightRatio.takeIf{it.isFinite()&&it>0}?:1f
    val ratio=if(format.width>0&&format.height>0)format.width.toDouble()*pixelRatio/format.height else 0.0
    sourceAspect=if(format.rotationDegrees%180!=0&&ratio>0)1/ratio else ratio
    if(nativeComposition)compositor?.source(sourceAspect)
    chooseRotation()
  }
  private fun chooseRotation(){applyRotation(manualRotation?:RhVideoRotation.angle(sourceAspect,width,height,autoRotate));applyContentAspect()}
  override fun onContentAspectRatioChanged(contentFrame:AspectRatioFrameLayout?,aspectRatio:Float){
    // Media3's effect VideoSink currently omits processed VideoSize callbacks
    // (MediaCodecVideoRenderer.configureVideoSink). Size the native surface
    // from the input format + selected rotation, without rotating the View.
    val ratio=if(nativeComposition)0.0 else if(sourceAspect>0){if(videoRotation%180!=0)1/sourceAspect else sourceAspect}else aspectRatio.toDouble()
    super.onContentAspectRatioChanged(contentFrame,ratio.toFloat())
  }
  private fun applyContentAspect(){onContentAspectRatioChanged(findViewById(androidx.media3.ui.R.id.exo_content_frame),sourceAspect.toFloat())}
  fun setManualRotation(angle:Int,fixed:Boolean=false){require(angle in listOf(0,90,180,270));manualRotation=if(fixed)angle else null;applyRotation(angle)}
  private fun applyRotation(angle:Int){
    if(videoRotation==angle)return
    videoRotation=angle
    applyContentAspect()
    if(nativeComposition)compositor?.rotation(angle)else if(engine!=null)onRotationRendererChanged?.invoke()
  }
  fun bindNativeSurface(value:ExoPlayer,surface:SurfaceView?):Boolean{if(!nativeComposition||engine!==value)return false;compositor?.attach(surface);return true}
  override fun setResizeMode(mode:Int){super.setResizeMode(mode);if(nativeComposition)compositor?.fill(mode==AspectRatioFrameLayout.RESIZE_MODE_ZOOM)}
  override fun onSizeChanged(w:Int,h:Int,oldw:Int,oldh:Int){super.onSizeChanged(w,h,oldw,oldh);if(sourceAspect>0&&oldw==0&&oldh==0)chooseRotation()}
  fun rotationState()=JSONObject().put("autoRotate",autoRotate).put("rotation",videoRotation).put("rotationAvailable",RhVideoRotation.available(sourceAspect,width,height,autoRotate)).put("sourceAspect",sourceAspect).put("viewportWidth",width).put("viewportHeight",height).put("surfaceType",videoSurfaceView?.javaClass?.simpleName?:"").put("rotationPipeline",pipeline).put("rotationRenderer",if(nativeComposition)"surface-compositor"else "media3-effects").put("nativeLayerAttached",if(nativeComposition)compositor?.attached==true else false).put("presentationError",(if(nativeComposition)compositor?.error else null)?:JSONObject.NULL).put("outputWidth",engine?.videoSize?.width?:0).put("outputHeight",engine?.videoSize?.height?:0)
  companion object{
    // Media3 uses counterclockwise angles; RHVideo's CSS rotate(90deg) is clockwise.
    fun rotationEffect(angle:Int):ScaleAndRotateTransformation=ScaleAndRotateTransformation.Builder().setRotationDegrees(-angle.toFloat()).build()
  }
}
