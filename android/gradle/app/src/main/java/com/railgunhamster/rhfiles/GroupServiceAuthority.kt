package com.railgunhamster.rhfiles

import androidx.annotation.Keep
import org.json.JSONObject

/** Private JNI callback, not a web/automation endpoint. The shared Rust server
 * verifies the challenge/signatures and enforces paths, grants and WebDAV locks.
 * This adapter only uses the existing Android Keystore/group store. */
@Keep
internal class GroupServiceAuthority {
  @Keep fun invoke(operation:String,encoded:String):String = try {
    require(encoded.toByteArray(Charsets.UTF_8).size<=200000){"设备组服务参数过大"}
    JSONObject().put("result",DeviceGroups.serverOperation(operation,JSONObject(encoded))).toString()
  }catch(error:Exception){
    val message=error.message?.take(240)?:"设备组状态不可用"
    val code=if(operation in listOf("access","packet","accept")){
      if(message.contains("未向")||message.contains("没有邀请"))"forbidden"else"unauthorized"
    }else "invalid_group"
    JSONObject().put("error",JSONObject().put("code",code).put("message",message)).toString()
  }
}

/** Loaded by the existing Tauri Rust library; methods are never web-exported. */
@Keep
internal object GroupServiceNative {
  external fun start(config:String,authority:GroupServiceAuthority):String
  external fun state():String
  external fun advertise():String
  external fun stop():String
}
