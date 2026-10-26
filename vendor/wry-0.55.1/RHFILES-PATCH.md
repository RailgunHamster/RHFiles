# Android informational response lifetime guard

Upstream: tauri-apps/wry, crates.io wry **0.55.1** (MIT OR Apache-2.0).
Only the Android application's Cargo manifest selects this pinned copy.
The Windows dependency graph is unchanged.

Reproduced on 2026-10-27 while accepting the production-minified Android APK:
`src/android/main_pipe.rs:394` panics with `SendError(..)` in the Android UI
thread when WebView cold startup takes longer than `MAIN_PIPE_TIMEOUT`.
`platform_webview_version` drops its response receiver on timeout; delivering
the late `GetWebViewVersion` response used `unwrap()` and aborted the process.

Changes: ignore the send error of the informational `GetWebViewVersion`,
`GetUrl` and `GetCookies` replies when their receiving caller has gone away.
No request is repeated, no timeout is extended, no mutation is retried, and
successful responses are unchanged. Keep this patch until an upstream release
contains the equivalent guard, then return to the registry dependency.

A version-query timeout returns the existing "unknown version" empty-string
representation, rather than being misclassified as a missing WebView runtime.
Actual JNI/package errors still propagate, actual webview creation still has
its normal error handling, and the ten-second query timeout is not extended.

Sources:
https://github.com/tauri-apps/wry/tree/wry-v0.55.1
https://github.com/tauri-apps/wry/blob/wry-v0.55.1/src/android/main_pipe.rs

Original license texts and source attribution are retained in this directory.
