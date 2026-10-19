package com.railgunhamster.rhfiles

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream
import java.io.ByteArrayInputStream
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,sdk=[28])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ImageWallpaperTest {
  private fun bytes():ByteArray=ByteArrayOutputStream().use{out->val image=Bitmap.createBitmap(8,6,Bitmap.Config.ARGB_8888);try{image.compress(Bitmap.CompressFormat.PNG,100,out);out.toByteArray()}finally{image.recycle()}}
  private fun clean(){File(RuntimeEnvironment.getApplication().cacheDir,"exports/wallpapers").deleteRecursively()}
  @Test fun snapshotUsesImageHeaderNotFilenameAndRemainsAfterPreparing(){clean();val c=RuntimeEnvironment.getApplication();val input=bytes();val file=ImageWallpaper.snapshot(c){input.inputStream()};assertEquals("png",file.extension);assertArrayEquals(input,file.readBytes());assertEquals("wallpapers",file.parentFile!!.name);assertFalse(file.parentFile!!.listFiles()!!.any{it.extension=="part"});clean()}
  @Test fun invalidAndOversizedInputsLeaveNoPartialFiles(){clean();val c=RuntimeEnvironment.getApplication();for(input in listOf("not an image".toByteArray(),bytes()))try{ImageWallpaper.snapshot(c,maxBytes=16){input.inputStream()};fail()}catch(_:IllegalArgumentException){};assertEquals(0,File(c.cacheDir,"exports/wallpapers").listFiles()!!.size);clean()}
  @Test fun providerFailuresCloseInputAndRemovePartialSnapshot(){clean();var closed=false;val input=object:ByteArrayInputStream(bytes()){override fun read(b:ByteArray,o:Int,n:Int):Int=throw java.io.IOException("fixture read failure");override fun close(){closed=true;super.close()}};try{ImageWallpaper.snapshot(RuntimeEnvironment.getApplication()){input};fail()}catch(_:java.io.IOException){};assertTrue(closed);assertEquals(0,File(RuntimeEnvironment.getApplication().cacheDir,"exports/wallpapers").listFiles()!!.size);clean()}
  @Test fun expiredSnapshotIsCleanedButRecentPickerInputIsRetained(){clean();val c=RuntimeEnvironment.getApplication();val first=ImageWallpaper.snapshot(c){bytes().inputStream()};val expired=File(first.parentFile,"old.png").apply{writeBytes(bytes());setLastModified(System.currentTimeMillis()-25*60*60*1000L)};ImageWallpaper.snapshot(c){bytes().inputStream()};assertTrue(first.exists());assertFalse(expired.exists());clean()}
  @Test fun handoffOnlyGrantsReadAccessToOneUri(){val uri=Uri.parse("content://test.fileprovider/exports/wallpaper.png");val intent=ImageWallpaper.grant(Intent("test.wallpaper",uri),uri);assertEquals(uri,intent.data);assertEquals(uri,intent.clipData!!.getItemAt(0).uri);assertEquals(1,intent.clipData!!.itemCount);assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION,intent.flags);assertFalse(intent.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION!=0);assertFalse(intent.flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION!=0)}
}
