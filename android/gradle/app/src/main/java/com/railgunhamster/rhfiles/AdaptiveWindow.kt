package com.railgunhamster.rhfiles

import android.app.Activity
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import androidx.window.layout.FoldingFeature
import org.json.JSONObject

class AdaptiveWindow(private val activity:Activity,private val web:()->WebView?){
  private val tracker=WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(activity))
  private var features=listOf<FoldingFeature>()
  private val listener=Consumer<WindowLayoutInfo>{info->features=info.displayFeatures.filterIsInstance<FoldingFeature>();publish()}
  fun start(){tracker.addWindowLayoutInfoListener(activity,ContextCompat.getMainExecutor(activity),listener)}
  fun stop(){tracker.removeWindowLayoutInfoListener(listener)}
  fun current():JSONObject {
    val view=web()?:return JSONObject();if(view.width<=0||view.height<=0)return JSONObject()
    val origin=IntArray(2);view.getLocationInWindow(origin)
    val result=JSONObject();val bars=ViewCompat.getRootWindowInsets(view)?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    if(bars!=null){val decor=activity.window.decorView;result.put("insets",JSONObject()
      .put("left",((bars.left-origin[0]).coerceAtLeast(0).toDouble()/view.width).coerceIn(0.0,1.0))
      .put("top",((bars.top-origin[1]).coerceAtLeast(0).toDouble()/view.height).coerceIn(0.0,1.0))
      .put("right",((bars.right-(decor.width-origin[0]-view.width)).coerceAtLeast(0).toDouble()/view.width).coerceIn(0.0,1.0))
      .put("bottom",((bars.bottom-(decor.height-origin[1]-view.height)).coerceAtLeast(0).toDouble()/view.height).coerceIn(0.0,1.0)))}
    val fold=features.firstOrNull{it.isSeparating||it.occlusionType==FoldingFeature.OcclusionType.FULL}
    if(fold!=null){val b=fold.bounds;result.put("hinge",JSONObject().put("separating",true).put("orientation",if(fold.orientation==FoldingFeature.Orientation.VERTICAL)"vertical" else "horizontal")
      .put("bounds",JSONObject().put("left",((b.left-origin[0]).toDouble()/view.width).coerceIn(0.0,1.0)).put("right",((b.right-origin[0]).toDouble()/view.width).coerceIn(0.0,1.0))
        .put("top",((b.top-origin[1]).toDouble()/view.height).coerceIn(0.0,1.0)).put("bottom",((b.bottom-origin[1]).toDouble()/view.height).coerceIn(0.0,1.0))))}
    return result
  }
  fun publish(){web()?.evaluateJavascript("window.dispatchEvent(new CustomEvent('rhfiles-window-layout',{detail:${current()}}))",null)}
}
