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
    for(size in listOf(-1,0,1,100000,Int.MAX_VALUE)){assertNull(ScreenLayoutProfile.key(size,2208));assertNull(ScreenLayoutProfile.orientation(size,2208,0))}
  }
  @Test fun fullDisplayAspectSeparatesDirectionsIndependentOfNaturalDeviceRotation(){
    for(rotation in 0..3){
      assertEquals("portrait",ScreenLayoutProfile.orientation(1080,2092,rotation))
      assertEquals("landscape",ScreenLayoutProfile.orientation(2092,1080,rotation))
      assertEquals("portrait",ScreenLayoutProfile.orientation(1840,2208,rotation))
      assertEquals("landscape",ScreenLayoutProfile.orientation(2208,1840,rotation))
    }
  }
  @Test fun squareDisplayUsesRotationParityAndReverseRotationsRestoreSameDirection(){
    assertEquals("portrait",ScreenLayoutProfile.orientation(2000,2000,0))
    assertEquals("landscape",ScreenLayoutProfile.orientation(2000,2000,1))
    assertEquals("portrait",ScreenLayoutProfile.orientation(2000,2000,2))
    assertEquals("landscape",ScreenLayoutProfile.orientation(2000,2000,3))
  }
}
