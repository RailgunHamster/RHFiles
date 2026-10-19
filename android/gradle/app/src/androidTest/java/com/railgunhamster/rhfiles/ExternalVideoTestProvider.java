package com.railgunhamster.rhfiles;
import android.content.*;import android.database.*;import android.net.Uri;import android.os.ParcelFileDescriptor;import java.io.*;
public class ExternalVideoTestProvider extends ContentProvider {
    public boolean onCreate(){return true;}
    public String getType(Uri uri){return "video/mp4";}
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){MatrixCursor cursor=new MatrixCursor(new String[]{"_display_name","_size"});cursor.addRow(new Object[]{"External QA video.mp4",new File(getContext().getCacheDir(),"external-qa.mp4").length()});return cursor;}
    public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {if(!uri.getPath().equals("/video")||!mode.equals("r"))throw new FileNotFoundException("Read-only QA video");return ParcelFileDescriptor.open(new File(getContext().getCacheDir(),"external-qa.mp4"),ParcelFileDescriptor.MODE_READ_ONLY);}
    public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();} public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
}
