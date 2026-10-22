package com.railgunhamster.rhfiles

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.view.inspector.WindowInspector
import android.webkit.WebView
import android.widget.*
import androidx.activity.ComponentActivity
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.WeakHashMap
import java.io.File
import java.io.RandomAccessFile

/** In-process native UI adapter. No exported component, socket, reflection or
 * coordinate injection. System permission/install/chooser windows are excluded. */
internal object NativeAutomation {
  private var installed=false
  private var current=WeakReference<Activity>(null)
  private val ids=WeakHashMap<View,String>()
  private val tokens=WeakHashMap<View,String>()
  private val views=linkedMapOf<String,WeakReference<View>>()
  private const val CHANGED="com.railgunhamster.rhfiles.AUTOMATION_CHANGED"
  private fun setting(context:Context)=File(context.noBackupFilesDir,"automation-v1")
  // A one-byte flag is read afresh in both processes. SharedPreferences caches
  // would leave the reader's debugger enabled after disabling it in the manager.
  fun enabled(context:Context)=try{setting(context).inputStream().use{it.read()==1}}catch(_:Exception){false}
  fun debugging(context:Context){WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG||enabled(context))}
  fun install(activity:Activity){
    current=WeakReference(activity)
    if(installed)return
    installed=true
    val app=activity.applicationContext
    val receiver=object:BroadcastReceiver(){override fun onReceive(c:Context?,i:Intent?){debugging(app)}}
    if(Build.VERSION.SDK_INT>=33)app.registerReceiver(receiver,IntentFilter(CHANGED),Context.RECEIVER_NOT_EXPORTED)else app.registerReceiver(receiver,IntentFilter(CHANGED))
    activity.application.registerActivityLifecycleCallbacks(object:Application.ActivityLifecycleCallbacks {
      override fun onActivityResumed(a:Activity){current=WeakReference(a)}
      override fun onActivityDestroyed(a:Activity){if(current.get()===a)current.clear()}
      override fun onActivityCreated(a:Activity,b:Bundle?){}
      override fun onActivityStarted(a:Activity){}
      override fun onActivityPaused(a:Activity){}
      override fun onActivityStopped(a:Activity){}
      override fun onActivitySaveInstanceState(a:Activity,b:Bundle){}
    })
  }
  fun status(context:Context)=JSONObject().put("enabled",enabled(context)).put("debugBuild",BuildConfig.DEBUG).put("transport","adb-local").put("nativeWindows",if(Build.VERSION.SDK_INT>=29)"process"else "activity").put("activity",current.get()?.javaClass?.simpleName?:JSONObject.NULL)
  fun setEnabled(context:Context,value:Boolean):JSONObject {
    RandomAccessFile(setting(context),"rw").use{file->file.writeByte(if(value)1 else 0);file.setLength(1);file.fd.sync()}
    check(enabled(context)==value){"自动化设置未能持久保存"}
    debugging(context);context.sendBroadcast(Intent(CHANGED).setPackage(context.packageName));return status(context)
  }
  private fun id(view:View)=ids.getOrPut(view){UUID.randomUUID().toString().also{views[it]=WeakReference(view)}}
  private fun label(view:View)=(view.contentDescription?.toString()?:if(view is EditText)view.hint?.toString()?:"" else (view as? TextView)?.text?.toString()?:"").take(240)
  private fun secret(view:View):Boolean {if(view !is EditText)return false;val type=view.inputType and InputType.TYPE_MASK_CLASS;val variation=view.inputType and InputType.TYPE_MASK_VARIATION;return type==InputType.TYPE_CLASS_TEXT&&variation in setOf(InputType.TYPE_TEXT_VARIATION_PASSWORD,InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD)||type==InputType.TYPE_CLASS_NUMBER&&variation==InputType.TYPE_NUMBER_VARIATION_PASSWORD}
  private fun danger(view:View)=Regex("永久删除|清空|删除所有|permanently|empty all",RegexOption.IGNORE_CASE).containsMatchIn(label(view))
  private fun roots():List<View>{val activity=current.get()?:error("当前没有原生界面");check(!activity.isFinishing&&!activity.isDestroyed){"原生界面已关闭"};return if(Build.VERSION.SDK_INT>=29)WindowInspector.getGlobalWindowViews().filter{it.isAttachedToWindow}else listOf(activity.window.decorView)}
  private fun visible(view:View)=view.isShown&&view.getGlobalVisibleRect(Rect())
  private fun item(view:View):Pair<AdapterView<*>,Int>?{var child=view;var parent=child.parent;while(parent is View){if(parent is AdapterView<*>){val index=parent.getPositionForView(child);return if(index!=AdapterView.INVALID_POSITION)parent to index else null};child=parent;parent=parent.parent};return null}
  private fun all():List<View>{val out=mutableListOf<View>();fun visit(v:View){out.add(v);if(v is WebView)return;if(v is ViewGroup)for(i in 0 until v.childCount)visit(v.getChildAt(i))};roots().forEach(::visit);return out}
  fun list():JSONArray {
    val current=all();val alive=current.toSet();views.entries.removeAll{it.value.get() !in alive}
    return JSONArray().also{out->current.filter{visible(it)&&(it.isClickable||it.isLongClickable||it is EditText||it is SeekBar||it is CompoundButton||it is Spinner||it is ScrollView||it is HorizontalScrollView||item(it)!=null)}.take(2000).forEach{v->
      val value=JSONObject().put("controlId",id(v)).put("kind",v.javaClass.simpleName).put("label",label(v)).put("enabled",v.isEnabled).put("resource",if(v.id==View.NO_ID)JSONObject.NULL else try{v.resources.getResourceName(v.id)}catch(_:Exception){JSONObject.NULL})
      if(secret(v))value.put("sensitive",true)else if(v is EditText)value.put("value",v.text.toString())
      if(v is CompoundButton)value.put("checked",v.isChecked)
      if(v is SeekBar)value.put("number",v.progress).put("maximum",v.max)
      if(danger(v))value.put("risk","destructive").put("confirmationToken",tokens.getOrPut(v){UUID.randomUUID().toString()})
      out.put(value)
    }}
  }
  private fun resolve(args:JSONObject):View {val value=views[args.getString("controlId")]?.get()?:error("控件已失效，请重新列出控件");check(value in all()&&visible(value)){"控件不在当前界面中"};check(value.isEnabled){"控件已禁用"};return value}
  fun dispatch(context:Context,command:String,args:JSONObject):Any {
    check(enabled(context)){"请先在设置中开启 ADB 自动化；此开关不会随配置同步"}
    return when(command){
      "automation.ui.list"->list()
      "automation.ui.invoke"->{val view=resolve(args);if(danger(view)){check(args.optBoolean("acknowledge")&&tokens[view]!=null&&args.optString("confirmationToken")==tokens[view]){"请读取当前确认令牌后明确确认"};tokens.remove(view)}
        val handled=if(args.optBoolean("long"))view.performLongClick()else if(view.hasOnClickListeners())view.performClick()else item(view)?.let{(parent,index)->parent.performItemClick(view,index,parent.getItemIdAtPosition(index))}?:view.performClick()
        check(handled){"控件没有对应操作"};JSONObject().put("accepted",true)}
      "automation.ui.set"->{when(val v=resolve(args)){
        is CompoundButton->{check(args.has("checked")){"需要 checked 参数"};v.isChecked=args.getBoolean("checked")}
        is EditText->{val value=args.getString("value");require(value.length<=65536){"输入过长"};v.setText(value);v.setSelection(v.text.length)}
        is SeekBar->{val number=args.getInt("number");require(number in 0..v.max){"数值超出范围"};v.progress=number}
        is Spinner->{val index=args.getInt("number");require(index in 0 until v.count){"选项不存在"};v.setSelection(index)}
        else->error("此控件不支持输入")};JSONObject().put("updated",true)}
      "automation.ui.scroll"->{val view=resolve(args);val x=args.optInt("left",view.scrollX);val y=args.optInt("top",view.scrollY);require(x>=0&&y>=0);view.scrollTo(x,y);JSONObject().put("left",view.scrollX).put("top",view.scrollY)}
      "automation.back"->{val activity=current.get() as? ComponentActivity?:error("当前界面不支持返回");activity.onBackPressedDispatcher.onBackPressed();true}
      "automation.media.state"->(current.get() as? PlaybackActivity)?.automationState()?:error("原生播放器没有打开")
      "automation.media.control"->(current.get() as? PlaybackActivity)?.automationControl(args)?:error("原生播放器没有打开")
      else->error("未知原生自动化操作")
    }
  }
}
