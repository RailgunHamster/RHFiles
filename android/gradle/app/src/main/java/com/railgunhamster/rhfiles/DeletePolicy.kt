package com.railgunhamster.rhfiles

import org.json.JSONObject

/** One deletion policy shared by the file list and both media viewers. */
internal object DeletePolicy {
  fun describe(storage:NativeStorage,paths:List<String>):JSONObject {
    require(paths.isNotEmpty()&&paths.size<=1000){"请选择 1–1000 个文件"}
    val local=paths.all{!storage.isRemote(it)&&!storage.isDocument(it)}
    val remote=paths.all{storage.isRemote(it)}&&storage.remote.canRecycle(paths)
    return JSONObject().put("recycle",local||remote).put("kind",if(local)"local"else if(remote)"remote"else"permanent")
      .put("message",if(local)"移入 RHFiles 回收站，可在首页恢复。"else if(remote)"移入目标电脑的回收站，可在那台电脑恢复。"else"本次为永久删除，无法撤销。")
  }
}
