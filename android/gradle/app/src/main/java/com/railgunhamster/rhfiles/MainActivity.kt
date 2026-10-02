package com.railgunhamster.rhfiles

import android.Manifest
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.webkit.MimeTypeMap
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File

/** Canonical activity; android-sync.ps1 restores it after Tauri regeneration. */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
    setSystemTheme(false)
  }

  @Suppress("DEPRECATION")
  private fun setSystemTheme(dark: Boolean) {
    val color = if (dark) Color.rgb(28, 32, 38) else Color.WHITE
    window.statusBarColor = color
    window.navigationBarColor = color
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = !dark
      isAppearanceLightNavigationBars = !dark
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    // No wildcard origin or JavascriptInterface: remote pages, asset previews
    // and subframes must not acquire filesystem/Android-intent privileges.
    WebViewCompat.addWebMessageListener(
      webView, "RHFilesNative",
      setOf("http://tauri.localhost", "https://tauri.localhost")
    ) { _, message, _, mainFrame, reply ->
      if (mainFrame) {
        val response = JSONObject()
        try {
          val request = JSONObject(message.data ?: "{}")
          response.put("id", request.getInt("id"))
          val args = request.optJSONObject("args") ?: JSONObject()
          val result: Any = when (request.getString("command")) {
            "theme" -> { setSystemTheme(args.optBoolean("dark")); true }
            "permission" -> if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
              else checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
            "settings" -> {
              if (Build.VERSION.SDK_INT < 30) {
                requestPermissions(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE), 10)
              } else {
                try {
                  startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
                } catch (_: android.content.ActivityNotFoundException) {
                  startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                }
              }
              true
            }
            "open", "share" -> {
              val file = File(args.getString("path")).canonicalFile
              val allowed = listOf(File("/storage"), Environment.getExternalStorageDirectory()).any { root ->
                file.path.startsWith(root.canonicalPath + File.separator)
              }
              require(allowed && file.isFile && file.canRead()) { "文件不存在、无法读取或不在共享存储中" }
              val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
              val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "application/octet-stream"
              val share = request.getString("command") == "share"
              val intent = if (share) Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
              } else Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
              intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              intent.clipData = ClipData.newRawUri(file.name, uri)
              startActivity(Intent.createChooser(intent, if (share) "分享文件" else "打开方式"))
              true
            }
            else -> throw IllegalArgumentException("未知系统操作")
          }
          response.put("result", result)
        } catch (error: Exception) {
          response.put("error", error.message ?: "系统操作失败")
        }
        reply.postMessage(response.toString())
      }
    }
  }
}
