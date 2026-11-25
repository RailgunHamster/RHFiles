package com.railgunhamster.rhfiles

import org.json.JSONObject

internal object BatchRename {
  data class Change(val path:String, val parent:String, val oldName:String, val name:String, val revision:String?)

  fun changes(args:JSONObject):List<Change> {
    val rows=args.getJSONArray("changes")
    require(rows.length() in 1..1000) { "每项任务可修改 1 至 1000 个名称" }
    val paths=mutableSetOf<String>()
    val targets=mutableSetOf<Pair<String,String>>()
    return List(rows.length()) { i ->
      val row=rows.getJSONObject(i)
      val item=Change(row.getString("path"),row.getString("parent"),row.getString("oldName"),
        SafeFiles.name(row.getString("name")),row.optString("revision").takeIf { it.isNotEmpty() && it!="null" })
      require(item.parent.isNotBlank() && paths.add(item.path) && item.name!=item.oldName) { "来源重复或没有改名" }
      require(targets.add(item.parent.trimEnd('/') to item.name)) { "同一文件夹内目标名称重复：${item.name}" }
      item
    }
  }

  // Document IDs are opaque. Validate membership from actual listings before the first write.
  fun check(storage:NativeStorage, changes:List<Change>, checkpoint:()->Unit) {
    val directories=mutableSetOf<String>()
    for ((parent,group) in changes.groupBy { it.parent }) {
      checkpoint()
      val entries=storage.list(parent)
      val byPath=entries.associateBy { it.path }
      val names=entries.mapTo(mutableSetOf()) { it.name }
      for (item in group) {
        val entry=byPath[item.path] ?: error("来源已经改变或不在此文件夹：${item.oldName}")
        require(entry.name==item.oldName && (item.revision==null || item.revision==(entry.linkRevision?:entry.revision))) {
          "来源已改变，请刷新：${item.oldName}"
        }
        require(!storage.isRemote(item.path) || !storage.remote.isRhFilesRoot(item.path)) { "不能重命名共享入口" }
        require(item.name !in names) { "目标已存在：${item.name}" }
        if(entry.isDir) directories.add(item.path.trimEnd('/'))
      }
    }
    for(change in changes) {
      require(directories.none { dir -> change.parent.trimEnd('/')==dir || change.parent.startsWith("$dir/") }) {
        "请分开重命名文件夹和其中的项目"
      }
    }
  }
}
