# Device-group connection recovery

Windows 0.1.81 / Android 0.1.32. This policy applies to RHFiles HTTPS device groups, not Windows SMB/DNS repair.

## Budgets and demand

- A round has one monotonic 15-second deadline, including waiting for another caller, and at most six admitted connection/peer-exchange attempts. Network changes never renew this deadline or counter.
- The first/preferred successful-address handshake has up to six seconds; ordinary alternatives and the single warm transport retry have up to three seconds. Connect phases have a 4.5-second cap inside their parent deadline.
- At most one transport retry is admitted per round, after 200–350 ms backoff. HTTP permission rejection and TLS/group identity failure are terminal, not retryable transport faults.
- Automatic failures gate subsequent demand for 2, 5, 15, then at most 30 seconds. There is no timer that starts a probe when cooldown expires. An explicit manual retry may bypass automatic cooldown, but successive failed manual attempts remain limited to one per three seconds after completion.
- Concurrent calls for a peer share the same resolver gate. Cancellation must release pending work promptly and must not cancel an unrelated file task that owns the connection.

## Identity and routes

Membership, address hints, live routes and short-lived authentication sessions are different state. Successful address hints are bounded to 128 entries, expire after seven days and contain no credentials. They are local only, outside exported group packets and WebDAV configuration synchronization. A remembered address still needs pinned TLS and signed device-key verification. Local removals are checked before any connection.

Candidates are ranked for available local subnets/Tailscale, preserving manual intent. Remote loopback and addresses pointing back at this device are skipped unless intentionally supplied manually or previously verified. Short mDNS discovery and at most two already-authenticated peers remain last-resort bounded methods, not recursive searches or subnet sweeps.

Android uses callback-fed default-network/VPN link snapshots; unrelated IMS/unused-interface changes do not invalidate the path. A LAN is not required to pass Internet validation. Windows asks the OS to select the local route for each destination using a UDP connect without sending a datagram; unrelated adapter enumeration changes do not invalidate it.

Session expiry/server restart may renew authentication once within the existing budget. File mutations are not sent by the connection resolver. Ambiguous rename/move/delete requests must never be replayed; resumable uploads separately reconcile server offsets before resending staged bytes.

## Diagnostics and stale data

Both platforms ship the same diagnostic UI. Reports show attempts, remaining budget, cooldown at report time, stage durations, successful address and retry/skip reasons. Timeout means unknown reachability, not confirmed offline. `tailscale_address` does not claim an observed direct or DERP path. Viewing, refreshing or copying reports never starts a connection.

Android preserves a failed-refresh directory without resetting scroll and labels it stale. File changes require a successful refresh. Automation exposes `stale`/`refreshError` in navigation state and returns `STALE_LISTING` for attempted UI file mutations on stale data.

## Executable regression map

### Bounded native file transfers

Native peers advertising `versioned-ranges-sha256` serve captured-handle ranges,
not a pathname stat followed by an unrelated open. Each range is at most 8 MiB,
requires the exact read revision/If-Match and returns its SHA-256. Read revisions
include file identity, OS change time and the server's local authorization
generation: restoring the old mtime or renewing a removed peer cannot revive an
old transfer. Mutation revisions stay separate because capture-by-rename changes
OS change time. Clients
reject a full 200 response, wrong Content-Range, size, ETag, encoding or digest.
Older peers retain continuous streaming without claiming these guarantees.

Windows and Android default to two ordered range workers per file (configurable
1–4). Process-wide task/worker/buffer limits and backpressure apply even to
completed out-of-order pieces. Per-file MiB/s caps are local settings, included
in full configuration backups, not exported group authorization. Media viewing
keeps its seekable continuous stream rather than waiting for an 8 MiB piece.
Independent new small files are copied two at a time. Directory creation,
existing-target conflict handling and move cleanup stay ordered; Android joins
all private-tree workers before cleanup or source deletion. Progress aggregation
is synchronized rather than emitting conflicting per-file task percentages.

Only an active, same-incarnation, same-version read may repair a failed range:
two repairs per range, eight across the file. Permission/identity/version/range
protocol errors are terminal. There is no timer, retry button, persisted write
replay or resurrection of a finished/failed task. Dropping the reader aborts its
owned work; local destination files remain staged until complete validation.
This is **in-task range repair**, not automatic resume of a crashed application.

Uploads retain sequential tus offsets. Tiny body frames are coalesced into
8 MiB records, not treated as separate durable writes. Windows overlaps one
bounded source lookahead with sending. Acknowledged offsets still require file
and journal sync; a failed checkpoint cannot advance HEAD. Verified membership
certificates are cached, but local refusals, current permissions and incarnation
checks remain live on every buffer. No optimization weakens move/overwrite ABA
guards or grants a mutation retry.

Regression coverage: Rust real-TLS ranges/order/tails/source replacement/live
revocation, hot-access signature cache and journal-failure recovery; Android
MockWebServer interrupted/corrupt/wrong-status/wrong-version segments, repair
budgets, ordered results, final revision checks and closing blocked I/O. Run
`scripts/testing/device-throughput.mjs` against an explicitly selected release
executable with `RHFILES_REMOTE_WINDOWS_QA=1` for generated-file LAN upload,
download and two-remote-path relay. It verifies all output SHA-256 values, uses
isolated profiles and never reads installed groups or user media.

| Scenario | Coverage |
| --- | --- |
| Cold/idle handshake exceeding the former short timeout | Rust real TLS TCP delay tunnel; Android expired-session delayed HTTPS response |
| First transport attempt drops, same address becomes usable | Rust TCP tunnel disconnect; Android MockWebServer disconnect; exactly one admitted warm retry |
| Service restart/session loss | Rust stop/rebind real service; Android one-time capabilities 401 followed by signed reauthentication |
| Old address/IP change | Rust signed alternate endpoint; Android ordinary file-read recovery without re-pairing |
| Relevant versus unrelated network changes | Android callback-fed link model and bounded network-change continuation; Windows destination-specific route selection |
| Repeated clicks/background demand | Per-peer coalescing; independent manual-rate/cooldown tests; fake-clock six-attempt and deadline bounds |
| Remembered address after resolver/process reconstruction | Rust persisted hint reload plus local removal; Android runtime reset plus local preference reload |
| Wrong certificate/permission revoked | Real pinned TLS fixtures, no credentials to the wrong server; stop without discovery |
| Cancellation | Hung real TLS / Android no-response fixture, prompt cancellation |
| Unknown outcome of writes | Android rename and delete disconnect-after-request, exactly one mutation; existing TUS offset reconciliation and server move/overwrite protections |
| Stale listing and script behavior | Execute actual shipped refresh/task/automation handlers, preserve list, reject mutation, recover on successful refresh |
| Diagnostic UI and translations | Execute shared UI in Chinese/English; viewing reports cannot probe |
| Android WebView opaque internal URLs | Execute the actual navigation preflight with an empty URL.hostname; validate UUID roots/children and reject credentials, ports and queries |

Radio handovers, actual screen-off behavior and cellular/Tailscale performance are device/environment checks, not proven by socket/fake-clock fixtures. Record those separately from these deterministic regressions; a successful individual connection is not proof that every carrier or relay issue has been eliminated.
