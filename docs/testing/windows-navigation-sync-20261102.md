# Windows navigation and shared configuration acceptance

These are unreleased source changes following Windows 0.1.97 and Android
0.1.41. Existing published package bytes and installed user profiles were not
replaced. Tests use isolated profiles and generated files, not a real media
database, WebDAV configuration or device group.

## Shared WebDAV configuration

Windows and Android address the same `rhfiles-settings-v1.json` in the configured
folder, with or without a trailing slash. Both accept schema v1 and the v2
extension containing RHVideo server and username. Passwords, tokens, device-group
trust, local favorites, themes and layouts stay local. Unknown formats and fields
stop synchronization rather than silently removing data.

The common fixture `scripts/fixtures/shared-config.contract.json` contains SMB,
WebDAV, FTP, FTPS and SFTP metadata, ordered Chinese bookmarks, a legal WebDAV
filename containing punctuation forbidden in Windows local filenames, and RHVideo
metadata. Windows previously materialized only SMB bookmarks and applied Windows
filename restrictions to portable paths. All portable bookmarks now materialize;
SMB maps to UNC where supported, while other protocols keep their identity URI.
Migration preserves bookmarks that the previous PC client never displayed.

The same fixture passes Android validation and actual conditional WebDAV
GET/PUT/application, plus real Windows application import, rename, removal,
reordering and repeat-sync tests. Android retains SFTP configuration for other
clients and explicitly marks its missing SFTP adapter; it does not pretend that
storing a profile implements the protocol. Passwords must be supplied on each
device. Existing SFTP host-key trust remains local.

The reported user-instance format failure still needs its complete message and
version to identify the exact rejected field. The fixes above address reproduced
compatibility differences; the user's cloud file has not been cleared or edited.

## Windows navigation and protocol locations

Device-group management and cache/work-copy actions are indented child buttons
under RHFiles devices. Saved network locations have one manager, and USB/MTP
devices appear only when present. macOS retains its existing FTP connection UI;
the new saved-credential manager requires Windows credential integration.

Disposable loopback FTP, SFTP and WebDAV servers pass binary upload/download,
listing, directory creation, rename, deletion, destination-conflict rejection,
credential binding and changed SSH host-key checks through the real application.
FTPS uses the existing TLS library but is not covered by this loopback fixture.
WebDAV XML tests include mixed successful/missing property groups, truncation,
external paths and rejected DTDs. FTP collision checks cannot provide atomic
no-replace guarantees against another writer. New saved-protocol cross-location
moves are rejected before copying or deleting because these adapters do not yet
provide version-bound source cleanup. Device-group transfers are unchanged.

## Native dragging and default folder opening

Native Windows dragging uses a Shell IDataObject with real Unicode file/folder
CF_HDROP data and filters synthesized text paths. Remote files require explicit
preparation of retained local copies, followed by another drag. Each preparation
is single-use and expires after five minutes; retained files are not deleted at
drop completion because receiving applications may read them later. External
MOVE effects never authorize deleting source files.

The native Shell-object unit test passes for multiple files/folders, exact path
identity and absence of text formats. Physical mouse acceptance into the owned
native target, WeChat and QQ remains unverified: the computer-use capture helper
failed twice with Direct3D device removal before mouse input. The manual fixture
`scripts/testing/external-drag-manual.mjs` retains an empty-drop failure record;
it is not a passing test.

Win+E and ordinary folder/drive associations are independent, opt-in, per-user
settings. Registry writes have a recovery journal and conditional restoration;
subsequent third-party changes are preserved. A stable launcher recovers to
Explorer if the portable executable moves. Explorer's desktop, taskbar, virtual
folders and Open/Save dialogs are not replaced. Mock registry tests cover scope,
restoration and journal failure. Real second-process folder requests reach new
or existing tabs in the isolated desktop profile. Real Win+E and user association
switching require separate native acceptance; tests did not enable them for the
current Windows user.

## Checks

- Frontend/business tests: 1784 passed, no skips, against the pinned source-only
  RHVideo reference.
- Windows Rust library tests: 368 passed, 10 existing environment-dependent
  tests ignored. Debug executable builds successfully.
- Android configuration tests: 21 passed, including the shared fixture and
  actual WebDAV synchronization. No physical phone was installed or changed.
- Six real application tests pass for shared configuration, existing WebDAV
  conflict/ETag/login/redirect protections, RHVideo metadata, protocol operations,
  system folder requests and actual sidebar clicks.
- The first-party automation binding gate passes; new operations expose semantic
  actions through RHFilesAPI as well as registered UI listeners.

Android JVM tests used a process-only `jdk.net.unixdomain.tmpdir` pointing to a
nonexistent directory so OpenJDK falls back to TCP for its internal loopback
pipe. This avoids a failure in this Windows command-runner environment; it does
not change RHFiles, the system network configuration or the installed JDK.

## Release retention

CNB and GitHub retain the newest three formal versions per platform, plus any
payload still referenced by the current update feeds. Platforms with fewer
releases retain all available versions. Unknown tags, drafts and prereleases
are outside the formal-release sweep. Git tags and source history are untouched.

The November 2 cleanup removed four old CNB Windows releases and 124 old GitHub
formal release records. Both retain Windows 0.1.97, 0.1.96 and 0.1.95. GitHub
retains Android 0.1.41, 0.1.38 and 0.1.37; CNB has only 0.1.41 and 0.1.38.
The sole macOS preview container remains, with its obsolete Windows packages
removed. Current public Windows and Android update feeds remain readable.
Deleted package bytes cannot be recovered from the saved metadata alone.

For subsequent local releases, first verify both platform feeds, then run
`scripts/prune-releases.ps1 -Provider CNB -Keep 3` and the corresponding GitHub
command to inspect plans. Add `-Apply` to execute an approved policy. The script
rechecks release identity, timestamps and the Latest marker, stores metadata
before deleting, throttles requests, and does not automatically retry writes.
Publishing credentials stay local and are never uploaded to GitHub Actions.
