package com.railgunhamster.rhfiles

internal fun updateFailure(error:Throwable,source:String="cnb",installing:Boolean=false):String {
  val seen=mutableSetOf<Throwable>();val chain=generateSequence(error){it.cause}.takeWhile{seen.add(it)}.take(8).toList()
  val detail=chain.map{e->e.javaClass.simpleName.ifBlank{e.javaClass.name}+": "+e.message?.trim().orEmpty()}.distinct().joinToString("\n").take(2400)
  val hint=when{
    installing->"安装更新失败，请核对下方版本和系统原因；不会卸载或清除数据。"
    source=="gitee"&&detail.contains("HTTP 403")->"Gitee 拒绝了更新请求，可能是访问限制或限流；不是手机存储权限问题。可稍后重试或临时切换 GitHub 更新源，不需要填写发布令牌。"
    source=="cnb"&&detail.contains("HTTP 403")->"CNB 拒绝了公开更新请求。请检查仓库是否公开、网络或 HTTP 代理设置；可切换 GitHub，不需要填写发布令牌。"
    chain.any{it is java.net.UnknownHostException}->"无法解析更新服务器域名。请检查手机联网、DNS 和 HTTP 代理设置；无需填写发布令牌。"
    chain.any{it is java.net.SocketTimeoutException||it is java.net.ConnectException}->"连接更新服务器失败或超时。请检查手机联网、更新源和 HTTP 代理设置，或切换另一个更新源。"
    else->"请根据下方系统原因检查更新源和网络；可以复制诊断信息。"
  }
  return hint+"\n"+detail
}
