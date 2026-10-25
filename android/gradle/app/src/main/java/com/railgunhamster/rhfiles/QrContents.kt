package com.railgunhamster.rhfiles

import org.json.JSONObject

internal object QrContents {
  fun describe(value:String):JSONObject {
    require(value.isNotEmpty()&&value.length<=360000){"二维码内容为空或过长"}
    if(value.startsWith("rhfiles-group-"))return runCatching{DeviceGroups.describe(value)}.getOrElse{JSONObject().put("kind","content").put("message",it.message?:"设备组二维码无效").put("uri",value)}
    return JSONObject().put("kind","content").put("uri",value)
  }
}
