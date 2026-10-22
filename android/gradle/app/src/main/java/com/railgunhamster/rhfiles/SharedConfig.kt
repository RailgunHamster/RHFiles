package com.railgunhamster.rhfiles

import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** A portable, password-free schema and three-way merge; never whole-device settings. */
internal object SharedConfig {
  const val LIMIT=1024*1024
  val fields=setOf("name","type","host","port","share","domain","url","username","insecure")
  fun empty()=JSONObject().put("schemaVersion",1).put("profiles",JSONArray()).put("favorites",JSONArray())
  fun canonical(value:Any?):String=when(value){
    null,JSONObject.NULL->"null"
    is JSONObject->value.keys().asSequence().sorted().joinToString(",","{","}"){JSONObject.quote(it)+":"+canonical(value.get(it))}
    is JSONArray->(0 until value.length()).joinToString(",","[","]"){canonical(value.get(it))}
    else->JSONArray().put(value).toString().let{it.substring(1,it.length-1)}
  }
  fun same(a:Any?,b:Any?)=canonical(a)==canonical(b)
  fun parse(text:String):JSONObject {var depth=0;var quoted=false;var escaped=false;for(ch in text){if(quoted){if(escaped)escaped=false else if(ch=='\\')escaped=true else if(ch=='"')quoted=false}else when(ch){'"'->quoted=true;'[','{'->{depth++;require(depth<=16){"同步配置嵌套过深"}};']','}'->depth--}};return JSONObject(text)}
  fun profile(raw:JSONObject):JSONObject {
    val value=JSONObject();for(key in fields)if(raw.has(key))value.put(key,raw.get(key))
    return value
  }
  fun snapshot(profiles:JSONArray,favorites:JSONArray):JSONObject {
    val out=empty();for(i in 0 until profiles.length()){val p=profiles.getJSONObject(i);out.getJSONArray("profiles").put(JSONObject().put("id",p.getString("id")).put("config",profile(p.getJSONObject("config"))))}
    val portableIds=(0 until profiles.length()).map{profiles.getJSONObject(it).getString("id")}.toSet()
    for(i in 0 until favorites.length()){val f=favorites.getJSONObject(i);if(f.optString("path").startsWith("remote://")&&Uri.parse(f.optString("path")).host in portableIds)out.getJSONArray("favorites").put(favorite(f))}
    return out
  }
  fun favorite(f:JSONObject):JSONObject=JSONObject().also{out->for(key in listOf("name","path","isDir","label","parentPath"))if(f.has(key)&&!f.isNull(key))out.put(key,f.get(key))}
  fun validate(doc:JSONObject,validateProfile:(JSONObject)->Unit){
    require(doc.toString().toByteArray().size<=LIMIT&&doc.opt("schemaVersion") is Int&&doc.getInt("schemaVersion")==1&&doc.keys().asSequence().toSet()==setOf("schemaVersion","profiles","favorites")){"不是支持的 RHFiles 同步配置，当前配置未更改"}
    val profiles=doc.getJSONArray("profiles");require(profiles.length()<=200){"同步网络位置超过上限"};val ids=mutableSetOf<String>()
    for(i in 0 until profiles.length()){
      val p=profiles.getJSONObject(i);require(p.keys().asSequence().toSet()==setOf("id","config")){"同步网络位置字段无效"};val id=p.getString("id")
      require(UUID.fromString(id).toString()==id&&ids.add(id)){"网络位置 ID 无效或重复"}
      val c=p.getJSONObject("config");require(c.keys().asSequence().all{it in fields}){"同步文件不能包含密码或未知配置"}
      for(key in c.keys())require(if(key=="port")c.get(key).let{it is Int||it is Long} else if(key=="insecure")c.get(key) is Boolean else c.get(key) is String){"网络位置字段类型无效"}
      if(c.has("port"))require(c.getLong("port") in 1L..65535L){"网络位置端口无效"}
      validateProfile(c)
    }
    val favorites=doc.getJSONArray("favorites");require(favorites.length()<=100){"同步收藏超过上限"};val paths=mutableSetOf<String>()
    for(i in 0 until favorites.length()){
      val f=favorites.getJSONObject(i);require(f.keys().asSequence().all{it in setOf("name","path","isDir","label","parentPath")}){"同步收藏包含未知字段"}
      require(f.opt("name") is String&&f.getString("name").length in 1..1024&&f.opt("path") is String&&f.getString("path").length<=8192){"同步收藏内容无效"}
      if(f.has("label"))require(f.opt("label") is String&&f.getString("label").isNotBlank()&&f.getString("label").length<=1024){"收藏名称无效"}
      if(f.has("isDir"))require(f.get("isDir") is Boolean){"收藏类型无效"}
      val path=f.getString("path");val uri=Uri.parse(path);require(uri.scheme=="remote"&&uri.host in ids&&uri.authority==uri.host&&uri.query==null&&uri.fragment==null&&paths.add(path)){"同步收藏引用了缺失或重复的网络位置"}
      uri.pathSegments.forEach{SafeFiles.name(it)}
      if(f.has("parentPath")){
        require(f.opt("parentPath") is String&&f.getString("parentPath").length<=8192){"收藏上级路径无效"}
        val parent=Uri.parse(f.getString("parentPath"));require(parent.scheme=="remote"&&parent.authority==uri.host&&parent.query==null&&parent.fragment==null){"收藏上级路径无效"};parent.pathSegments.forEach{SafeFiles.name(it)}
      }
    }
  }
  private fun records(doc:JSONObject,key:String,id:String)=(0 until doc.getJSONArray(key).length()).associate{val item=doc.getJSONArray(key).getJSONObject(it);item.getString(id) to item}
  private fun favoritePaths(doc:JSONObject)=(0 until doc.getJSONArray("favorites").length()).map{doc.getJSONArray("favorites").getJSONObject(it).getString("path")}
  /** Merge pairwise order changes, not filenames. Independent insertions get a
   * deterministic tie-break; incompatible reorder cycles require a choice. */
  private fun favoriteOrder(keys:Set<String>,base:JSONObject,local:JSONObject,remote:JSONObject,choice:String?,conflicts:JSONArray):List<String> {
    val b=favoritePaths(base);val l=favoritePaths(local);val r=favoritePaths(remote)
    val positions=listOf(b,l,r).map{it.withIndex().associate{v->v.value to v.index}}
    fun before(p:Map<String,Int>,x:String,y:String):Boolean? {val a=p[x]?:return null;val z=p[y]?:return null;return a<z}
    val nodes=keys.sorted();val edges=nodes.associateWith{mutableSetOf<String>()};val degree=nodes.associateWith{0}.toMutableMap();var ambiguous=false
    for(i in nodes.indices)for(j in i+1 until nodes.size){
      val x=nodes[i];val y=nodes[j];val bv=before(positions[0],x,y);val lv=before(positions[1],x,y);val rv=before(positions[2],x,y)
      val selected=when{lv==null->rv?:bv;rv==null->lv;lv==rv->lv;lv==bv->rv;rv==bv->lv;else->{ambiguous=true;if(choice=="remote")rv else lv}}
      if(selected!=null){val from=if(selected)x else y;val to=if(selected)y else x;if(edges.getValue(from).add(to))degree[to]=degree.getValue(to)+1}
    }
    val ready=java.util.PriorityQueue<String>();degree.filterValues{it==0}.keys.forEach(ready::add);val result=mutableListOf<String>()
    while(ready.isNotEmpty()){val next=ready.remove();result.add(next);for(to in edges.getValue(next)){degree[to]=degree.getValue(to)-1;if(degree[to]==0)ready.add(to)}}
    if(!ambiguous&&result.size==keys.size)return result
    conflicts.put(JSONObject().put("kind","favoriteOrder").put("id","favorites").put("local",JSONArray(l)).put("remote",JSONArray(r)))
    val primary=if(choice=="remote")r else l;val secondary=if(choice=="remote")l else r
    return (primary+secondary+b+nodes).filter{it in keys}.distinct()
  }
  data class Merged(val document:JSONObject,val conflicts:JSONArray)
  fun merge(base:JSONObject,local:JSONObject,remote:JSONObject,choice:String?=null):Merged {
    require(choice==null||choice in listOf("local","remote")){"冲突选项无效"}
    val out=empty();val conflicts=JSONArray()
    for((key,id) in listOf("profiles" to "id","favorites" to "path")){
      val b=records(base,key,id);val l=records(local,key,id);val r=records(remote,key,id)
      for(k in (b.keys+l.keys+r.keys).sorted()){
        val bv=b[k];val lv=l[k];val rv=r[k]
        val selected=when{same(lv,rv)->lv;same(lv,bv)->rv;same(rv,bv)->lv;else->{conflicts.put(JSONObject().put("kind",key).put("id",k).put("local",lv?:JSONObject.NULL).put("remote",rv?:JSONObject.NULL));if(choice=="remote")rv else lv}}
        if(selected!=null)out.getJSONArray(key).put(selected)
      }
    }
    val ids=records(out,"profiles","id").keys.toMutableSet()
    // A concurrently added bookmark must not silently resurrect a removed server.
    val favorites=out.getJSONArray("favorites");val kept=JSONArray()
    for(i in 0 until favorites.length()){
      val f=favorites.getJSONObject(i);if(Uri.parse(f.getString("path")).host in ids)kept.put(f)
      else {
        conflicts.put(JSONObject().put("kind","favorites").put("id",f.getString("path")).put("local",records(local,"favorites","path")[f.getString("path")]?:JSONObject.NULL).put("remote",records(remote,"favorites","path")[f.getString("path")]?:JSONObject.NULL))
        if(choice!=null){val id=Uri.parse(f.getString("path")).host;val selected=records(if(choice=="remote")remote else local,"profiles","id")[id];if(selected!=null){if(ids.add(id!!))out.getJSONArray("profiles").put(selected);kept.put(f)}}
      }
    }
    out.put("favorites",kept);val byPath=records(out,"favorites","path")
    out.put("favorites",JSONArray(favoriteOrder(byPath.keys,base,local,remote,choice,conflicts).map{byPath.getValue(it)}));return Merged(out,conflicts)
  }
  fun localFavorites(current:JSONArray,shared:JSONArray):JSONArray {
    val out=JSONArray();var next=0
    for(i in 0 until current.length()){val f=current.getJSONObject(i);if(!f.getString("path").startsWith("remote://"))out.put(f)else if(next<shared.length())out.put(shared.getJSONObject(next++))}
    while(next<shared.length())out.put(shared.getJSONObject(next++));require(out.length()<=100){"合并后收藏超过 100 项，请先整理收藏"};return out
  }
  // Remember only successfully uploaded LOCAL deltas before UI acknowledgement.
  // Remote-only additions remain unacknowledged, so a crash cannot turn them
  // into apparent local deletions on the next three-way merge.
  fun receipt(base:JSONObject,local:JSONObject,merged:JSONObject):JSONObject {
    val out=empty()
    for((key,id) in listOf("profiles" to "id","favorites" to "path")){
      val b=records(base,key,id).toMutableMap();val l=records(local,key,id);val m=records(merged,key,id)
      for(k in (b.keys+l.keys).toSet())if(!same(l[k],b[k])&&same(m[k],l[k])){if(l[k]==null)b.remove(k)else b[k]=l.getValue(k)}
      val order=if(key=="favorites"){
        val localOrder=favoritePaths(local).filter{it in b};val committedOrder=favoritePaths(merged).filter{it in b}
        if(localOrder==committedOrder)localOrder else (favoritePaths(base)+localOrder+b.keys.sorted()).filter{it in b}.distinct()
      }else b.keys.sorted()
      order.forEach{out.getJSONArray(key).put(b.getValue(it))}
    }
    return out
  }
}
