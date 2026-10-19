package com.railgunhamster.rhfiles

import android.app.Activity
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowMetricsCalculator
import org.json.JSONObject

class AdaptiveWindow(private val activity:Activity,private val web:()->WebView?){
  private val tracker=WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(activity))
  private var features=listOf<FoldingFeature>()
  private var lastDisplayProfile:String?=null
  private fun profile(value:JSONObject)="${value.optString("screenKey")}:${value.optString("orientation")}"
  private val displays=activity.getSystemService(DisplayManager::class.java)
  @Suppress("DEPRECATION")
  private fun display()=if(Build.VERSION.SDK_INT>=30)activity.display else activity.windowManager.defaultDisplay
  private val displayListener=object:DisplayManager.DisplayListener {
    override fun onDisplayAdded(id:Int){}
    override fun onDisplayRemoved(id:Int){}
    override fun onDisplayChanged(id:Int){
      // Refresh-rate/brightness updates are display events too. Do not reset
      // pane touch gestures unless the screen/orientation really changed.
      if(display()?.displayId==id&&profile(current())!=lastDisplayProfile)publish()
    }
  }
  private val listener=Consumer<WindowLayoutInfo>{info->features=info.displayFeatures.filterIsInstance<FoldingFeature>();publish()}
  fun start(){tracker.addWindowLayoutInfoListener(activity,ContextCompat.getMainExecutor(activity),listener);displays.registerDisplayListener(displayListener,Handler(Looper.getMainLooper()))}
  fun stop(){tracker.removeWindowLayoutInfoListener(listener);displays.unregisterDisplayListener(displayListener)}
  fun current(animatedInsets:WindowInsetsCompat?=null):JSONObject {
    val result=JSONObject()
    // Maximum bounds identify the active screen, not the resizable app window.
    // Normalize rotation; IME/system bars/split-window sizes must not change it.
    val bounds=WindowMetricsCalculator.getOrCreate().computeMaximumWindowMetrics(activity).bounds
    ScreenLayoutProfile.key(bounds.width(),bounds.height())?.let{result.put("screenKey",it)}
    ScreenLayoutProfile.orientation(bounds.width(),bounds.height(),display()?.rotation?:0)?.let{result.put("orientation",it)}
    val view=web()?:return result;if(view.width<=0||view.height<=0)return result
    val origin=IntArray(2);view.getLocationInWindow(origin)
    val rootInsets=animatedInsets?:ViewCompat.getRootWindowInsets(view)
    val bars=rootInsets?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    val ime=rootInsets?.getInsets(WindowInsetsCompat.Type.ime())?.bottom?:0
    val windowHeight=WindowMetricsCalculator.getOrCreate().computeCurrentWindowMetrics(activity).bounds.height()
    if(bars!=null){val decor=activity.window.decorView;result.put("insets",JSONObject()
      .put("left",((bars.left-origin[0]).coerceAtLeast(0).toDouble()/view.width).coerceIn(0.0,1.0))
      .put("top",((bars.top-origin[1]).coerceAtLeast(0).toDouble()/view.height).coerceIn(0.0,1.0))
      .put("right",((bars.right-(decor.width-origin[0]-view.width)).coerceAtLeast(0).toDouble()/view.width).coerceIn(0.0,1.0))
      .put("bottom",ViewportInsets.bottom(windowHeight,origin[1],view.height,bars.bottom,ime).toDouble()/view.height))}
    val fold=features.firstOrNull{it.isSeparating||it.occlusionType==FoldingFeature.OcclusionType.FULL}
    if(fold!=null){val b=fold.bounds;result.put("hinge",JSONObject().put("separating",true).put("orientation",if(fold.orientation==FoldingFeature.Orientation.VERTICAL)"vertical" else "horizontal")
      .put("bounds",JSONObject().put("left",((b.left-origin[0]).toDouble()/view.width).coerceIn(0.0,1.0)).put("right",((b.right-origin[0]).toDouble()/view.width).coerceIn(0.0,1.0))
        .put("top",((b.top-origin[1]).toDouble()/view.height).coerceIn(0.0,1.0)).put("bottom",((b.bottom-origin[1]).toDouble()/view.height).coerceIn(0.0,1.0))))}
    return result
  }
  fun publish(insets:WindowInsetsCompat?=null){val value=current(insets);lastDisplayProfile=profile(value);web()?.evaluateJavascript("window.dispatchEvent(new CustomEvent('rhfiles-window-layout',{detail:$value}))",null)}
}
