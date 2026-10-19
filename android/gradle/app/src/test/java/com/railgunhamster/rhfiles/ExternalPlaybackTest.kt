package com.railgunhamster.rhfiles

import android.content.Intent
import android.net.Uri
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class ExternalPlaybackTest {
  private fun request(uri:String,mime:String="video/mp4")=Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri),mime)
  @Test fun externalContentVideosKeepTheOriginalUriAndIgnoreInternalExtras(){
    val intent=request("content://other.provider/document/123").putExtra("path","/data/user/0/private").putExtra("queue","untrusted")
    val (uri,path)=ExternalPlaybackActivity.videoPath(intent,"com.railgunhamster.rhfiles");assertEquals(intent.data,uri);assertEquals(intent.data.toString(),path)
    assertEquals("content://other.provider/opaque-id",ExternalPlaybackActivity.videoPath(Intent(Intent.ACTION_VIEW).setData(Uri.parse("content://other.provider/opaque-id")),"qa").second)
    assertEquals("/storage/emulated/0/video.mp4",ExternalPlaybackActivity.videoPath(request("file:///storage/emulated/0/video.mp4"),"qa",canonical={it}).second)
    try{ExternalPlaybackActivity.videoPath(request("file:///storage/emulated/0/symlink.mp4"),"qa",canonical={"/data/user/0/private.mp4"});fail()}catch(_:IllegalArgumentException){}
  }
  @Test fun privateFilesOwnProviderArbitraryUrlsAndWrongActionsCannotEnterThePublicGate(){
    for(intent in listOf(request("file:///data/user/0/qa/secrets.mp4"),request("file:///storage/../data/secrets.mp4"),request("content://com.railgunhamster.rhfiles.fileprovider/root/private"),request("https://server/video.mp4"),request("remote://server/video.mp4"),request("content://p/a","text/plain"),request("content://p/a").setAction(Intent.ACTION_SEND),Intent(Intent.ACTION_VIEW).setType("video/mp4"))){
      try{ExternalPlaybackActivity.videoPath(intent,"com.railgunhamster.rhfiles");fail("Accepted $intent")}catch(_:IllegalArgumentException){}catch(_:IllegalStateException){}
    }
  }
}
