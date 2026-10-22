package com.railgunhamster.rhfiles;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** Emulator-only acceptance through the shipped public bridge. Never link to
 * private app constructors: R8 legitimately rewrites/inlines those signatures. */
public class LanServiceInstrumentation extends Instrumentation {
    private Bundle args;private Activity activity;private String connection;
    @Override public void onCreate(Bundle value){super.onCreate(value);args=value;start();}
    private void require(boolean value,String message)throws Exception{if(!value)throw new Exception(message);}
    private WebView find(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}return null;}
    private String eval(String script)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);String[] value={"null"};
        runOnMainSync(()->{WebView web=find(activity.getWindow().getDecorView());if(web==null){latch.countDown();return;}web.evaluateJavascript(script,r->{value[0]=r;latch.countDown();});});
        require(latch.await(15,TimeUnit.SECONDS),"Bridge evaluation timeout");return value[0];
    }
    private Object call(String command,JSONObject p)throws Exception{
        eval("window.__lanCall=null;void api.native("+JSONObject.quote(command)+","+p+").then(value=>window.__lanCall={value}).catch(error=>window.__lanCall={error:String(error)});");
        long deadline=System.currentTimeMillis()+30000;
        do{JSONObject state=new JSONObject(String.valueOf(new JSONTokener(eval("JSON.stringify(window.__lanCall||{})")).nextValue()));if(state.has("error"))throw new Exception(command+": "+state.getString("error"));if(state.has("value"))return state.get("value");Thread.sleep(80);}while(System.currentTimeMillis()<deadline);
        throw new Exception("Bridge operation timeout: "+command);
    }
    private JSONObject object(String command,JSONObject p)throws Exception{return (JSONObject)call(command,p);}
    private JSONObject waitJob(String id,boolean success)throws Exception{
        long deadline=System.currentTimeMillis()+45000;
        do{JSONObject state=object("job.status",new JSONObject().put("id",id));String phase=state.getString("state");if(Arrays.asList("completed","failed","canceled","interrupted").contains(phase)){require(success?phase.equals("completed"):phase.equals("failed"),"Background task: "+state);return state;}Thread.sleep(120);}while(System.currentTimeMillis()<deadline);
        throw new Exception("Background task timeout");
    }
    private String job(String op,JSONObject p)throws Exception{return (String)call("job.start",new JSONObject().put("op",op).put("args",p));}
    private void discoverSelf()throws Exception{
        android.net.nsd.NsdManager nsd=(android.net.nsd.NsdManager)getTargetContext().getSystemService(Context.NSD_SERVICE);
        CountDownLatch registered=new CountDownLatch(1);int[] failure={0};String fingerprint=String.join("",Collections.nCopies(32,"cd"));
        android.net.nsd.NsdServiceInfo info=new android.net.nsd.NsdServiceInfo();info.setServiceName("RHFiles emulator QA");info.setServiceType("_rhfiles._tcp.");info.setPort(49128);info.setAttribute("v","1");info.setAttribute("fp",fingerprint);
        android.net.nsd.NsdManager.RegistrationListener listener=new android.net.nsd.NsdManager.RegistrationListener(){
            public void onServiceRegistered(android.net.nsd.NsdServiceInfo i){registered.countDown();}
            public void onRegistrationFailed(android.net.nsd.NsdServiceInfo i,int code){failure[0]=code;registered.countDown();}
            public void onServiceUnregistered(android.net.nsd.NsdServiceInfo i){}
            public void onUnregistrationFailed(android.net.nsd.NsdServiceInfo i,int code){}
        };String scan=null;
        try{nsd.registerService(info,android.net.nsd.NsdManager.PROTOCOL_DNS_SD,listener);require(registered.await(8,TimeUnit.SECONDS)&&failure[0]==0,"NSD fixture registration: "+failure[0]);
            scan=(String)call("lan.start",new JSONObject().put("protocol","rhfiles"));boolean found=false;JSONObject state=null;long deadline=System.currentTimeMillis()+10000;
            do{state=object("lan.state",new JSONObject().put("id",scan));JSONArray devices=state.getJSONArray("devices");for(int i=0;i<devices.length();i++){JSONObject d=devices.getJSONObject(i);if(d.optString("fingerprint").equals(fingerprint)&&d.getInt("port")==49128)found=true;}if(found||!state.getBoolean("running"))break;Thread.sleep(150);}while(System.currentTimeMillis()<deadline);
            require(found,"Android NSD IPv4/TXT discovery: "+state);
        }finally{if(scan!=null)call("lan.stop",new JSONObject().put("id",scan));try{nsd.unregisterService(listener);}catch(Exception ignored){}}
    }
    private void scannerUi()throws Exception{
        call("automation.enable",new JSONObject().put("enabled",true));
        eval("window.__scanFinished=false;void api.native('connection.scan').then(()=>window.__scanFinished=true).catch(error=>window.__scanError=String(error));");
        long deadline=System.currentTimeMillis()+10000;boolean canceled=false;
        do{JSONArray controls=(JSONArray)call("automation.ui.list",new JSONObject());for(int i=0;i<controls.length();i++){JSONObject c=controls.getJSONObject(i);String label=c.optString("label");if(label.startsWith("Cancel")||label.startsWith("取消")){call("automation.ui.invoke",new JSONObject().put("controlId",c.getString("controlId")));canceled=true;break;}}if(canceled)break;Thread.sleep(150);}while(System.currentTimeMillis()<deadline);
        require(canceled,"Camera scanner cancellation through public native automation");
        deadline=System.currentTimeMillis()+5000;while(!eval("window.__scanFinished===true").equals("true")){require(System.currentTimeMillis()<deadline,"Camera result returned to pairing bridge");Thread.sleep(80);}
        call("automation.enable",new JSONObject().put("enabled",false));
    }
    @Override public void onStart(){Bundle result=new Bundle();File source=null,small=null;
        try{
            require(Build.FINGERPRINT.contains("generic")||Build.MODEL.contains("sdk"),"Owned emulator required");
            getTargetContext().getSharedPreferences("updates-v1",0).edit().putBoolean("autoCheck",false).commit();
            getUiAutomation().grantRuntimePermission(getTargetContext().getPackageName(),android.Manifest.permission.CAMERA);
            if(Build.VERSION.SDK_INT>=33)getUiAutomation().grantRuntimePermission(getTargetContext().getPackageName(),android.Manifest.permission.POST_NOTIFICATIONS);
            Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);activity=startActivitySync(launch);
            long deadline=System.currentTimeMillis()+45000;while(!eval("typeof api!=='undefined'&&typeof api.native==='function'").equals("true")){require(System.currentTimeMillis()<deadline,"Main bridge startup");Thread.sleep(150);}
            byte[] png=android.util.Base64.decode(args.getString("qrBase64"),android.util.Base64.DEFAULT);Bitmap bitmap=BitmapFactory.decodeByteArray(png,0,png.length);require(bitmap!=null,"QR fixture");
            try{List<zxingcpp.BarcodeReader.Result> symbols=new zxingcpp.BarcodeReader().read(bitmap,new Rect(),0);require(symbols.stream().anyMatch(v->args.getString("qrUri").equals(v.getText())),"Actual offline native QR decode");}finally{bitmap.recycle();}
            object("connection.describe",new JSONObject().put("uri",args.getString("qrUri")));scannerUi();
            connection=(String)call("connection.pair",new JSONObject().put("uri",args.getString("uri")).put("name","Emulator LAN QA"));String root="remote://"+connection+"/";
            JSONArray roots=object("list",new JSONObject().put("path",root)).getJSONArray("entries");require(roots.length()==1&&roots.getJSONObject(0).getString("name").equals("Files"),"Shared root listing");String folder=roots.getJSONObject(0).getString("path");
            boolean blocked=false;try{job("delete",new JSONObject().put("sources",new JSONArray().put(folder)));}catch(Exception expected){blocked=expected.getMessage().contains("共享入口");}require(blocked,"Shared root destructive task preflight");
            String dir=(String)call("create",new JSONObject().put("parent",folder).put("name","手机目录").put("directory",true));
            small=new File(getTargetContext().getExternalFilesDir(null),"手机.txt");try(FileOutputStream out=new FileOutputStream(small)){out.write("hello".getBytes("UTF-8"));}
            waitJob(job("copy",new JSONObject().put("sources",new JSONArray().put(small.getAbsolutePath())).put("destination",dir)),true);
            JSONArray children=object("list",new JSONObject().put("path",dir)).getJSONArray("entries");require(children.length()==1&&children.getJSONObject(0).getLong("size")==5,"Native tus upload");
            String renamed=(String)call("rename",new JSONObject().put("path",children.getJSONObject(0).getString("path")).put("name","重命名.txt"));
            waitJob(job("delete",new JSONObject().put("sources",new JSONArray().put(renamed))),false);require(object("list",new JSONObject().put("path",dir)).getJSONArray("entries").length()==1,"Write grant does not grant deletion");
            source=new File(getTargetContext().getExternalFilesDir(null),"rhfiles-lan-"+UUID.randomUUID()+".bin");byte[] data=new byte[2500000];for(int i=0;i<data.length;i++)data[i]=(byte)(i%251);try(FileOutputStream out=new FileOutputStream(source)){out.write(data);}
            JSONObject task=waitJob(job("copy",new JSONObject().put("sources",new JSONArray().put(source.getAbsolutePath())).put("destination",folder)),true);require(task.getLong("bytes")==data.length,"Confirmed transfer progress");
            discoverSelf();
            result.putString("pass","true");result.putString("checks","Minified public bridge; offline QR; camera/result API; shared-root guard; pairing/Keystore; Unicode browse; tus background upload; rename; separate deletion grant; measured 2.5MB copy; Android NSD discovery");finish(Activity.RESULT_OK,result);
        }catch(Throwable error){result.putString("error",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,result);}
        finally{try{if(connection!=null)call("connection.delete",new JSONObject().put("id",connection));}catch(Exception ignored){}if(source!=null)source.delete();if(small!=null)small.delete();}
    }
}
