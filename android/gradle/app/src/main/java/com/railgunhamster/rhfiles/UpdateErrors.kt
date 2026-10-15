package com.railgunhamster.rhfiles

internal fun updateFailure(error:Throwable):String {
  val seen=mutableSetOf<Throwable>();val chain=generateSequence(error){it.cause}.takeWhile{seen.add(it)}.take(8).toList()
  val detail=chain.map{e->e.javaClass.simpleName.ifBlank{e.javaClass.name}+": "+e.message?.trim().orEmpty()}.distinct().joinToString("\n").take(2400)
  val hint=when{
    chain.any{it is java.net.UnknownHostException}->"找不到服务器名称。请连接家庭 Wi-Fi；可改用服务器局域网 IP（更新目录与登录配置须一致）。"
    detail.contains("STATUS_LOGON_FAILURE")||detail.contains("STATUS_ACCESS_DENIED")->"SMB 登录或读取权限被拒绝。请选择登录配置，或填写账号和密码；支持 SERVER-HOME\\Administrator 格式。"
    detail.contains("STATUS_BAD_NETWORK_NAME")->"服务器上没有这个共享名。请检查服务器目录中的共享名称。"
    detail.contains("STATUS_OBJECT_NAME_NOT_FOUND")||detail.contains("STATUS_OBJECT_PATH_NOT_FOUND")->"更新目录或清单不存在。目录必须包含 releases.android.json。"
    chain.any{it is java.net.SocketTimeoutException||it is java.net.ConnectException}->"连接失败或超时。请确认同一局域网、服务器在线及 SMB 端口可达；HTTP 代理不用于 SMB。"
    else->"请根据下方系统原因检查更新源、目录及登录配置；可以复制诊断信息。"
  }
  return hint+"\n"+detail
}
