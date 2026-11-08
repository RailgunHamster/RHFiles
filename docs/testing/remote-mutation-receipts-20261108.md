# Remote mutation receipts

Large Windows folder recycling can exceed an HTTP request's response deadline. A response timeout is not proof that deletion failed, and retrying the write can affect a newer occupant of the same path.

Native device mutations now send a random operation identifier once. The server acknowledges an independent background task. Authenticated GET requests retrieve the original task result, including the Recycle Bin undo receipt. Queries do not invoke mutations. A missing receipt after restart or interrupted queries is reported as unconfirmed, without resubmitting the write.

Receipts are bound to the authenticated device, endpoint and exact arguments. Concurrent jobs, result memory and polling have finite limits. Evicting a result retains its identifier tombstone for the service lifetime. The server does not require synchronized client clocks to accept a new identifier. Older hosts keep their synchronous compatibility path with a longer deadline.

Validation uses generated temporary files and independent device identities. No production library or user files are modified by these tests.

- `cargo test -p rhfiles-service --locked` includes a real TLS test that deliberately blocks the storage mutation lock for 31 seconds, verifies the client still waits, then checks the completed result. It recreates the original pathname and confirms a duplicate operation cannot delete the new occupant. It also checks argument changes and live group revocation.
- Receipt tests cover owner isolation, failed identifier reuse, missing results after restart, pending-work limits, unsynchronized clocks, and batches exceeding the result cache's capacity.
- `node --test scripts/e2e/device-file-operations.test.mjs` exercises real Windows recycling, Ctrl+Z/Ctrl+Y, retained directory contents, conflict protection, permanent deletion and ordinary remote filesystem operations using isolated application profiles.

Both endpoints must be upgraded for asynchronous receipts. An older client does not request them and retains its former HTTP deadline. Existing deletion results cannot be inferred solely from a missing pathname; inspect the host's Recycle Bin instead.
