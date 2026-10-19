package com.railgunhamster.rhfiles

import java.io.File

/** Never hand two different APKs to the installer under the same content URI. */
internal object UpdateInstallArtifact {
  fun name(version:String,code:Long,sha256:String):String {
    require(version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))&&code>0&&sha256.matches(Regex("[0-9a-f]{64}"))){"更新安装文件标识无效"}
    return "RHFiles-Android-$version-$code-${sha256.take(16)}.apk"
  }
  fun prepare(directory:File,source:File,version:String,code:Long,sha256:String,verify:(File)->Unit):File {
    require(directory.isDirectory||directory.mkdirs()){"无法创建更新安装目录"}
    val target=File(directory,name(version,code,sha256))
    if(target.exists()){verify(target);return target}
    val pending=File(directory,target.name+".preparing")
    try{source.inputStream().use{input->pending.outputStream().use{output->input.copyTo(output)}};verify(pending);check(pending.renameTo(target)){"无法保存独立版本安装包"};return target}
    finally{pending.delete()}
  }
}
