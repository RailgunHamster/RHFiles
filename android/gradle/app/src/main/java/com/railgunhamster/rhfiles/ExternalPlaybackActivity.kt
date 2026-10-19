package com.railgunhamster.rhfiles

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import java.io.File

/** Never accepts internal path, remote connection IDs, playlists or write grants. */
class ExternalPlaybackActivity:Activity() {
  companion object {
    internal fun videoPath(intent:Intent,packageName:String,canonical:(String)->String={File(it).canonicalPath}):Pair<Uri,String> {
      require(intent.action==Intent.ACTION_VIEW) {"请通过视频的打开方式启动 RHFiles"}
      // Android may resolve a provider's video MIME without copying it into
      // Intent.type. Do not query a remote provider on the UI thread; the
      // read-only decoder validates content, and explicit non-video types fail.
      require(intent.type==null||intent.type?.startsWith("video/",true)==true) {"此入口只接受视频文件"}
      val uri=intent.data?:error("没有提供视频地址")
      require(uri.toString().length<=16384&&uri.userInfo==null) {"视频地址无效"}
      val path=when(uri.scheme){
        "content"->{require(!uri.authority.isNullOrBlank()&&uri.authority!="$packageName.fileprovider") {"请在 RHFiles 内直接打开此文件"};uri.toString()}
        "file"->{require(uri.authority.isNullOrBlank()||uri.authority=="localhost") {"不支持此文件地址"};val path=canonical(uri.path?:error("文件地址无效"));require(path.startsWith("/storage/")||path.startsWith("/mnt/media_rw/")) {"不能通过外部播放器入口访问应用私有文件"};path}
        else->error("只支持其他应用提供的 content:// 或本机 file:// 视频")
      }
      return uri to path
    }
  }
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState)
    try{
      val (uri,path)=videoPath(intent,packageName)
      val label=(intent.getStringExtra(Intent.EXTRA_TITLE)?:uri.lastPathSegment?.substringAfterLast('/'))?.take(160)?.takeIf{it.isNotBlank()}?:"外部视频"
      startActivity(Intent(this,PlaybackActivity::class.java).setDataAndType(uri,intent.type?:"video/*")
        .putExtra("path",path).putExtra("name",label).putExtra("kind","video")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply{clipData=ClipData.newRawUri("视频",uri)})
    }catch(e:Exception){Toast.makeText(this,e.message?:"无法打开视频",Toast.LENGTH_LONG).show()}
    finish()
  }
}
