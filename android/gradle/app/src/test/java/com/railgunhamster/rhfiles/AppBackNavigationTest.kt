package com.railgunhamster.rhfiles

import org.junit.Assert.*
import org.junit.Test

class AppBackNavigationTest {
  @Test fun consumedBackDoesNotLeaveTheActivity() {
    var exits = 0
    AppBackNavigation({ script, reply -> assertTrue(script.contains("rhfilesHandleBack")); reply("true") }, { exits++ }).back()
    assertEquals(0, exits)
  }
  @Test fun onlyExplicitHomeResultLeavesTheActivity() {
    for (result in listOf<String?>(null, "null", "undefined", "true", "false")) {
      var exits = 0
      AppBackNavigation({ _, reply -> reply(result) }, { exits++ }).back()
      assertEquals(if (result == "false") 1 else 0, exits)
    }
  }
  @Test fun repeatedGesturesDoNotOvertakeAnUnresolvedBack() {
    var callback: ((String?) -> Unit)? = null
    var evaluations = 0
    var exits = 0
    val navigation = AppBackNavigation({ _, reply -> evaluations++; callback = reply }, { exits++ })
    navigation.back(); navigation.back()
    assertEquals(1, evaluations); assertEquals(0, exits)
    callback!!("true"); navigation.back()
    assertEquals(2, evaluations); assertEquals(0, exits)
    callback!!("false"); assertEquals(1, exits)
  }
}
