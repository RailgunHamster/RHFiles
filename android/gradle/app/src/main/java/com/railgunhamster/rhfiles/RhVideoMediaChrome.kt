package com.railgunhamster.rhfiles

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import java.util.Locale

/** Native presentation only. Owns no player, network request, preference or
 * command dispatch; callers retain the same guarded public action path. */
internal object RhVideoMediaChrome {
  fun dp(context:Context,value:Int)=(context.resources.displayMetrics.density*value+.5f).toInt()
  fun text(context:Context,value:String="",size:Float=13f,muted:Boolean=false)=TextView(context).apply {
    text=value;textSize=size;setTextColor(context.getColor(if(muted)R.color.rhvideo_media_muted else R.color.rhvideo_media_text))
    includeFontPadding=false;gravity=Gravity.CENTER_VERTICAL
  }
  fun button(context:Context,label:String)=Button(context).apply {
    text=label;textSize=13f;isAllCaps=false;letterSpacing=0f;gravity=Gravity.CENTER
    minWidth=0;minimumWidth=0;minHeight=dp(context,48);minimumHeight=dp(context,48)
    includeFontPadding=false;setPadding(dp(context,8),dp(context,4),dp(context,8),dp(context,4))
    backgroundTintList=null;stateListAnimator=null;elevation=0f
    setTextColor(ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled),intArrayOf()),intArrayOf(context.getColor(R.color.rhvideo_media_disabled),context.getColor(R.color.rhvideo_media_text))))
    background=RippleDrawable(ColorStateList.valueOf(0x33a5bfff),GradientDrawable().apply{setColor(0x0dffffff);cornerRadius=dp(context,10).toFloat();setStroke(dp(context,1),0x16ffffff)},null)
  }
  fun readout(context:Context)=text(context,muted=true,size=12f).apply {
    gravity=Gravity.END or Gravity.CENTER_VERTICAL;typeface=Typeface.MONOSPACE
    maxLines=1;ellipsize=TextUtils.TruncateAt.MIDDLE
  }
  fun seekBar(context:Context,maxValue:Int,initial:Int)=SeekBar(context).apply {
    max=maxValue;progress=initial;minimumHeight=dp(context,48)
    progressTintList=ColorStateList.valueOf(context.getColor(R.color.rhvideo_media_accent))
    thumbTintList=progressTintList;progressBackgroundTintList=ColorStateList.valueOf(0x334d6285)
  }
  fun controlBar(context:Context,selector:View,commands:View,pages:View):LinearLayout = object:LinearLayout(context){
    private var wide:Boolean?=null
    init{gravity=Gravity.CENTER_VERTICAL;addView(selector);addView(commands);addView(pages)}
    override fun onMeasure(widthMeasureSpec:Int,heightMeasureSpec:Int){
      val useWide=View.MeasureSpec.getMode(widthMeasureSpec)!=View.MeasureSpec.UNSPECIFIED&&
        View.MeasureSpec.getSize(widthMeasureSpec)>=dp(context,700)*resources.configuration.fontScale.coerceAtLeast(1f)
      if(wide!=useWide){
        wide=useWide;orientation=if(useWide)HORIZONTAL else VERTICAL
        // Keep the same controls, parents, listeners and in-flight gestures;
        // only change measurement, never rebuild controls when rotating.
        for((index,view)in listOf(selector,commands,pages).withIndex())view.layoutParams=
          LinearLayout.LayoutParams(if(useWide)0 else -1,if(index==0)dp(context,48)else -2,if(useWide)listOf(1.1f,2f,1.9f)[index]else 0f)
      }
      super.onMeasure(widthMeasureSpec,heightMeasureSpec)
    }
  }
  fun selector(context:Context,labels:List<String>):ArrayAdapter<String> = object:ArrayAdapter<String>(context,android.R.layout.simple_spinner_item,labels){
    init{setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)}
    private fun style(view:View,position:Int,dropdown:Boolean):View {
      (view as? TextView)?.apply{
        setTextColor(context.getColor(R.color.rhvideo_media_text));textSize=13f;minHeight=dp(context,48)
        setPadding(dp(context,8),dp(context,8),dp(context,8),dp(context,8));maxLines=if(dropdown)2 else 1
        ellipsize=if(dropdown)TextUtils.TruncateAt.END else TextUtils.TruncateAt.MIDDLE;contentDescription=getItem(position)
        if(dropdown)setBackgroundColor(context.getColor(R.color.rhvideo_media_panel))
      };return view
    }
    override fun getView(position:Int,convertView:View?,parent:ViewGroup)=style(super.getView(position,convertView,parent),position,false)
    override fun getDropDownView(position:Int,convertView:View?,parent:ViewGroup)=style(super.getDropDownView(position,convertView,parent),position,true)
  }
  fun time(milliseconds:Long):String {
    if(milliseconds<0)return "--:--"
    val seconds=milliseconds/1000;val hours=seconds/3600;val minutes=seconds%3600/60;val rest=seconds%60
    return if(hours>0)String.format(Locale.ROOT,"%d:%02d:%02d",hours,minutes,rest)else String.format(Locale.ROOT,"%d:%02d",minutes,rest)
  }
  fun speed(value:Double)=if(!value.isFinite()||value<=0)"—"else String.format(Locale.ROOT,"%.2f",value).trimEnd('0').trimEnd('.')+"×"
  fun volume(value:Int,muted:Boolean=false)=if(value !in 0..100)"—"else (if(muted)"静音 · "else "")+"$value%"
}
