package com.railgunhamster.rhfiles
import org.junit.Assert.*
import org.junit.Test
class ViewportInsetsTest {
  @Test fun keyboardOcclusionMovesTheWholeUnresizedViewport(){assertEquals(700,ViewportInsets.bottom(2200,0,2200,80,700));assertEquals(80,ViewportInsets.bottom(2200,0,2200,80,0))}
  @Test fun alreadyResizedWebViewDoesNotSubtractKeyboardTwice(){assertEquals(0,ViewportInsets.bottom(2200,60,1440,80,700));assertEquals(300,ViewportInsets.bottom(2200,60,1740,80,700))}
  @Test fun multiWindowAndInvalidValuesStayWithinVisibleBounds(){assertEquals(300,ViewportInsets.bottom(1000,0,1000,40,300));assertEquals(0,ViewportInsets.bottom(0,0,0,40,300));assertEquals(200,ViewportInsets.bottom(1000,0,200,40,5000))}
}
