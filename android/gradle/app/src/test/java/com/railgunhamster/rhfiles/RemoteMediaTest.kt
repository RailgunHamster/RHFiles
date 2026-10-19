package com.railgunhamster.rhfiles

import androidx.media3.datasource.DataSpec
import android.net.Uri
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28],manifest=Config.NONE)
class RemoteMediaTest {
  private val path="remote://550e8400-e29b-41d4-a716-446655440000/movie.mp4"
  private fun storage(server:MockWebServer)=RemoteStorage(RuntimeEnvironment.getApplication(),profileLookup={JSONObject().put("name","fixture").put("type","webdav").put("url",server.url("/files").toString()).put("username","qa").put("password","fixture-only")})
  @Test fun rangeReadKeepsCredentialsOutOfUriAndSupportsSeekWithoutSkipping(){
    MockWebServer().use{server->server.start();server.enqueue(MockResponse().setResponseCode(206).setHeader("Content-Range","bytes 4-9/10").setBody("456789"))
      storage(server).mediaInput(path,4).use{input->assertEquals(10L,input.totalLength);assertEquals("456789",input.stream.bufferedReader().readText())}
      val request=server.takeRequest();assertEquals("bytes=4-",request.getHeader("Range"));assertEquals("identity",request.getHeader("Accept-Encoding"));assertEquals("/files/movie.mp4",request.path);assertNotNull(request.getHeader("Authorization"))
    }
  }
  @Test fun ignoredRangeAndWrongOffsetAreErrorsNotWholeFileDownloads(){
    MockWebServer().use{server->server.start();val remote=storage(server)
      server.enqueue(MockResponse().setBody("0123456789"));try{remote.mediaInput(path,4).close();fail()}catch(_:IllegalArgumentException){}
      server.enqueue(MockResponse().setResponseCode(206).setHeader("Content-Range","bytes 0-9/10").setBody("0123456789"));try{remote.mediaInput(path,4).close();fail()}catch(_:IllegalArgumentException){}
    }
  }
  @Test fun media3DataSpecBoundsReadsAndZeroLengthDoesNotConsume(){
    MockWebServer().use{server->server.start();server.enqueue(MockResponse().setResponseCode(206).setHeader("Content-Range","bytes 4-9/10").setBody("456789"))
      val source=RemoteMediaDataSource(storage(server));assertEquals(3L,source.open(DataSpec.Builder().setUri(Uri.parse(path)).setPosition(4).setLength(3).build()))
      assertEquals(path,source.uri.toString());val bytes=ByteArray(10);assertEquals(0,source.read(bytes,0,0));assertEquals(3,source.read(bytes,0,10));assertEquals("456",String(bytes,0,3));assertEquals(-1,source.read(bytes,0,1));source.close();assertNull(source.uri)
    }
  }
  @Test fun oversizedNetworkImageIsRejectedBeforeReadingOrWritingLocalFiles(){
    MockWebServer().use{server->server.start();server.enqueue(MockResponse().setBody("").setHeader("Content-Length",25*1024*1024));try{RemoteImages(storage(server)).read(path,192);fail()}catch(error:IllegalArgumentException){assertTrue(error.message!!.contains("24 MB"))};assertEquals("bytes=0-",server.takeRequest().getHeader("Range"))}
  }
}
