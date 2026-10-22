package com.railgunhamster.rhfiles

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.Executors

/** Private camera screen: QR decoding is offline, no GMS/model download or
 * analytics. A successful scan only fills a form; it never pairs automatically. */
class PairingScanActivity:AppCompatActivity() {
  private val worker=Executors.newSingleThreadExecutor()
  private lateinit var preview:PreviewView
  private lateinit var note:TextView
  private lateinit var accept:Button
  private lateinit var torch:Button
  private var provider:ProcessCameraProvider?=null
  private var camera:Camera?=null
  private var found:String?=null
  private var light=false
  private val zh get()=resources.configuration.locales[0].language=="zh"
  private fun text(a:String,b:String)=if(zh)a else b
  private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
  override fun onCreate(saved:Bundle?) {
    super.onCreate(saved);NativeAutomation.install(this)
    val root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK)}
    preview=PreviewView(this).apply{implementationMode=PreviewView.ImplementationMode.COMPATIBLE}
    root.addView(preview,FrameLayout.LayoutParams(-1,-1))
    val content=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(16),dp(20),dp(20))}
    val title=TextView(this).apply{text=this@PairingScanActivity.text("扫描电脑配对二维码","Scan the computer’s pairing QR");textSize=20f;setTextColor(Color.WHITE)}
    content.addView(title)
    note=TextView(this).apply{setTextColor(Color.WHITE);textSize=15f;setPadding(0,dp(12),0,dp(12));setBackgroundColor(0xAA15191D.toInt())}
    content.addView(note);content.addView(Space(this),LinearLayout.LayoutParams(1,0,1f))
    fun button(label:String,action:()->Unit)=Button(this).apply{text=label;isAllCaps=false;setOnClickListener{action()};content.addView(this,LinearLayout.LayoutParams(-1,dp(52)))}
    accept=button(text("使用配对信息","Use pairing data")){found?.let{setResult(RESULT_OK,Intent().putExtra("uri",it));finish()}}.apply{isEnabled=false}
    torch=button(text("开关闪光灯","Toggle flashlight")){light=!light;camera?.cameraControl?.enableTorch(light)}.apply{isEnabled=false}
    button(text("重新扫描 / 允许相机","Rescan / allow camera")){found=null;accept.isEnabled=false;requestCamera()}
    button(text("取消，改用粘贴配对信息","Cancel — paste pairing data instead")){finish()}
    // Short landscape/folded windows and large fonts must not hide Cancel.
    val scroll=ScrollView(this).apply{isFillViewport=true;contentDescription=text("扫码操作区域","Scanner controls");addView(content,ViewGroup.LayoutParams(-1,-2))}
    root.addView(scroll,FrameLayout.LayoutParams(-1,-1,Gravity.FILL));setContentView(root)
    WindowCompat.setDecorFitsSystemWindows(window,false)
    ViewCompat.setOnApplyWindowInsetsListener(content){v,insets->val i=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());v.setPadding(i.left+dp(20),i.top+dp(16),i.right+dp(20),i.bottom+dp(20));insets}
    found=saved?.getString("uri")
    if(found!=null)showResult(found!!)else requestCamera()
  }
  private fun requestCamera() {
    if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)startCamera()
    else requestPermissions(arrayOf(Manifest.permission.CAMERA),203)
  }
  override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grants:IntArray) {
    super.onRequestPermissionsResult(requestCode,permissions,grants)
    if(requestCode==203&&grants.firstOrNull()==PackageManager.PERMISSION_GRANTED)startCamera()
    else note.text=text("未允许相机。可以返回粘贴配对信息，或在应用权限中允许相机。","Camera denied. Paste pairing data instead, or allow camera access in app permissions.")
  }
  private fun startCamera() {
    note.text=text("对准电脑「局域网文件服务」中的二维码。相机画面不上传。","Point at the QR in LAN file service settings. Camera frames never leave this device.")
    val future=ProcessCameraProvider.getInstance(this)
    future.addListener({
      if(isFinishing||isDestroyed||found!=null)return@addListener
      try {
        val p=future.get();provider=p;p.unbindAll()
        val feed=Preview.Builder().build().also{it.surfaceProvider=preview.surfaceProvider}
        val analysis=ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        val reader by lazy{PairingQrReader()}
        analysis.setAnalyzer(worker){image->try {
          val uri=reader.read(image)
          if(uri!=null){DeviceGroups.describe(uri);runOnUiThread{if(!isFinishing&&!isDestroyed&&found==null)showResult(uri)}}
        }catch(_:Exception){/* Non-pairing/partial frames are ignored, never logged. */}finally{image.close()}}
        camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,feed,analysis)
        torch.isEnabled=camera?.cameraInfo?.hasFlashUnit()==true
      }catch(_:Exception){note.text=text("相机暂不可用，可返回粘贴配对信息。","Camera unavailable. Paste pairing data instead.")}
    },ContextCompat.getMainExecutor(this))
  }
  private fun showResult(uri:String) {
    val data=DeviceGroups.describe(uri);found=uri;provider?.unbindAll();camera=null;torch.isEnabled=false;light=false
    if(data.has("kind")){note.text=text("已识别设备组信息：\n","Device group data:\n")+data.getString("name")+"\n"+text("返回后核对来源，再手动批准或加入。","Verify its source, then explicitly approve or join.");accept.isEnabled=true;return}
    val identity=data.getString("fingerprint").take(12).chunked(4).joinToString(" ")
    note.text=text("已识别电脑：\n","Computer found:\n")+data.getJSONArray("endpoints").getString(0)+"\n"+text("身份：","Identity: ")+identity+"\n"+text("仅使用你自己电脑上显示的二维码。确认后仍需保存连接。","Only use a QR displayed on your own computer. Save the connection after confirming.")
    accept.isEnabled=true
  }
  override fun onSaveInstanceState(out:Bundle){found?.let{out.putString("uri",it)};super.onSaveInstanceState(out)}
  override fun onDestroy(){provider?.unbindAll();worker.shutdown();super.onDestroy()}
}
