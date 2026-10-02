package com.railgunhamster.rhfiles

import java.io.*
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.apache.commons.compress.archivers.ArchiveInputStream
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream

/** Platform-independent safety rules shared by jobs and tested on the JVM. */
object SafeFiles {
  const val TEXT_LIMIT = 1024 * 1024
  fun name(value: String): String {
    require(value.isNotBlank() && value != "." && value != ".." && value.length <= 240 &&
      value.none { it == '/' || it == '\\' || it.code < 32 }) { "无效的文件名" }
    return value
  }
  fun relative(value: String): String {
    require(value.isNotEmpty() && !value.startsWith('/') && !value.startsWith('\\') &&
      !Regex("^[A-Za-z]:").containsMatchIn(value) && '\\' !in value && '\u0000' !in value) { "压缩包包含不安全的路径：$value" }
    val parts = value.trimEnd('/').split('/')
    require(parts.none { it == ".." || it == "." || it.isEmpty() || ':' in it || it.any { c -> c.code < 32 } }) { "压缩包包含不安全的路径：$value" }
    return parts.joinToString("/")
  }
  fun child(root: File, relative: String): File {
    val target = File(root, relative(relative)).canonicalFile
    require(target.path.startsWith(root.canonicalPath + File.separator)) { "路径超出目标目录" }
    return target
  }
  fun isLink(file: File) = Files.isSymbolicLink(file.toPath())
  fun noLink(file: File) { require(!isLink(file)) { "不跟随符号链接：${file.name}" } }
  fun publish(source: File, target: File) {
    require(!target.exists()) { "目标已存在：${target.name}；未覆盖" }
    // No REPLACE_EXISTING: also refuses an entry created after the check.
    Files.move(source.toPath(), target.toPath())
  }
  fun pump(input: InputStream, output: OutputStream, checkpoint: (Int) -> Unit = {}): Long {
    val buffer = ByteArray(256 * 1024); var total = 0L
    while (true) {
      checkpoint(0)
      val n = input.read(buffer); if (n < 0) break
      output.write(buffer, 0, n); total += n; checkpoint(n)
    }
    return total
  }
  fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
  fun readText(file: File): Pair<String, String> {
    require(file.isFile && file.length() <= TEXT_LIMIT) { "只允许编辑不超过 1 MB 的文本；大文件请使用预览" }
    val bytes = file.inputStream().use { it.readBytesBounded(TEXT_LIMIT) }
    require(bytes.none { it == 0.toByte() }) { "不能把二进制文件当作文本编辑" }
    val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
    return text to digest(bytes)
  }
  @Synchronized fun saveText(file: File, text: String, expected: String) {
    noLink(file)
    val bytes = text.toByteArray(Charsets.UTF_8)
    require(bytes.size <= TEXT_LIMIT) { "编辑结果超过 1 MB，未保存" }
    require(readText(file).second == expected) { "文件已被其他程序修改，请重新打开，未覆盖外部修改" }
    val stage = File.createTempFile(".rhfiles-edit-", ".part", file.parentFile)
    try {
      stage.outputStream().use { it.write(bytes); it.fd.sync() }
      require(readText(file).second == expected) { "保存期间文件发生变化，未覆盖" }
      try { Files.move(stage.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING) }
      catch (_: java.nio.file.AtomicMoveNotSupportedException) { Files.move(stage.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING) }
    } finally { stage.delete() }
  }
  fun InputStream.readBytesBounded(limit: Int): ByteArray {
    val out = ByteArrayOutputStream(); val buffer = ByteArray(8192)
    while (true) {
      val n = read(buffer); if (n < 0) break
      require(out.size().toLong() + n <= limit) { "内容超出读取上限" }
      out.write(buffer, 0, n)
    }
    return out.toByteArray()
  }
}

data class ArchiveItem(val name: String, val size: Long, val directory: Boolean)
object Archives {
  const val MAX_ENTRIES = 100000
  const val MAX_BYTES = 8L * 1024 * 1024 * 1024
  private fun decompressed(file: File): InputStream {
    val input = file.inputStream().buffered()
    return try {
      when {
        file.name.endsWith(".gz", true) || file.name.endsWith(".tgz", true) -> GzipCompressorInputStream(input)
        file.name.endsWith(".xz", true) || file.name.endsWith(".txz", true) -> XZCompressorInputStream(input, true, 64 * 1024)
        else -> input
      }
    } catch (e: Exception) { input.close(); throw e }
  }
  private fun walk(file: File, visit: (ArchiveItem, InputStream) -> Unit) {
    val n = file.name.lowercase()
    val zip = n.endsWith(".zip") || n.endsWith(".apk")
    val tar = listOf(".tar", ".tar.gz", ".tgz", ".tar.xz", ".txz").any { n.endsWith(it) }
    require(zip || tar || n.endsWith(".gz") || n.endsWith(".xz")) { "支持 ZIP / TAR / GZ / XZ；此格式暂不支持" }
    decompressed(file).use { raw ->
      if (!zip && !tar) { visit(ArchiveItem(SafeFiles.name(file.name.substringBeforeLast('.')), -1, false), raw); return }
      val stream: ArchiveInputStream<*> = if (zip) ZipArchiveInputStream(raw, "UTF-8", true, true) else TarArchiveInputStream(raw)
      stream.use {
        var count = 0
        var pending = stream.nextEntry
        while (true) {
          val e = pending ?: break
          require(++count <= MAX_ENTRIES) { "压缩包条目过多" }
          require(stream.canReadEntryData(e)) { "加密或不支持的压缩方式：${e.name}" }
          if(e is ZipArchiveEntry) require(e.method==0 || e.method==8) { "此 ZIP 使用不支持的压缩算法（支持存储 / Deflate）：${e.name}" }
          require(!(e is ZipArchiveEntry && e.isUnixSymlink) && !(e is TarArchiveEntry && (e.isSymbolicLink || e.isLink || e.isBlockDevice || e.isCharacterDevice || e.isFIFO || (!e.isFile && !e.isDirectory)))) { "不解压链接或特殊设备：${e.name}" }
          val crc=java.util.zip.CRC32()
          val checked=java.util.zip.CheckedInputStream(stream,crc)
          visit(ArchiveItem(SafeFiles.relative(e.name), e.size, e.isDirectory), checked)
          require(checked.read()==-1) { "目录条目包含数据，拒绝跳过不受限的压缩内容" }
          pending=stream.nextEntry // ZIP data descriptors are finalized here.
          if(e is ZipArchiveEntry) require(e.crc<0 || e.crc==crc.value) { "ZIP 校验失败：${e.name}" }
        }
      }
    }
  }
  fun list(file: File): List<ArchiveItem> {
    val entries = mutableListOf<ArchiveItem>(); var scanned = 0L
    walk(file) { e, input ->
      require(entries.size < 2000) { "条目超过 2,000 个，请解压后浏览" }
      entries.add(e)
      // Draining is bounded; never let nextEntry silently inflate an unbounded bomb.
      SafeFiles.pump(input, object : OutputStream() { override fun write(b: Int) {} ; override fun write(b: ByteArray, off: Int, len: Int) {} }) {
        scanned += it; require(scanned <= 256L * 1024 * 1024) { "内容过大，请直接解压；预览最多扫描 256 MB" }
      }
    }
    return entries
  }
  fun extract(file: File, destination: File, folder: String, progress: (Int) -> Unit = {}): File {
    require(destination.isDirectory) { "目标文件夹不存在" }
    val target = File(destination, SafeFiles.name(folder))
    require(!target.exists()) { "目标文件夹已存在，未覆盖" }
    val stage = Files.createTempDirectory(destination.toPath(), ".rhfiles-extract-").toFile()
    var total = 0L
    try {
      val seen = hashSetOf<String>()
      walk(file) { e, input ->
        progress(0)
        require(seen.add(e.name)) { "重复的压缩包路径：${e.name}" }
        val output = SafeFiles.child(stage, e.name)
        if (e.directory) { require(output.mkdirs() || output.isDirectory) { "无法创建解压目录" } }
        else {
          require(e.size <= MAX_BYTES && total + e.size.coerceAtLeast(0) <= MAX_BYTES) { "解压超过 8 GB 安全上限" }
          require(output.parentFile.mkdirs() || output.parentFile.isDirectory) { "无法创建解压目录" }
          require(output.createNewFile()) { "重复或冲突的条目：${e.name}" }
          output.outputStream().use { out -> SafeFiles.pump(input, out) { amount ->
            total += amount; require(total <= MAX_BYTES) { "解压超过 8 GB 安全上限" }; progress(amount)
          } }
        }
      }
      SafeFiles.publish(stage, target); return target
    } finally { if (stage.exists()) stage.deleteRecursively() } // Only this operation's private staging tree.
  }
  fun zip(sources: List<File>, target: File, level: Int, progress: (Int) -> Unit = {}) {
    require(sources.isNotEmpty() && level in 0..9) { "压缩参数无效" }
    require(!target.exists()) { "目标已存在，未覆盖" }
    for (s in sources) require(!target.canonicalPath.startsWith(s.canonicalPath + File.separator)) { "不能在待压缩目录内部创建压缩包" }
    val stage = File.createTempFile(".rhfiles-zip-", ".part", target.parentFile)
    try {
      ZipOutputStream(stage.outputStream().buffered()).use { zip ->
        zip.setLevel(level); val names = hashSetOf<String>(); var count = 0
        fun add(file: File, relative: String, depth: Int) {
          progress(0); require(depth < 128 && ++count <= MAX_ENTRIES) { "目录过深或文件过多" }; SafeFiles.noLink(file)
          require(file.exists() && names.add(relative)) { "来源不存在或文件名重复：$relative" }
          zip.putNextEntry(ZipEntry(SafeFiles.relative(relative) + if (file.isDirectory) "/" else "").apply { time = file.lastModified() })
          if (!file.isDirectory) file.inputStream().use { SafeFiles.pump(it, zip, progress) }
          zip.closeEntry()
          if (file.isDirectory) (file.listFiles() ?: error("无法读取 ${file.name}")).forEach { add(it, "$relative/${it.name}", depth + 1) }
        }
        sources.forEach { add(it, it.name, 0) }
      }
      SafeFiles.publish(stage, target)
    } finally { stage.delete() }
  }
}
