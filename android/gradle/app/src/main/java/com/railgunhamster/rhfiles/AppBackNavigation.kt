package com.railgunhamster.rhfiles

/** One native Back gesture becomes one logical app Back, never WebView history. */
class AppBackNavigation(
  private val evaluate: (String, (String?) -> Unit) -> Unit,
  private val leaveHome: () -> Unit,
) {
  private var pending = false

  fun back() {
    if (pending) return
    pending = true
    // During startup/renderer recovery there is no proven Home state: consume Back.
    evaluate("typeof window.rhfilesHandleBack === 'function' ? window.rhfilesHandleBack() : true") { result ->
      pending = false
      if (result == "false") leaveHome()
    }
  }
}
