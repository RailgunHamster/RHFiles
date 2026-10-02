package com.railgunhamster.rhfiles

import android.content.Context
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract as Docs
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.*

data class NativeEntry(val path: String, val name: String, val isDir: Boolean, val size: Long = 0,
  val modified: Long = 0, val flags: Int = 0) {
  fun json() = JSONObject().put("path", path).put("name", name).put("isDir", isDir).put("size", size)
    .put("modifiedMs", modified).put("kind", if (isDir) "folder" else kind(name)).put("hidden", name.startsWith('.')).put("flags", flags)
  companion object {
    fun kind(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
      "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "avif", "svg" -> "image"
      "mp4", "mkv", "avi", "mov", "webm", "3gp", "m4v" -> "video"
      "mp3", "flac", "wav", "aac", "ogg", "opus", "m4a", "amr" -> "audio"
      "zip", "tar", "gz", "xz", "tgz", "txz", "7z", "rar", "apk", "apks" -> "archive"
      else -> "document"
    }
  }
}

/** One storage adapter for paths and granted document trees. Never turn a content URI into a guessed path. */
class NativeStorage(val context: Context) {
  val remote by lazy { RemoteStorage(context) }
  fun isDocument(path: String) = path.startsWith("content://")
  fun isRemote(path: String) = path.startsWith("remote://")
  fun local(path: String): File {
    require(File(path).isAbsolute) { "不是本地文件路径" }
    val file = File(path); val canonical = file.canonicalFile
    val roots = listOf(File("/storage"), Environment.getExternalStorageDirectory(), File(context.cacheDir, "exports"))
    require(roots.any { canonical == it.canonicalFile || canonical.path.startsWith(it.canonicalPath + File.separator) }) { "路径不在共享存储中" }
    SafeFiles.noLink(file)
    return canonical
  }
  fun docUri(path: String): Uri {
    val uri = Uri.parse(path)
    require(uri.scheme == "content" && uri.authority != "${context.packageName}.fileprovider") { "无效的存储 URI" }
    // Persisted tree grants, or explicitly received share grants, are enforced by ContentResolver.
    return uri
  }
  fun document(path: String): Uri {
    val uri = docUri(path)
    return if (Docs.isDocumentUri(context, uri)) uri else Docs.buildDocumentUriUsingTree(uri, Docs.getTreeDocumentId(uri))
  }
  fun stat(path: String): NativeEntry {
    if (isRemote(path)) return remote.stat(path)
    if (!isDocument(path)) {
      val f = local(path); require(f.exists()) { "文件已不存在：${f.name}" }
      return NativeEntry(f.path, f.name, f.isDirectory, if (f.isFile) f.length() else 0, f.lastModified())
    }
    val uri = docUri(path)
    context.contentResolver.query(uri, null, null, null, null)?.use { c ->
      require(c.moveToFirst()) { "文件已不存在或授权失效" }
      fun text(column: String, fallback: String = "") = c.getColumnIndex(column).let { if (it < 0 || c.isNull(it)) fallback else c.getString(it) }
      val mime = text(Docs.Document.COLUMN_MIME_TYPE, context.contentResolver.getType(uri) ?: "")
      return NativeEntry(path, text(OpenableColumns.DISPLAY_NAME, "分享文件"), mime == Docs.Document.MIME_TYPE_DIR,
        text(OpenableColumns.SIZE, "0").toLongOrNull() ?: 0, text(Docs.Document.COLUMN_LAST_MODIFIED,"0").toLongOrNull() ?: 0,
        text(Docs.Document.COLUMN_FLAGS,"0").toIntOrNull() ?: 0)
    }
    error("提供者未返回文件信息")
  }
  fun list(path: String): List<NativeEntry> {
    if (isRemote(path)) return remote.list(path)
    if (!isDocument(path)) return (local(path).listFiles() ?: error("无法读取文件夹：权限不足或设备已拔出"))
      .take(50000).map { NativeEntry(it.path,it.name,it.isDirectory,if (it.isFile) it.length() else 0,it.lastModified()) }
    val uri = document(path)
    val children = Docs.buildChildDocumentsUriUsingTree(uri, Docs.getDocumentId(uri))
    val result = mutableListOf<NativeEntry>()
    context.contentResolver.query(children, arrayOf(Docs.Document.COLUMN_DOCUMENT_ID, Docs.Document.COLUMN_DISPLAY_NAME,
      Docs.Document.COLUMN_MIME_TYPE, Docs.Document.COLUMN_SIZE, Docs.Document.COLUMN_LAST_MODIFIED, Docs.Document.COLUMN_FLAGS), null,null,null)?.use { c ->
      while (c.moveToNext() && result.size < 50000) result.add(NativeEntry(
        Docs.buildDocumentUriUsingTree(uri, c.getString(0)).toString(),c.getString(1),c.getString(2) == Docs.Document.MIME_TYPE_DIR,
        c.getLong(3),c.getLong(4),c.getInt(5)))
    } ?: error("无法访问提供者，请重新授权")
    return result
  }
  fun input(path: String): InputStream = when {
    isRemote(path) -> remote.input(path)
    isDocument(path) -> context.contentResolver.openInputStream(docUri(path)) ?: error("提供者不支持读取此文件")
    else -> local(path).inputStream()
  }
  fun create(parent: String, name: String, dir: Boolean): String {
    SafeFiles.name(name)
    require(list(parent).none { it.name == name }) { "目标已存在：$name；未覆盖" }
    if (isRemote(parent)) return remote.create(parent,name,dir)
    if (isDocument(parent)) return (Docs.createDocument(context.contentResolver,document(parent),
      if (dir) Docs.Document.MIME_TYPE_DIR else mime(name),name) ?: error("提供者拒绝创建")).toString()
    val file = File(local(parent),name)
    require(if (dir) file.mkdir() else file.createNewFile()) { "无法创建：$name" }; return file.path
  }
  fun write(path: String, input: InputStream, progress: (Int) -> Unit) {
    if (isRemote(path)) { remote.write(path,input,progress); return }
    val output = if (isDocument(path)) context.contentResolver.openOutputStream(docUri(path), "wt") ?: error("提供者拒绝写入")
      else local(path).outputStream()
    output.use { SafeFiles.pump(input,it,progress) }
  }
  fun rename(path: String, name: String): String {
    SafeFiles.name(name)
    if (isRemote(path)) return remote.rename(path,name)
    if (isDocument(path)) return (Docs.renameDocument(context.contentResolver,document(path),name) ?: error("提供者拒绝重命名")).toString()
    val file = local(path); val target = File(file.parentFile,name)
    SafeFiles.publish(file,target); return target.path
  }
  fun delete(path: String) {
    // Document providers and WebDAV may implement DELETE recursively. A move
    // must never silently delete children created after its copy snapshot.
    if ((isRemote(path) || isDocument(path)) && stat(path).isDir) require(list(path).isEmpty()) { "文件夹出现新内容或仍非空，未删除" }
    if (isRemote(path)) { remote.delete(path); return }
    if (isDocument(path)) { require(Docs.deleteDocument(context.contentResolver,document(path))) { "提供者拒绝删除" }; return }
    val f = local(path)
    require(f.parentFile != null && f != Environment.getExternalStorageDirectory().canonicalFile && f.toPath().nameCount > 2) { "不能删除存储根目录" }
    require(f.delete()) { "无法删除：${f.name}（文件夹必须为空）" }
  }
  fun roots(): JSONArray {
    val array = JSONArray(); val seen = hashSetOf<String>()
    val paths = mutableListOf(Environment.getExternalStorageDirectory())
    context.getExternalFilesDirs(null).filterNotNull().forEach { f -> paths.add(File(f.path.substringBefore("/Android/"))) }
    paths.forEach { f -> if (seen.add(f.path)) {
      val e = JSONObject().put("path", f.path).put("label",if (paths.first() == f) "内部存储" else "外部存储").put("removable",paths.first()!=f)
      try { val stat = StatFs(f.path); e.put("totalBytes",stat.totalBytes).put("freeBytes",stat.availableBytes) } catch (_: Exception) {}
      array.put(e)
    } }
    context.contentResolver.persistedUriPermissions.filter { it.isReadPermission && Docs.isTreeUri(it.uri) }.forEach { grant ->
      try {
        val path = document(grant.uri.toString()).toString(); val e = stat(path)
        array.put(JSONObject().put("path",path).put("label",e.name).put("removable",true).put("provider",true))
      } catch (_: Exception) { array.put(JSONObject().put("path",grant.uri.toString()).put("label","授权失效 / 设备离线").put("removable",true).put("provider",true)) }
    }
    return array
  }
  companion object { fun mime(name: String) = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream" }
}
