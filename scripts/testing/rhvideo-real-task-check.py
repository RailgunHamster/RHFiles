"""Assert real worker claim order in the explicitly generated queue fixture.

This never encodes media and never opens a production database. HTTP/API/UI
actions perform the promotions; this is independent postcondition evidence.
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

source, directory, expected_json = sys.argv[1:4]
root = Path(directory).resolve()
assert Path(directory).is_absolute() and (root / "qa.db").is_file()
assert json.loads((root / "queue-fixture.json").read_text(encoding="utf-8")) == {"format":"rhfiles-owned-task-queue-v1"}
expected = json.loads(expected_json)
assert set(expected) == {"default", "replacement"}
assert 1 <= len(expected["default"]) <= 2 and all(re.fullmatch(r"queue-06[89]", key) for key in expected["default"])
assert expected["replacement"] == [60]
os.chdir(root)
sys.path.insert(0, str(Path(source).resolve()))
os.environ.update(DATABASE_URL="sqlite+aiosqlite:///" + (root / "qa.db").as_posix(),
                  DATABASE_SYNC_URL="sqlite:///" + (root / "qa.db").as_posix(),
                  STORAGE_LOCAL_PATH=str(root / "storage"), AUTO_IMPORT_ENABLED="false")
from sqlalchemy import select
from app.models.database import AsyncSessionLocal
from app.models.models import Video, ReplaceBatch, ReplaceBatchItem, ProcessingRun, ProcessingQueuePin
from app.services.auto_import import AutoImportService
from app.services.replace_queue import ReplaceQueueService


async def check():
    async def unchanged():
        async with AsyncSessionLocal() as db:
            assert (await db.get(Video, "queue-running")).status == "processing"
            run = await db.get(ProcessingRun, "queue-running-run")
            assert run.status == "running" and run.steps == [{"key":"compress","status":"running"}]
            assert (await db.get(ReplaceBatchItem, 103)).status == "running"
            assert (await db.get(ReplaceBatchItem, 100)).status == "failed"
            assert (await db.get(ReplaceBatch, "queue-paused")).status == "paused"
            assert (await db.get(ReplaceBatchItem, 101)).status == "pending"
    await unchanged()
    service = AutoImportService()
    claimed = [await service._claim_next() for _ in expected["default"]]
    assert claimed == expected["default"], (claimed, expected)
    replacement = await ReplaceQueueService()._claim()
    assert replacement and replacement[0] == 60, replacement
    await unchanged()
    async with AsyncSessionLocal() as db:
        pins = [(row.kind, row.entry_id) for row in (await db.scalars(select(ProcessingQueuePin))).all()]
        assert pins == [("replacement", "101")], pins  # Paused is pinned, never resumed.
    return {"defaultClaims": claimed, "replacementClaim": replacement[0],
            "pausedUnchanged": True, "activeAttemptsUnchanged": True, "failedAttemptNotRetried": True}

print("RHFILES_TASK_QUEUE_RESULT " + json.dumps(asyncio.run(check())), flush=True)
