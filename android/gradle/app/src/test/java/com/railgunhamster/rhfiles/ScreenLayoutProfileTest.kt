package com.railgunhamster.rhfiles

import org.junit.Assert.*
import org.junit.Test

class ScreenLayoutProfileTest {
  @Test fun rotationKeepsIdentityWhileFoldedAndUnfoldedDisplaysDiffer(){
    assertEquals(ScreenLayoutProfile.key(1080,2092),ScreenLayoutProfile.key(2092,1080))
    assertEquals(ScreenLayoutProfile.key(1840,2208),ScreenLayoutProfile.key(2208,1840))
    assertNotEquals(ScreenLayoutProfile.key(1080,2092),ScreenLayoutProfile.key(1840,2208))
  }
  @Test fun invalidOrUnmeasuredDisplaysDoNotCreateTemporaryProfiles(){
    for(size in listOf(-1,0,1,100000,Int.MAX_VALUE))assertNull(ScreenLayoutProfile.key(size,2208))
  }
}
