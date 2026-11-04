package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class RhVideoSharedContractTest{
  private val contract=RhVideoSharedContract(JSONObject().put("business_operations",JSONArray().put(JSONObject().put("id","GET /api/v1/videos")).put(JSONObject().put("id","PUT /api/v1/favorites/video/{id}"))))
  private fun denied(run:()->Unit){try{run();fail("unsafe request accepted")}catch(_:IllegalArgumentException){}}
  @Test fun routesKeepTheExactVerbAndStayOnTheConfiguredOrigin(){
    assertEquals("api/v1/videos?summary=true",contract.path("GET","/api/v1/videos?summary=true"))
    assertEquals("api/v1/favorites/video/id-1",contract.path("PUT","/api/v1/favorites/video/id-1"))
    for(path in listOf("//evil/api/v1/videos","https://evil/api/v1/videos","/api/v1/../videos","/api/v1/%2e%2e/videos","/api/v1/auth/refresh"))denied{contract.path("POST",path)}
    denied{contract.path("DELETE","/api/v1/videos")}
  }
  @Test fun mediaAdapterAcceptsOnlyKnownVideoAndImagePaths(){
    assertFalse(RhVideoSharedContract.media("api/v1/videos/test/play?quality=lowest").second)
    assertTrue(RhVideoSharedContract.media("api/v1/videos/test/thumbnail").second)
    for(path in listOf("api/v1/system/restart","api/v1/auth/me","https://evil/film.mp4","storage/../private","api/v1/videos/test/play?url=https://evil"))denied{RhVideoSharedContract.media(path)}
  }
}
