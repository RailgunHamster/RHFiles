package com.railgunhamster.rhfiles
import android.util.Base64
import okhttp3.mockwebserver.*
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.concurrent.CopyOnWriteArrayList

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28],manifest=Config.NONE)
class PdfNetworkReadTest {
  @Test fun actualWebdavRangesAreBoundedAuthenticatedAndRevokedOnClose(){
    val bytes=ByteArray(200000){(it%251).toByte()};val calls=CopyOnWriteArrayList<RecordedRequest>()
    MockWebServer().use{server->
      server.dispatcher=object:Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse{
        calls.add(request)
        if(request.method=="PROPFIND")return MockResponse().setResponseCode(207).setBody("""<d:multistatus xmlns:d="DAV:"><d:response><d:href>/files/sample.pdf</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>${bytes.size}</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>""")
        val start=Regex("bytes=(\\d+)-").matchEntire(request.getHeader("Range")?:"")?.groupValues?.get(1)?.toInt()?:return MockResponse().setResponseCode(400)
        return MockResponse().setResponseCode(206).setHeader("Content-Range","bytes $start-${bytes.size-1}/${bytes.size}").setBody(okio.Buffer().write(bytes,start,bytes.size-start))
      }};server.start()
      val storage=NativeStorage(RuntimeEnvironment.getApplication());val remote=RemoteStorage(RuntimeEnvironment.getApplication()){JSONObject().put("name","PDF QA").put("type","webdav").put("url",server.url("/files/").toString()).put("username","qa").put("password","fixture-only")}
      PdfReadSession(storage,remote).use{reader->
        val source=reader.open("remote://550e8400-e29b-41d4-a716-446655440000/sample.pdf");val id=source.getString("id")
        assertEquals(bytes.size.toLong(),source.getLong("length"))
        val block=reader.read(id,65536,4096);assertArrayEquals(bytes.copyOfRange(65536,69632),Base64.decode(block.getString("data"),Base64.NO_WRAP))
        val get=calls.single{it.method=="GET"};assertEquals("bytes=65536-",get.getHeader("Range"));assertNotNull(get.getHeader("Authorization"));assertEquals("/files/sample.pdf",get.path)
        reader.release(id);val count=calls.size;try{reader.read(id,0,1);fail("Closed source remained usable")}catch(_:IllegalStateException){};assertEquals(count,calls.size)
      }
    }
  }
}
