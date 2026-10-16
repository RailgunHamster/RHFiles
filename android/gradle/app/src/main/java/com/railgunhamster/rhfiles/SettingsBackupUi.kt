package com.railgunhamster.rhfiles

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executor

/** SAF and passwords stay native: no credentials or passphrases go through JS. */
class SettingsBackupUi(private val activity:Activity,private val io:Executor,private val store:SettingsBackup,private val updateConfig:()->JSONObject,private val apply:(JSONObject,JSONObject)->Unit) {
  private data class Operation(val exporting:Boolean,val web:JSONObject,val reply:(Any?,String?)->Unit,var bytes:ByteArray?=null)
  private var operation:Operation?=null
  val busy get()=operation!=null
  fun begin(exporting:Boolean,web:JSONObject,reply:(Any?,String?)->Unit){
    require(!busy){"已有配置备份操作进行中"};operation=Operation(exporting,web,reply)
    try{activity.startActivityForResult(Intent(activity,EbookActivity::class.java).putExtra("settingsOnly",true),110)}catch(e:Exception){finish(null,e.message)}
  }
  private fun finish(value:Any?,error:String?=null){val op=operation?:return;operation=null;op.bytes?.fill(0);op.reply(value,error)}
  private fun background(block:()->Unit){io.execute{try{block()}catch(e:Exception){activity.runOnUiThread{finish(null,e.message?:"配置备份失败")}}}}
  private fun password(exporting:Boolean,accept:(CharArray)->Unit){
    val box=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setPadding(32,8,32,0)}
    box.addView(TextView(activity).apply{text=if(exporting)"备份包含网络账号密码，必须使用至少 8 个字符的密码加密。请妥善保管，密码遗失无法恢复。" else "请输入导出时设置的备份密码。密码错误或文件损坏不会改变当前配置。"})
    fun input(label:String)=EditText(activity).apply{hint=label;inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD;importantForAutofill=android.view.View.IMPORTANT_FOR_AUTOFILL_NO;box.addView(this)}
    val first=input("备份密码");val second=if(exporting)input("再次输入密码")else null
    val dialog=AlertDialog.Builder(activity).setTitle(if(exporting)"加密导出配置" else "解密配置备份").setView(box).setNegativeButton("取消"){_,_->finish(null)}.setPositiveButton("继续",null).create()
    dialog.setOnCancelListener{finish(null)};dialog.setOnShowListener{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener{
      if(first.length() !in 8..1024){first.error="请输入 8～1024 个字符";return@setOnClickListener}
      if(second!=null&&first.text.toString()!=second.text.toString()){second.error="两次密码不一致";return@setOnClickListener}
      val chars=CharArray(first.length()){first.text[it]};first.text.clear();second?.text?.clear();dialog.dismiss();accept(chars)
    }};dialog.show()
  }
  @Suppress("DEPRECATION") fun result(code:Int,result:Int,data:Intent?):Boolean {
    if(code !in 110..112)return false
    val op=operation?:return true
    if(result!=Activity.RESULT_OK){finish(null,data?.getStringExtra("error"));return true}
    when(code){
      110->if(op.exporting)password(true){pass->background{
        try{val snapshot=store.snapshot(op.web,updateConfig());store.validate(snapshot);op.bytes=SettingsBackup.seal(snapshot,pass)}finally{pass.fill('\u0000')}
        activity.runOnUiThread{try{activity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type="application/octet-stream";putExtra(Intent.EXTRA_TITLE,"RHFiles-settings-"+SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(Date())+".rhconfig")},111)}catch(e:Exception){finish(null,e.message)}}
      }}else try{activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type="*/*"},112)}catch(e:Exception){finish(null,e.message)}
      111->{val uri=data?.data;if(uri==null){finish(null,"未选择配置保存位置");return true};background{
        activity.contentResolver.openOutputStream(uri,"wt").use{out->requireNotNull(out){"无法写入所选位置"};out.write(requireNotNull(op.bytes));out.flush()};activity.runOnUiThread{finish(JSONObject().put("saved",true))}
      }}
      112->{val uri=data?.data;if(uri==null){finish(null,"未选择配置文件");return true};background{
        val bytes=activity.contentResolver.openInputStream(uri).use{input->requireNotNull(input){"无法读取配置文件"};with(com.railgunhamster.rhfiles.SafeFiles){input.readBytesBounded(SettingsBackup.LIMIT)}}
        activity.runOnUiThread{password(false){pass->background{
          val payload=try{SettingsBackup.unseal(bytes,pass)}finally{pass.fill('\u0000');bytes.fill(0)};store.validate(payload)
          activity.runOnUiThread{AlertDialog.Builder(activity).setTitle("替换本地配置？").setMessage("将导入全部设置、${payload.getJSONArray("profiles").length()} 个网络位置（含密码）和阅读配置。\n\n现有配置将被替换，导入后回到主页并清空待粘贴列表，不会恢复文件任务。系统权限和授权目录需重新授权。")
            .setNegativeButton("取消"){_,_->finish(null)}.setOnCancelListener{finish(null)}.setPositiveButton("导入"){_,_->background{apply(payload,op.web);activity.runOnUiThread{finish(JSONObject().put("applied",true))}}}.show()}
        }}}
      }}
    }
    return true
  }
}
