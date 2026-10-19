package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class SharedFavoriteOrderTest {
  private fun doc(vararg names:String)=SharedConfig.empty().put("favorites",JSONArray(names.map{JSONObject().put("name",it).put("path","remote://server/$it").put("isDir",true)})).put("profiles",JSONArray().put(JSONObject().put("id","server").put("config",JSONObject())))
  private fun names(value:JSONObject)=(0 until value.getJSONArray("favorites").length()).map{value.getJSONArray("favorites").getJSONObject(it).getString("name")}
  private fun merge(b:JSONObject,l:JSONObject,r:JSONObject,choice:String?=null)=SharedConfig.merge(b,l,r,choice)
  @Test fun firstDownloadAndUnchangedSyncKeepAuthoredOrderInsteadOfSortingNames(){val local=doc("Z","A","M");val downloaded=merge(SharedConfig.empty(),SharedConfig.empty(),local);assertEquals(listOf("Z","A","M"),names(downloaded.document));assertEquals(0,downloaded.conflicts.length());assertEquals(names(local),names(merge(local,local,local).document))}
  @Test fun eitherDevicesReorderPropagatesWithoutAnEditConflict(){val b=doc("A","B","C");val l=doc("C","A","B");assertEquals(names(l),names(merge(b,l,b).document));assertEquals(names(l),names(merge(b,b,l).document));assertEquals(0,merge(b,b,l).conflicts.length())}
  @Test fun concurrentInsertionsStayNearTheirAnchorsAndConverge(){val b=doc("A","B");val l=doc("A","L","B");val r=doc("A","R","B");val m=merge(b,l,r);assertEquals(listOf("A","L","R","B"),names(m.document));assertEquals(names(m.document),names(merge(b,r,l).document));assertEquals(0,m.conflicts.length())}
  @Test fun incompatibleReorderCycleRequiresExplicitChoiceButDoesNotDropNewBookmarks(){val b=doc("A","B","C");val l=doc("B","A","C","L");val r=doc("A","C","B","R");val m=merge(b,l,r);assertTrue((0 until m.conflicts.length()).any{m.conflicts.getJSONObject(it).getString("kind")=="favoriteOrder"});assertEquals(listOf("B","A","C","L","R"),names(merge(b,l,r,"local").document));assertEquals(listOf("A","C","B","R","L"),names(merge(b,l,r,"remote").document))}
  @Test fun localOnlyBookmarksKeepTheirRelativePositionsWhileRemoteOrderBecomesCommon(){val current=JSONArray().put(JSONObject().put("name","local1").put("path","/storage/1")).put(doc("B").getJSONArray("favorites").getJSONObject(0)).put(JSONObject().put("name","local2").put("path","/storage/2")).put(doc("A").getJSONArray("favorites").getJSONObject(0));val result=SharedConfig.localFavorites(current,doc("A","B","C").getJSONArray("favorites"));assertEquals(listOf("local1","A","local2","B","C"),(0 until result.length()).map{result.getJSONObject(it).getString("name")})}
  @Test fun receiptsRememberOwnUploadedOrderButNotUnappliedCloudOrderOrNewCloudItems(){val b=doc("A","B","C");val l=doc("C","A","B");assertEquals(names(l),names(SharedConfig.receipt(b,l,l)));val cloud=doc("B","A","C","REMOTE");assertEquals(names(b),names(SharedConfig.receipt(b,b,cloud)));val changedAgain=doc("A","C","B");assertEquals(0,merge(SharedConfig.receipt(b,l,l),changedAgain,l).conflicts.length())}
  private fun permutations(values:List<String>):List<List<String>> = if(values.isEmpty())listOf(emptyList())else values.flatMap{v->permutations(values-v).map{listOf(v)+it}}
  @Test fun allThreeItemOrderCombinationsConvergeOrExplicitlyReportConflict(){val orders=permutations(listOf("A","B","C"));for(b in orders)for(l in orders)for(r in orders){val bd=doc(*b.toTypedArray());val ld=doc(*l.toTypedArray());val rd=doc(*r.toTypedArray());val m=merge(bd,ld,rd);val reversed=merge(bd,rd,ld);assertEquals(m.conflicts.length(),reversed.conflicts.length());assertEquals(setOf("A","B","C"),names(m.document).toSet());if(m.conflicts.length()==0)assertEquals(names(m.document),names(reversed.document));assertEquals(names(m.document),names(merge(m.document,m.document,m.document).document))}}
}
