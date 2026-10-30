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
class RhVideoPresentationInputTest {
  @Test fun unchangedInputAcceptsItsOwnCommands(){val lease=RhVideoPresentationInput();val input=lease.activate();assertTrue(lease.matches(JSONObject().put("expectedInput",input)));assertTrue(lease.owns(input))}
  @Test fun replacementNeverAcceptsAnOlderInput(){val lease=RhVideoPresentationInput();val old=lease.activate();val fresh=lease.activate();assertNotEquals(old,fresh);assertFalse(lease.matches(JSONObject().put("expectedInput",old)));assertEquals(fresh,lease.current);assertTrue(lease.matches(JSONObject().put("expectedInput",fresh)))}
  @Test fun closeRetiresCallbacksBeforeResourcesAreReleased(){val lease=RhVideoPresentationInput();val input=lease.activate();lease.retire();assertFalse(lease.owns(input));assertFalse(lease.matches(JSONObject().put("expectedInput",input)));assertNull(lease.current)}
  @Test fun activityRecreationCannotResurrectAnOlderAcknowledgement(){val old=RhVideoPresentationInput();val input=old.activate();old.retire();val fresh=RhVideoPresentationInput();assertNotEquals(input,fresh.activate());assertFalse(fresh.matches(JSONObject().put("expectedInput",input)))}
  @Test fun malformedAndUnsafeIdsCannotBeCoercedIntoAnActiveInput(){
    val lease=RhVideoPresentationInput();val input=lease.activate()
    for(value in listOf<Any>(JSONObject.NULL,0,-1,.5,"$input",true,JSONObject(),JSONArray(),9007199254740992L)){
      try{lease.matches(JSONObject().put("expectedInput",value));fail("Invalid input accepted")}catch(_:IllegalArgumentException){}
      assertEquals(input,lease.current)
    }
  }
  @Test fun explicitCurrentStateScriptsRemainCompatibleWithoutAnOptionalGuard(){val lease=RhVideoPresentationInput();assertTrue(lease.matches(JSONObject()));lease.activate();assertTrue(lease.matches(JSONObject()));lease.retire();assertTrue(lease.matches(JSONObject()))}
}
