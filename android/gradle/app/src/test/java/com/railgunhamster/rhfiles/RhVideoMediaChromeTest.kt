package com.railgunhamster.rhfiles

import android.content.Context
import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.content.res.Configuration
import android.os.Looper
import android.os.SystemClock
import android.view.ContextThemeWrapper
import android.view.MotionEvent
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatDelegate
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.pow

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28],qualifiers="w411dp-h891dp-420dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RhVideoMediaChromeTest {
  private fun context():Context=ContextThemeWrapper(RuntimeEnvironment.getApplication(),R.style.Theme_RHFiles_MediaViewer)
  private fun color(context:Context,attribute:Int):Int=context.obtainStyledAttributes(intArrayOf(attribute)).let{try{it.getColor(0,Color.MAGENTA)}finally{it.recycle()}}
  @Test fun nativeMediaThemeIsScopedDarkAndDoesNotChangeTheFileBrowserNightMode(){
    val application=RuntimeEnvironment.getApplication();val mode=AppCompatDelegate.getDefaultNightMode();val configuration=application.resources.configuration.uiMode;val c=context()
    assertEquals(c.getColor(R.color.rhvideo_media_panel),color(c,android.R.attr.colorBackground))
    assertEquals(c.getColor(R.color.rhvideo_media_accent),color(c,android.R.attr.colorAccent))
    assertEquals(c.getColor(R.color.rhvideo_media_text),color(c,android.R.attr.textColorPrimary))
    RhVideoMediaChrome.button(c,"播放");assertEquals(mode,AppCompatDelegate.getDefaultNightMode());assertEquals(configuration,application.resources.configuration.uiMode)
  }
  @Test fun actionButtonsKeepTheirTextAccessibleTouchSizeAndDisabledFeedback(){
    val c=context();val button=RhVideoMediaChrome.button(c,"Play");assertEquals("Play",button.text.toString());assertTrue(button.minimumHeight>=RhVideoMediaChrome.dp(c,48));assertEquals(0f,button.elevation,0f)
    assertEquals(c.getColor(R.color.rhvideo_media_text),button.currentTextColor);button.isEnabled=false;assertEquals(c.getColor(R.color.rhvideo_media_disabled),button.currentTextColor)
    assertNull(button.backgroundTintList);assertNotNull(button.background)
  }
  @Test fun nativePointerClickDispatchesOnceAndDisabledButtonDoesNotDispatch(){
    val c=context();val button=RhVideoMediaChrome.button(c,"暂停");var calls=0;button.setOnClickListener{calls++}
    val controller=Robolectric.buildActivity(Activity::class.java).setup();controller.get().setContentView(button)
    val width=RhVideoMediaChrome.dp(c,80);val height=RhVideoMediaChrome.dp(c,48);button.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));button.layout(0,0,width,height)
    fun tap(){val time=SystemClock.uptimeMillis();for(action in listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP)){val event=MotionEvent.obtain(time,time+if(action==MotionEvent.ACTION_UP)40 else 0,action,width/2f,height/2f,0);try{button.dispatchTouchEvent(event)}finally{event.recycle()}};shadowOf(Looper.getMainLooper()).idle()}
    try{tap();assertEquals(1,calls);button.isEnabled=false;tap();assertEquals(1,calls)}finally{controller.pause().stop().destroy()}
  }
  @Test fun slidersAndReadoutsHaveExplicitNativeAppearanceWithoutChangingTheValue(){
    val c=context();val slider=RhVideoMediaChrome.seekBar(c,400,125);assertEquals(400,slider.max);assertEquals(125,slider.progress);assertEquals(c.getColor(R.color.rhvideo_media_accent),slider.thumbTintList!!.defaultColor)
    val label=RhVideoMediaChrome.readout(c);label.text=RhVideoMediaChrome.speed(1.25);assertEquals("1.25×",label.text.toString());assertEquals(c.getColor(R.color.rhvideo_media_muted),label.currentTextColor)
  }
  @Test fun targetSelectorPreservesTheFullFilenameForSelectionAndAccessibility(){
    val c=context();val name="2 · 很长的中文文件名与 Unicode 🎬 "+"项目".repeat(80)+".mp4";val adapter=RhVideoMediaChrome.selector(c,listOf("全部视频",name));val parent=LinearLayout(c)
    val selected=adapter.getView(1,null,parent) as TextView;val popup=adapter.getDropDownView(1,null,parent) as TextView
    assertEquals(name,selected.text.toString());assertEquals(name,selected.contentDescription.toString());assertEquals(name,popup.text.toString());assertEquals(1,selected.maxLines);assertEquals(2,popup.maxLines)
    assertEquals(c.getColor(R.color.rhvideo_media_text),selected.currentTextColor)
  }
  @Test fun readoutsKeepUnknownDurationDistinctAndDoNotWrapHoursOrRoundAwaySpeed(){
    for((value,expected)in listOf(-1L to "--:--",0L to "0:00",59999L to "0:59",60000L to "1:00",3661000L to "1:01:01",360000000L to "100:00:00"))assertEquals(expected,RhVideoMediaChrome.time(value))
    assertEquals("1×",RhVideoMediaChrome.speed(1.0));assertEquals("1.25×",RhVideoMediaChrome.speed(1.25));assertEquals("0.25×",RhVideoMediaChrome.speed(.25));assertEquals("—",RhVideoMediaChrome.speed(Double.NaN))
    assertEquals("37%",RhVideoMediaChrome.volume(37));assertEquals("静音 · 37%",RhVideoMediaChrome.volume(37,true));assertEquals("0%",RhVideoMediaChrome.volume(0));assertEquals("—",RhVideoMediaChrome.volume(-1))
  }
  @Test fun normalTextAndReadoutColorsMeetReadableContrastOnThePanel(){
    val c=context();fun luminance(color:Int):Double{fun channel(value:Int):Double{val s=value/255.0;return if(s<=.04045)s/12.92 else ((s+.055)/1.055).pow(2.4)};return .2126*channel(Color.red(color))+.7152*channel(Color.green(color))+.0722*channel(Color.blue(color))}
    val background=luminance(c.getColor(R.color.rhvideo_media_panel));for(id in listOf(R.color.rhvideo_media_text,R.color.rhvideo_media_muted,R.color.rhvideo_media_accent))assertTrue((luminance(c.getColor(id))+.05)/(background+.05)>=4.5)
  }
  private fun bar(c:Context):LinearLayout{
    val selector=Spinner(c).apply{adapter=RhVideoMediaChrome.selector(c,listOf("全部视频","1 · 测试视频.mp4"));setSelection(1)}
    fun buttons(labels:List<String>)=LinearLayout(c).apply{for(label in labels)addView(RhVideoMediaChrome.button(c,label),LinearLayout.LayoutParams(0,-2,1f))}
    return RhVideoMediaChrome.controlBar(c,selector,buttons(listOf("播放","暂停","静音","展开","网格")),buttons(listOf("上一组","1 / 8","下一组","调节")))
  }
  private fun measure(view:View,c:Context,width:Int){view.measure(View.MeasureSpec.makeMeasureSpec(RhVideoMediaChrome.dp(c,width),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(RhVideoMediaChrome.dp(c,900),View.MeasureSpec.AT_MOST));view.layout(0,0,view.measuredWidth,view.measuredHeight)}
  @Test fun wideControlBarUsesOneRowAndRetainsTheSameControlsSelectionAndListeners(){
    val c=context();val bar=bar(c);val selector=bar.getChildAt(0) as Spinner;val commands=bar.getChildAt(1) as LinearLayout;val button=commands.getChildAt(0);var clicks=0;button.setOnClickListener{clicks++}
    measure(bar,c,387);val narrowHeight=bar.height;assertEquals(LinearLayout.VERTICAL,bar.orientation);assertTrue(narrowHeight>=RhVideoMediaChrome.dp(c,144))
    measure(bar,c,860);assertEquals(LinearLayout.HORIZONTAL,bar.orientation);assertTrue(bar.height<=RhVideoMediaChrome.dp(c,56));assertTrue(narrowHeight>=bar.height*2)
    for(i in 0 until bar.childCount){val child=bar.getChildAt(i);assertTrue(child.width>0);assertTrue(child.right<=bar.width);assertSame(bar,child.parent)}
    assertSame(selector,bar.getChildAt(0));assertSame(button,commands.getChildAt(0));assertEquals(1,selector.selectedItemPosition);button.performClick();assertEquals(1,clicks)
    measure(bar,c,387);assertEquals(LinearLayout.VERTICAL,bar.orientation);assertSame(button,commands.getChildAt(0));assertEquals(1,selector.selectedItemPosition)
  }
  @Test fun largeFontKeepsTheVerticalControlBarInsteadOfCompressingLabelsIntoOneRow(){
    val base=context();val configuration=Configuration(base.resources.configuration).apply{fontScale=2f};val c=ContextThemeWrapper(base.createConfigurationContext(configuration),R.style.Theme_RHFiles_MediaViewer);val bar=bar(c)
    measure(bar,c,860);assertEquals(LinearLayout.VERTICAL,bar.orientation);assertTrue(bar.height>=RhVideoMediaChrome.dp(c,144))
  }
  @Test fun actualNativeControlsRasterizeWithTextAndTracksRatherThanAnEmptyPlaceholder(){
    // A controls-only native layout, not a screenshot of decoded video and not
    // proof of the separate emulator/lifecycle acceptance gates.
    val c=context();fun dp(value:Int)=RhVideoMediaChrome.dp(c,value)
    val body=LinearLayout(c).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(8),dp(12),dp(8));setBackgroundColor(c.getColor(R.color.rhvideo_media_panel))}
    val selector=Spinner(c).apply{adapter=RhVideoMediaChrome.selector(c,listOf("全部视频","1 · 生成的界面测试.mp4"))}
    val buttons=LinearLayout(c);for(label in listOf("播放","暂停","静音","展开","网格"))buttons.addView(RhVideoMediaChrome.button(c,label),LinearLayout.LayoutParams(0,-2,1f).apply{setMargins(dp(2),dp(2),dp(2),dp(2))})
    val pages=LinearLayout(c).apply{gravity=android.view.Gravity.CENTER_VERTICAL};pages.addView(RhVideoMediaChrome.button(c,"上一组").apply{isEnabled=false},LinearLayout.LayoutParams(0,-2,1f));pages.addView(RhVideoMediaChrome.text(c,"1 / 8",muted=true).apply{setPadding(dp(8),0,dp(8),0)});for(label in listOf("下一组","调节"))pages.addView(RhVideoMediaChrome.button(c,label),LinearLayout.LayoutParams(0,-2,1f));body.addView(RhVideoMediaChrome.controlBar(c,selector,buttons,pages))
    for((label,max,progress,value)in listOf(Row("分组",1000,0,"1 / 8"),Row("进度",1000,380,"1:23 / 3:40"),Row("音量",100,37,"37%"),Row("速度",400,125,"1.25×"))){val row=LinearLayout(c).apply{gravity=android.view.Gravity.CENTER_VERTICAL};row.addView(RhVideoMediaChrome.text(c,label,12f,true),LinearLayout.LayoutParams(dp(34),-2));row.addView(RhVideoMediaChrome.seekBar(c,max,progress),LinearLayout.LayoutParams(0,dp(48),1f));row.addView(RhVideoMediaChrome.readout(c).apply{text=value},LinearLayout.LayoutParams(dp(96),dp(48)));body.addView(row)}
    body.measure(View.MeasureSpec.makeMeasureSpec(dp(387),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(dp(891),View.MeasureSpec.AT_MOST));body.layout(0,0,body.measuredWidth,body.measuredHeight)
    val bitmap=Bitmap.createBitmap(body.width,body.height,Bitmap.Config.ARGB_8888)
    try{body.draw(Canvas(bitmap));assertEquals(c.getColor(R.color.rhvideo_media_panel),bitmap.getPixel(0,0));val colors=HashSet<Int>();for(y in 0 until bitmap.height step 3)for(x in 0 until bitmap.width step 3)colors.add(bitmap.getPixel(x,y));assertTrue("Ripple shapes and seek tracks must actually render",colors.size>30)
      val first=buttons.getChildAt(0);val bounds=Rect(0,0,first.width,first.height);body.offsetDescendantRectToMyCoords(first,bounds);var ink=0;for(y in bounds.top+dp(6) until bounds.bottom-dp(6) step 2)for(x in bounds.left+dp(6) until bounds.right-dp(6) step 2){val pixel=bitmap.getPixel(x,y);if(Color.red(pixel)>180&&Color.green(pixel)>180&&Color.blue(pixel)>180)ink++};assertTrue("Native button text must rasterize inside its own bounds, not just colored control shapes",ink>20)
      System.getenv("RHFILES_QA_MEDIA_PREVIEW")?.let{directory->val folder=File(directory);folder.mkdirs();File(folder,"rhvideo-native-controls-preview.png").outputStream().use{assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,it))}}
    }finally{bitmap.recycle()}
  }
  private data class Row(val label:String,val max:Int,val progress:Int,val value:String)
}
