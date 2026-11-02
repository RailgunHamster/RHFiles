package com.railgunhamster.rhfiles

import android.content.Context
import org.json.JSONObject

/** Local resource policy, not a group grant; takes effect on new file tasks. */
internal object DeviceTransferSettings {
  fun validate(value:JSONObject):JSONObject {
    require(value.keys().asSequence().toSet()==setOf("parallelism","rateMiB")){"传输配置字段无效"}
    val streams=value.getDouble("parallelism");val rate=value.getDouble("rateMiB")
    require(streams.isFinite()&&streams%1==0.0&&streams in 1.0..4.0&&rate.isFinite()&&rate in 0.0..1000.0){"下载并发必须为 1–4，限速必须为 0–1000 MiB/s"}
    return JSONObject().put("parallelism",streams.toInt()).put("rateMiB",rate)
  }
  fun read(context:Context):JSONObject {
    val saved=context.getSharedPreferences("device-transfer-v1",Context.MODE_PRIVATE).getString("config",null)
    return if(saved==null)JSONObject().put("parallelism",2).put("rateMiB",0)else validate(JSONObject(saved))
  }
  fun save(context:Context,value:JSONObject):JSONObject {
    val next=validate(value)
    require(context.getSharedPreferences("device-transfer-v1",Context.MODE_PRIVATE).edit().putString("config",next.toString()).commit()){"无法保存下载配置"}
    return next
  }
}
