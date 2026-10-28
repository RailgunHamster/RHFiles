package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoGridInputsTest {
  private fun rejects(inputs:List<Long>,target:Int,args:JSONObject){try{RhVideoGridInputs.check(inputs,target,args);fail("Old/invalid input accepted: $args")}catch(_:IllegalArgumentException){}}
  @Test fun unchangedDecoderAcceptsItsOwnControl(){RhVideoGridInputs.check(listOf(11,12),1,JSONObject().put("expectedInput",12))}
  @Test fun returningToTheSameGroupDoesNotResurrectOldCellControls(){rejects(listOf(21,22),0,JSONObject().put("expectedInput",11).put("expectedOffset",0).put("expectedLease","same"))}
  @Test fun aCanvasCanBindAnAllPlayerIntentToItsOwnInput(){RhVideoGridInputs.check(listOf(11,12),-1,JSONObject().put("expectedInput",12).put("inputTarget",1));rejects(listOf(11,13),-1,JSONObject().put("expectedInput",12).put("inputTarget",1))}
  @Test fun allPlayerSlidersOwnEveryInputAndTheirOrder(){val a=JSONObject().put("expectedInputs",JSONArray(listOf(11,12)));RhVideoGridInputs.check(listOf(11,12),-1,a);rejects(listOf(11,13),-1,a);rejects(listOf(12,11),-1,a);rejects(listOf(11),-1,a)}
  @Test fun rotationAndStopCannotReuseAnOldAllPlayerGesture(){rejects(listOf(21,22),-1,JSONObject().put("expectedInputs",JSONArray(listOf(11,12))));rejects(emptyList(),-1,JSONObject().put("expectedInputs",JSONArray()))}
  @Test fun malformedIdsCannotBeCoercedIntoCurrentInputs(){for(value in listOf<Any>("11",true,0,-1,11.5,JSONObject.NULL))rejects(listOf(11),0,JSONObject().put("expectedInput",value));rejects(listOf(11),9,JSONObject().put("expectedInput",11))}
  @Test fun explicitCurrentStateScriptsRemainCompatibleWithoutAnOptionalGuard(){RhVideoGridInputs.check(listOf(11,12),0,JSONObject())}
}
