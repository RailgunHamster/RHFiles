package com.railgunhamster.rhfiles

import org.junit.Assert.*
import org.junit.Test

class MediaPageSwipeTest {
  @Test fun shortSlowSwipesWorkOnBothPhonesAndTablets(){
    for(width in listOf(320f,400f,800f,1280f,2560f)){
      assertEquals(1,MediaPageSwipe.direction(-48f,2f,width,0f))
      assertEquals(-1,MediaPageSwipe.direction(48f,2f,width,0f))
    }
  }
  @Test fun smallFlicksNeedMatchingDirectionAndVerticalMovementStaysSeparate(){
    assertEquals(1,MediaPageSwipe.direction(-18f,2f,1280f,-.6f))
    assertEquals(0,MediaPageSwipe.direction(-18f,2f,1280f,.6f))
    assertEquals(0,MediaPageSwipe.direction(-8f,0f,400f,-2f))
    assertEquals(0,MediaPageSwipe.direction(-90f,120f,400f,-2f))
  }
}
