package com.railgunhamster.rhfiles

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.*
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.json.JSONObject
import java.util.concurrent.Executors

/** Offline general QR reader. Only explicit confirmation runs a group action;
 * arbitrary QR contents are selectable/copyable, never opened or executed. */
class QrScanActivity:AppCompatActivity() {
  private val worker=Executors.newSingleThreadExecutor()
  private val io=Executors.newSingleThreadExecutor()
  private lateinit var preview:PreviewView
  private lateinit var note:TextView
  private lateinit var result:TextView
  private lateinit var action:MaterialButton
  private lateinit var copy:MaterialButton
  private lateinit var rescan:MaterialButton
  private lateinit var torch:MaterialButton
  private var provider:ProcessCameraProvider?=null
  private var camera:Camera?=null
  private var found:String?=null
  private var busy=false
  private var light=false
  private val zh get()=resources.configuration.locales[0].language=="zh"
  private fun text(a:String,b:String)=if(zh)a else b
  private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
  override fun onCreate(saved:Bundle?) {
    super.onCreate(saved);NativeAutomation.install(this);DeviceGroups.install(applicationContext)
    val dark=resources.configuration.uiMode and 48==32
    val bg=if(dark)0xff202838.toInt()else 0xfff8faff.toInt();val ink=if(dark)0xffe6ebf6.toInt()else 0xff34415b.toInt()
    val accent=if(dark)0xffa2b7ff.toInt()else 0xff4d6edb.toInt();window.statusBarColor=bg;window.navigationBarColor=bg
    WindowInsetsControllerCompat(window,window.decorView).isAppearanceLightStatusBars=!dark
    val body=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(16),dp(20),dp(20));setBackgroundColor(bg)}
    fun label(value:String,size:Float)=TextView(this).apply{setTextColor(ink);text=value;textSize=size;setPadding(0,dp(12),0,dp(12));body.addView(this)}
    fun button(value:String,fn:()->Unit)=MaterialButton(this).apply{text=value;isAllCaps=false;letterSpacing=0f;cornerRadius=dp(10);elevation=0f;setTextColor(ink);backgroundTintList=ColorStateList.valueOf(bg);strokeWidth=dp(1);strokeColor=ColorStateList.valueOf(if(dark)0xff354159.toInt()else 0xffe5eaf4.toInt());setOnClickListener{fn()};body.addView(this,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(6)})}
    button(text("返回 RHFiles","Back to RHFiles")){if(callingActivity==null)startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));finish()}
    label(text("扫码","Scan QR"),26f)
    note=label(text("识别设备组或复制二维码内容。相机画面不上传。","Join a device group or copy QR contents. Camera frames stay on this device."),15f)
    preview=PreviewView(this).apply{implementationMode=PreviewView.ImplementationMode.COMPATIBLE}
    body.addView(preview,LinearLayout.LayoutParams(-1,dp(280)))
    result=label("",15f).apply{setTextIsSelectable(true);visibility=View.GONE}
    action=button(""){confirmGroup()}.apply{visibility=View.GONE;backgroundTintList=ColorStateList.valueOf(accent);setTextColor(if(dark)0xff17213c.toInt()else Color.WHITE);strokeWidth=0}
    copy=button(text("复制内容","Copy content")){found?.let{(getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("QR",it));Toast.makeText(this,text("已复制","Copied"),Toast.LENGTH_SHORT).show()}}.apply{visibility=View.GONE}
    torch=button(text("闪光灯","Flashlight")){light=!light;camera?.cameraControl?.enableTorch(light)}.apply{isEnabled=false}
    rescan=button(text("重新扫描","Scan again")){if(!busy){found=null;result.visibility=View.GONE;action.visibility=View.GONE;copy.visibility=View.GONE;preview.visibility=View.VISIBLE;requestCamera()}}
    setContentView(ScrollView(this).apply{isFillViewport=true;addView(body,ViewGroup.LayoutParams(-1,-2))})
    WindowCompat.setDecorFitsSystemWindows(window,false)
    ViewCompat.setOnApplyWindowInsetsListener(body){v,insets->val i=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());v.setPadding(i.left+dp(20),i.top+dp(16),i.right+dp(20),i.bottom+dp(20));insets}
    found=saved?.getString("qr");if(found!=null)showResult(found!!)else requestCamera()
  }
  private fun requestCamera(){if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)startCamera()else requestPermissions(arrayOf(Manifest.permission.CAMERA),203)}
  override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,grants:IntArray){super.onRequestPermissionsResult(code,permissions,grants);if(code==203&&grants.firstOrNull()==PackageManager.PERMISSION_GRANTED)startCamera()else note.text=text("未允许相机，请在应用权限中允许后重试。","Camera permission denied. Allow it in app settings and try again.")}
  private fun startCamera(){
    note.text=text("对准二维码。不会自动打开网址或执行内容。","Point at a QR. Links and contents will not be opened automatically.")
    val future=ProcessCameraProvider.getInstance(this)
    future.addListener({if(isFinishing||isDestroyed||found!=null)return@addListener
      try{val p=future.get();provider=p;p.unbindAll();val feed=Preview.Builder().build().also{it.surfaceProvider=preview.surfaceProvider};val analysis=ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();val reader=PairingQrReader()
        analysis.setAnalyzer(worker){image->try{val value=reader.read(image);if(value!=null)runOnUiThread{if(!isDestroyed&&!isFinishing&&found==null)showResult(value)}}catch(_:Exception){/* A partial camera frame is not a decoded QR. */}finally{image.close()}}
        camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,feed,analysis);torch.isEnabled=camera?.cameraInfo?.hasFlashUnit()==true
      }catch(_:Exception){note.text=text("相机暂不可用，请重试。","Camera unavailable. Please retry.")}
    },ContextCompat.getMainExecutor(this))
  }
  private fun showResult(value:String){
    found=value;provider?.unbindAll();camera=null;torch.isEnabled=false;preview.visibility=View.GONE
    result.text=value.take(8192);result.visibility=View.VISIBLE;copy.visibility=View.VISIBLE
    val meta=QrContents.describe(value)
    if(meta.getString("kind")=="content"){note.text=meta.optString("message").ifBlank{text("二维码内容","QR content")};action.visibility=View.GONE;return}
    note.text=meta.optString("message").ifBlank{text("设备组：","Device group: ")+meta.optString("name")+meta.optString("deviceName").takeIf{it.isNotBlank()}?.let{"\n"+text("来自：","From: ")+it}.orEmpty()}
    action.text=when(meta.optString("kind")){"invitation","approval"->if(meta.optBoolean("joinable",true))text("确认并加入设备组","Confirm and join group")else text("生成本机入组请求","Create join request");else->text("选择设备组并批准请求","Select group and approve request")};action.visibility=View.VISIBLE
  }
  private fun confirmGroup(){
    val uri=found?:return;if(busy)return
    val data=runCatching{DeviceGroups.describe(uri)}.getOrElse{note.text=it.message;return}
    if(data.optString("kind")=="request"){
      val remote=RemoteStorage(applicationContext);val groups=(DeviceGroups.run("state",JSONObject(),remote)as JSONObject).getJSONArray("groups")
      val candidates=(0 until groups.length()).map{groups.getJSONObject(it)}.filter{g->val m=g.getJSONArray("members");(0 until m.length()).any{m.getJSONObject(it).let{p->p.optBoolean("self")&&p.optBoolean("canInvite")&&!p.optBoolean("blocked")}}}
      if(candidates.isEmpty()){note.text=text("本机没有可批准入组的设备组。","No group on this device can approve this request.");return}
      MaterialAlertDialogBuilder(this).setTitle(text("批准加入哪个设备组？","Approve for which group?")).setItems(candidates.map{it.getString("name")}.toTypedArray()){_,i->confirm(text("仅批准你信任的设备。新成员默认不能继续邀请其他设备。","Only approve trusted devices. Invitation rights are off by default.")){runWork{DeviceGroups.run("approve",JSONObject().put("id",candidates[i].getString("id")).put("uri",uri).put("canInvite",false),remote)}}}.setNegativeButton(text("取消","Cancel"),null).show();return
    }
    if(!data.optBoolean("joinable",true)){runWork{DeviceGroups.run("request",JSONObject().put("deviceName",DeviceNames.current(this)),RemoteStorage(applicationContext))};return}
    confirm(text("确认此二维码来自你信任的电脑或设备。加入后可访问其设备组共享。","Confirm this QR came from a trusted device. Joining enables access to its group shares.")){runWork{
      val remote=RemoteStorage(applicationContext)
      if(data.optString("kind")=="invitation")DeviceGroups.joinInvitation(uri,true,remote)else DeviceGroups.run("join",JSONObject().put("uri",uri).put("confirmed",true),remote)
      JSONObject().put("joined",true)
    }}
  }
  private fun confirm(message:String,fn:()->Unit){MaterialAlertDialogBuilder(this).setTitle(text("设备组","Device group")).setMessage(message).setNegativeButton(text("取消","Cancel"),null).setPositiveButton(text("确认","Confirm")){_,_->fn()}.show()}
  private fun runWork(fn:()->Any){
    busy=true;action.isEnabled=false;rescan.isEnabled=false;note.text=text("正在处理设备组…","Processing device group…")
    io.execute{val outcome=runCatching(fn);runOnUiThread{if(isDestroyed||isFinishing)return@runOnUiThread;busy=false;action.isEnabled=true;rescan.isEnabled=true
      outcome.fold({value->if(value is JSONObject&&value.optBoolean("joined")){note.text=text("已加入设备组，可返回存储位置访问电脑。","Joined. Return to storage locations to access the computer.");action.visibility=View.GONE;setResult(RESULT_OK,Intent().putExtra("changed",true))}else if(value is JSONObject&&value.has("uri")){result.text=value.getString("uri");found=value.getString("uri");action.visibility=View.GONE;note.text=text("请把以下公开信息交给另一台设备。入组请求需要由组成员批准；批准信息交回请求设备确认。","Pass this public data to the other device. A member must approve a join request; return the approval to the requesting device.");copy.visibility=View.VISIBLE}}, {error->note.text=error.message?:text("操作失败，请重试。","Operation failed. Please retry.")})
    }}
  }
  override fun onSaveInstanceState(out:Bundle){found?.let{out.putString("qr",it)};super.onSaveInstanceState(out)}
  override fun onDestroy(){provider?.unbindAll();worker.shutdown();io.shutdown();super.onDestroy()}
}
