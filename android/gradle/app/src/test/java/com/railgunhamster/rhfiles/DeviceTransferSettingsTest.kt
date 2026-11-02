package com.railgunhamster.rhfiles

import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class DeviceTransferSettingsTest {
  @Test fun policyIsLocalPersistedAndStrictlyBounded(){
    val context=RuntimeEnvironment.getApplication()
    context.getSharedPreferences("device-transfer-v1",0).edit().clear().commit()
    assertEquals(2,DeviceTransferSettings.read(context).getInt("parallelism"))
    DeviceTransferSettings.save(context,JSONObject().put("parallelism",4).put("rateMiB",2.5))
    assertEquals(2.5,DeviceTransferSettings.read(context).getDouble("rateMiB"),0.0)
    for(value in listOf(JSONObject().put("parallelism",0).put("rateMiB",0),JSONObject().put("parallelism",2.5).put("rateMiB",0),JSONObject().put("parallelism",2).put("rateMiB",-1),JSONObject().put("parallelism",2).put("rateMiB",0).put("token","not-allowed"))){try{DeviceTransferSettings.save(context,value);fail("Invalid policy saved")}catch(_:IllegalArgumentException){}}
    assertEquals(4,DeviceTransferSettings.read(context).getInt("parallelism"))
  }
}
