package com.railgunhamster.rhfiles

import org.json.JSONObject

/** A short-lived group introduction, not an independent pairing credential. */
internal object GroupInvitation {
  const val PREFIX="rhfiles-group-invite:v1:"
  fun parse(uri:String):JSONObject {
    val data=DeviceGroupModel.parse(uri,PREFIX)
    require(data.getInt("version")==1&&listOf("groupId","deviceId","fingerprint").all{data.getString(it).matches(Regex("[0-9a-f]{64}"))}){"设备组邀请身份无效"}
    require(data.getString("token").matches(Regex("[A-Za-z0-9_-]{43}"))){"设备组邀请令牌无效"}
    val addresses=data.getJSONArray("endpoints");require(addresses.length() in 1..16){"设备组邀请缺少地址"}
    for(i in 0 until addresses.length())RhFilesConnection.valid(JSONObject().put("url",addresses.getString(i)).put("fingerprint",data.getString("fingerprint")))
    return data
  }
  fun describe(uri:String):JSONObject {val d=parse(uri);return JSONObject().put("uri",uri).put("kind","invitation").put("name",d.optString("groupName",d.optString("deviceName","RHFiles"))).put("deviceName",d.optString("deviceName")).put("groupId",d.getString("groupId")).put("expiresMs",d.getLong("expiresMs"))}
}
