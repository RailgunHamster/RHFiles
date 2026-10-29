package com.railgunhamster.rhfiles

import android.view.SurfaceView
import android.view.View
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.common.Format
import androidx.media3.ui.AspectRatioFrameLayout
import org.robolectric.RuntimeEnvironment
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34])
class RhVideoRotationTest {
  @Test fun nativeControlLabelsMatchTheChineseLibraryWithoutChangingTheSystemLocale(){
    val app=RuntimeEnvironment.getApplication()
    val english=app.createConfigurationContext(android.content.res.Configuration(app.resources.configuration).apply{setLocale(java.util.Locale.US)})
    english.setTheme(com.google.android.material.R.style.Theme_MaterialComponents_DayNight_NoActionBar)
    val view=RhVideoPlayerView(english)
    assertEquals("速度",view.context.resources.getString(androidx.media3.ui.R.string.exo_controls_playback_speed))
    val speeds=view.context.resources.getStringArray(androidx.media3.ui.R.array.exo_controls_playback_speeds)
    assertEquals(7,speeds.size);assertEquals("正常",speeds[3]);assertEquals("1.25 倍",speeds[4])
    assertEquals("en",english.resources.configuration.locales[0].language)
  }
  @Test fun onlyRotateWhenFitImprovesByFivePercent(){
    for((w,h,width,height,angle)in listOf(listOf(360,640,1600,900,90),listOf(640,360,1600,900,0),listOf(640,360,900,1600,90),listOf(360,640,900,1600,0),listOf(100,100,1600,900,0),listOf(100,101,101,100,0),listOf(100,106,106,100,90))){assertEquals(angle,RhVideoRotation.angle(w.toDouble()/h,width,height,true));assertEquals(0,RhVideoRotation.angle(w.toDouble()/h,width,height,false))}
    assertEquals(0,RhVideoRotation.angle(Double.NaN,1600,900,true));assertEquals(0,RhVideoRotation.angle(0.0,1600,900,true));assertFalse(RhVideoRotation.available(1.0,1600,900,false));assertTrue(RhVideoRotation.available(1.0,1600,900,true))
  }
  @Test fun explicitSwitchWinsOverLegacyAngles(){
    assertFalse(RhVideoRotation.preference(JSONObject()));assertTrue(RhVideoRotation.preference(JSONObject().put("rotation",90)));assertFalse(RhVideoRotation.preference(JSONObject().put("rotation",90).put("autoRotate",false)))
  }
  @Test fun geometryCorrectsNativeMatrixAndTranslationTogetherRatherThanUsingDisplayRotationEnums(){
    assertEquals(listOf(0,7,3,4),listOf(0,90,180,270).map(RhVideoSurface::bufferTransform))
    for(angle in listOf(0,90,180,270))for((x,y)in listOf(0.0 to 0.0,1.0 to 0.0,0.0 to 1.0,1.0 to 1.0)){
      // Actual native setMatrix layout, independently of the application helper.
      val mapped=when(RhVideoSurface.bufferTransform(angle)){0->x to y;3->-x to -y;4->y to -x;7->-y to x;else->error("Unexpected native flags")}
      val origin=RhVideoSurface.rotationOrigin(angle);val radians=Math.toRadians(angle.toDouble());val c=kotlin.math.cos(radians);val s=kotlin.math.sin(radians)
      assertEquals(.5+c*(x-.5)-s*(y-.5),mapped.first+origin.first,1e-8)
      assertEquals(.5+s*(x-.5)+c*(y-.5),mapped.second+origin.second,1e-8)
    }
    try{RhVideoSurface.bufferTransform(45);fail("Reject non-quarter-turn angles")}catch(expected:IllegalArgumentException){}
  }
  @Test fun rotationEffectPreservesAllPixelsAndDoesNotRotateControlsOrTheNativeSurface(){
    val context=RuntimeEnvironment.getApplication();context.setTheme(com.google.android.material.R.style.Theme_MaterialComponents_DayNight_NoActionBar)
    val view=RhVideoPlayerView(context)
    fun layout(){view.measure(View.MeasureSpec.makeMeasureSpec(1600,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(900,View.MeasureSpec.EXACTLY));view.layout(0,0,1600,900)}
    layout();view.sourceFormat(Format.Builder().setWidth(360).setHeight(640).build());view.setAutoRotation(true);layout();layout()
    assertTrue(view.videoSurfaceView is SurfaceView);assertEquals(90,view.videoRotation);assertEquals(0f,view.rotation,0f);assertEquals(0f,view.videoSurfaceView!!.rotation,0f)
    val content=view.findViewById<AspectRatioFrameLayout>(androidx.media3.ui.R.id.exo_content_frame);assertEquals(1600,content.width);assertEquals(900,content.height)
    val effect=RhVideoPlayerView.rotationEffect(90);assertEquals(270f,effect.rotationDegrees,0f)
    val size=effect.configure(360,640);assertEquals(640,size.width);assertEquals(360,size.height)
    val points=floatArrayOf(-1f,1f);effect.getMatrix(0).mapPoints(points);assertTrue("Top-left must move to top-right, not bottom-left",points[0]>0&&points[1]>0)
    view.setAutoRotation(false);layout();layout();assertEquals(0,view.videoRotation);assertEquals(900,content.height);assertEquals(1600,content.width)
    val fitted=RhVideoSurface.bounds(360.0/640,1600,900,false);assertTrue(fitted.width() in 505..507);assertEquals(900,fitted.height())
  }
  @Test fun stoppedViewDetachesReleasedEngineBeforePreferenceEventsArrive(){
    val context=RuntimeEnvironment.getApplication();context.setTheme(com.google.android.material.R.style.Theme_MaterialComponents_DayNight_NoActionBar)
    val view=RhVideoPlayerView(context);val engine=ExoPlayer.Builder(context).build()
    view.bindRotationEngine(engine);assertFalse(view.rotationState().getBoolean("rotationPipeline"))
    view.unbindRotationEngine(engine);engine.release()
    view.setAutoRotation(true);view.setManualRotation(90)
    assertTrue(view.autoRotate);assertEquals(90,view.videoRotation);assertEquals(0,view.rotationState().getInt("outputWidth"))
  }
  @Test fun compositorFitAndFillAreCenteredAndExtremeSourcesRemainVisible(){
    for(aspect in listOf(360.0/640,640.0/360,1.0))for((width,height)in listOf(1600 to 900,900 to 1600,1000 to 1000))for(fill in listOf(false,true)){
      val rect=RhVideoSurface.bounds(aspect,width,height,fill)
      assertTrue(kotlin.math.abs(rect.left+rect.right-width)<=1);assertTrue(kotlin.math.abs(rect.top+rect.bottom-height)<=1)
      if(fill){assertTrue(rect.width()>=width-1);assertTrue(rect.height()>=height-1)}else{assertTrue(rect.width()<=width+1);assertTrue(rect.height()<=height+1)}
      assertEquals(aspect,rect.width().toDouble()/rect.height(),.003)
    }
    assertEquals(1,RhVideoSurface.bounds(1.0/16384,1600,900,false).width());assertEquals(1,RhVideoSurface.bounds(16384.0,1600,900,false).height())
  }
  @Test @Config(sdk=[28,34]) fun manualCellRotationSurvivesLateFormatAndViewportChangesUntilAutoIsExplicitlyChosen(){
    val context=RuntimeEnvironment.getApplication();context.setTheme(com.google.android.material.R.style.Theme_MaterialComponents_DayNight_NoActionBar)
    val view=RhVideoPlayerView(context)
    for(angle in listOf(90,180,270,0)){
      view.setManualRotation(angle,fixed=true)
      view.sourceFormat(Format.Builder().setWidth(360).setHeight(640).build())
      view.measure(View.MeasureSpec.makeMeasureSpec(1600,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(900,View.MeasureSpec.EXACTLY));view.layout(0,0,1600,900)
      assertEquals("A decoder format event must not silently undo manual rotation",angle,view.videoRotation)
      assertEquals(0f,view.rotation,0f);assertEquals(0f,view.videoSurfaceView!!.rotation,0f)
    }
    view.setManualRotation(180,fixed=true);view.setAutoRotation(true);assertEquals(90,view.videoRotation)
    view.setAutoRotation(false);assertEquals(0,view.videoRotation)
  }
  @Test @Config(sdk=[28]) fun oldAndroidRebindsEffectsBeforePrepareWithoutAFormatDrivenRestartLoop(){
    val context=RuntimeEnvironment.getApplication();context.setTheme(com.google.android.material.R.style.Theme_MaterialComponents_DayNight_NoActionBar)
    val view=RhVideoPlayerView(context);view.setManualRotation(90,fixed=true);var restarts=0;view.onRotationRendererChanged={restarts++}
    val first=ExoPlayer.Builder(context).build();view.bindRotationEngine(first)
    assertTrue(view.rotationState().getBoolean("rotationPipeline"));view.sourceFormat(Format.Builder().setWidth(360).setHeight(640).build());assertEquals(0,restarts)
    view.setManualRotation(270,fixed=true);assertEquals(1,restarts);view.setManualRotation(270,fixed=true);assertEquals(1,restarts)
    view.unbindRotationEngine(first,true);first.release();val next=ExoPlayer.Builder(context).build();view.bindRotationEngine(next)
    view.sourceFormat(Format.Builder().setWidth(360).setHeight(640).build());assertEquals(270,view.videoRotation);assertEquals(1,restarts)
    assertEquals("media3-effects",view.rotationState().getString("rotationRenderer"));assertTrue(view.rotationState().getBoolean("rotationPipeline"))
    view.unbindRotationEngine(next);next.release()
  }
  @Test fun ordinarySingleVideoManualCommandDoesNotReplaceTheNextSourceSmartPolicy(){
    val context=RuntimeEnvironment.getApplication();context.setTheme(com.google.android.material.R.style.Theme_MaterialComponents_DayNight_NoActionBar)
    val view=RhVideoPlayerView(context);view.measure(View.MeasureSpec.makeMeasureSpec(1600,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(900,View.MeasureSpec.EXACTLY));view.layout(0,0,1600,900)
    view.setAutoRotation(true);view.sourceFormat(Format.Builder().setWidth(360).setHeight(640).build());assertEquals(90,view.videoRotation)
    view.setManualRotation(180);assertEquals(180,view.videoRotation)
    view.sourceFormat(Format.Builder().setWidth(640).setHeight(360).build());assertEquals(0,view.videoRotation);assertTrue(view.autoRotate)
  }
}
