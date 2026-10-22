package com.railgunhamster.rhfiles;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import org.json.*;
import java.io.*;
import java.util.*;

/** Emulator only. Uses a desktop isolated fixture via adb reverse, never a
 * user's share, Windows credentials, real phone, or external Internet service. */
public class LanServiceInstrumentation extends Instrumentation {
    private Bundle args;
    @Override public void onCreate(Bundle value){super.onCreate(value);args=value;start();}
    private void require(boolean value,String message)throws Exception{if(!value)throw new Exception(message);}
    @Override public void onStart(){
        Bundle result=new Bundle();String id=null;File source=null;
        RemoteStorage store=new RemoteStorage(getTargetContext(),null,null);
        try {
            require(android.os.Build.FINGERPRINT.contains("generic")||android.os.Build.MODEL.contains("sdk"),"Emulator required");
            getTargetContext().getSharedPreferences("updates-v1",0).edit().putBoolean("autoCheck",false).commit();
            JSONObject config=RhFilesConnection.Companion.pair(args.getString("uri"),"Emulator LAN QA");
            require(config.getString("url").startsWith("https://127.0.0.1:"),"Loopback fixture required");
            id=store.save(config);String root="remote://"+id+"/";
            List<NativeEntry> roots=store.list(root);require(roots.size()==1&&roots.get(0).getName().equals("Files"),"Shared root listing");
            String folder=roots.get(0).getPath();NativeEntry text=store.list(folder).stream().filter(e->e.getName().equals("中文.txt")).findFirst().orElseThrow();
            for(String operation:Arrays.asList("move","delete")){boolean blocked=false;try{FileTasks.INSTANCE.start(getTargetContext(),operation,new JSONObject().put("sources",new JSONArray().put(folder)).put("destination",folder));}catch(IllegalArgumentException expected){blocked=expected.getMessage().contains("共享入口");}require(blocked,"Shared root destructive task preflight");}
            try(RemoteStorage.MediaInput media=store.mediaInput(text.getPath(),4)){require(media.getTotalLength()==10,"Range total");byte[] bytes=new byte[6];new DataInputStream(media.getStream()).readFully(bytes);require(new String(bytes,"UTF-8").equals("456789"),"Range content");}
            String dir=store.create(folder,"手机目录",true);String target=store.destination(dir,"手机.txt");
            store.uploadNew(target,new ByteArrayInputStream("hello".getBytes("UTF-8")),5,n->kotlin.Unit.INSTANCE);
            require(store.stat(target).getSize()==5,"Upload stat");String renamed=store.rename(target,"重命名.txt");
            boolean denied=false;try{store.delete(renamed);}catch(Exception expected){denied=true;}require(denied,"Write grant must not grant delete");
            source=new File(getTargetContext().getExternalFilesDir(null),"rhfiles-lan-"+UUID.randomUUID()+".bin");
            byte[] data=new byte[2500000];for(int i=0;i<data.length;i++)data[i]=(byte)(i%251);try(FileOutputStream out=new FileOutputStream(source)){out.write(data);}
            String job=FileTasks.INSTANCE.start(getTargetContext(),"copy",new JSONObject().put("sources",new JSONArray().put(source.getAbsolutePath())).put("destination",folder));
            long deadline=System.currentTimeMillis()+45000;JSONObject state;
            do{state=FileTasks.INSTANCE.status(getTargetContext(),job);if(state.getString("state").equals("completed"))break;require(!Arrays.asList("failed","canceled","interrupted").contains(state.getString("state")),"Background copy: "+state.optString("message")+" "+state.optJSONArray("failures"));require(System.currentTimeMillis()<deadline,"Background copy timeout");Thread.sleep(100);}while(true);
            require(state.getLong("bytes")==data.length,"Confirmed byte progress");
            // Output names are checked against the exact source below; do not
            // rely on job IDs being embedded in the user-visible final name.
            String expected=source.getName();require(store.list(folder).stream().anyMatch(e->e.getName().equals(expected)&&e.getSize()==data.length),"Background publish");
            result.putString("pass","true");result.putString("checks","Android Keystore pairing; native shared root and Unicode listing; media Range; tus upload; rename; separate delete grant; real background 2.5MB copy and confirmed progress");
            finish(Activity.RESULT_OK,result);
        }catch(Throwable error){result.putString("error",String.valueOf(error));finish(Activity.RESULT_CANCELED,result);}
        finally{if(id!=null)try{store.remove(id);}catch(Exception ignored){}if(source!=null)source.delete();}
    }
}
