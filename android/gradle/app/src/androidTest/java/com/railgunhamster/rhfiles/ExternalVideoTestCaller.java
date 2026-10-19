package com.railgunhamster.rhfiles;
import android.app.Activity;import android.content.*;import android.net.Uri;import android.os.Bundle;import java.io.*;
public class ExternalVideoTestCaller extends Activity {
    public void onCreate(Bundle saved){super.onCreate(saved);try{
        byte[] bytes=getIntent().getByteArrayExtra("video");if(bytes==null||bytes.length>512*1024)throw new IOException("Bounded synthetic fixture required");
        try(FileOutputStream stream=new FileOutputStream(new File(getCacheDir(),"external-qa.mp4"))){stream.write(bytes);}
        Uri uri=Uri.parse("content://com.railgunhamster.rhfiles.test.media/video");
        Intent target=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"video/mp4").setPackage("com.railgunhamster.rhfiles").putExtra(Intent.EXTRA_TITLE,"External QA video").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        target.setClipData(ClipData.newRawUri("QA video",uri));startActivity(target);
    }catch(Exception error){throw new RuntimeException(error);}finally{finish();}}
}
