"""Run the actual sibling RHVideo API against an isolated, generated database."""
import os
import sys
import asyncio
import json
import shutil
from pathlib import Path
from datetime import datetime, timedelta

source, directory, port = sys.argv[1:4]
root = Path(directory).resolve()
root.mkdir(parents=True, exist_ok=True)
os.chdir(root)  # Never load RHVideo's production .env.
sys.path.insert(0, str(Path(source).resolve()))
os.environ.update(
    DATABASE_URL="sqlite+aiosqlite:///" + (root / "qa.db").as_posix(),
    DATABASE_SYNC_URL="sqlite:///" + (root / "qa.db").as_posix(),
    STORAGE_LOCAL_PATH=str(root / "storage"),
    APP_DEBUG="false",
    AUTO_IMPORT_ENABLED="false",
    JWT_SECRET_KEY="rhfiles-isolated-rhvideo-contract-fixture-only",
    LOG_LEVEL="ERROR",
)
(root / "static").mkdir(exist_ok=True)
(root / "storage" / "covers").mkdir(parents=True, exist_ok=True)

from contextlib import asynccontextmanager
from io import BytesIO
from PIL import Image, ImageDraw
import uvicorn
from app.main import app
from app.models.database import AsyncSessionLocal
from app.models.user import User
from app.models.models import Video, Picture, Novel, NovelChapter, ReplaceBatch, ReplaceBatchItem, ProcessingRun
from app.core.auth import auth_handler


class ExportTransportQA:
    """Real route/auth/archive, but bounded transport latency to exercise closing
    the client UI during a live download. This is not a throughput benchmark."""
    def __init__(self, app):
        self.app = app
        self.delay = min(0.25, max(0.0, float(os.environ.get("RHVIDEO_QA_EXPORT_DELAY", "0.05"))))

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Test evidence only; never record authorization, cookies or bodies.
            with (root / "requests.jsonl").open("a", encoding="utf-8") as log:
                log.write(json.dumps({"method": scope["method"], "path": scope["path"]}) + "\n")
        slow = (scope["type"] == "http" and "/api/v1/favorite-exports/" in scope.get("path", "")
                and scope["path"].endswith("/download"))
        if slow:
            scope = dict(scope)
            scope["extensions"] = {k: v for k, v in scope.get("extensions", {}).items()
                                   if k not in {"http.response.pathsend", "http.response.zerocopysend"}}

        async def transport(message):
            if slow and message["type"] == "http.response.body" and message.get("body"):
                await asyncio.sleep(self.delay)
            await send(message)
            if slow:
                # Route/byte timing only, no tokens, names, or payload content.
                import time
                with (root / "zip-transport.jsonl").open("a", encoding="utf-8") as log:
                    log.write(json.dumps({"at": time.time(), "event": message["type"],
                                          "bytes": len(message.get("body", b"")),
                                          "more": message.get("more_body", False)}) + "\n")

        await self.app(scope, receive, transport)


app.add_middleware(ExportTransportQA)

original_lifespan = app.router.lifespan_context

@asynccontextmanager
async def lifespan(application):
    async with original_lifespan(application):
        task_queue = os.environ.get("RHVIDEO_QA_TASK_QUEUE") == "1"
        if task_queue:
            # Only this generated service: keep the waiting fixture stable while
            # exercising the real HTTP routes. Actual worker claim ordering is
            # verified separately, not replaced with a mock worker algorithm.
            from app.services.auto_import import auto_import_service
            from app.services.replace_queue import replace_queue_service
            await auto_import_service.stop()
            await replace_queue_service.stop()
        # Nontrivial, actually encoded media, not a 1x1 PNG and invalid MP4
        # bytes that can validate contracts but never playback/decode behavior.
        image = Image.new("RGB", (1600, 1000), (38, 69, 112))
        drawing = ImageDraw.Draw(image)
        for index in range(40):
            drawing.rectangle((index * 40, index * 20, 1599, 999), fill=(40 + index * 4, 160 - index * 2, 90 + index * 3))
        output = BytesIO()
        image.save(output, "PNG")
        png = output.getvalue()
        (root / "storage" / "covers" / "preview.png").write_bytes(png)
        image.save(root / "storage" / "covers" / "preview.webp", "WEBP", quality=82)
        (root / "original.png").write_bytes(png)
        duplicate_copies = int(os.environ.get("RHVIDEO_QA_DUPLICATE_COPIES", "0"))
        if not 0 <= duplicate_copies <= 30:
            raise ValueError("Bound the generated duplicate fixture")
        if duplicate_copies:
            shutil.copyfile(root / "sample.mp4", root / "duplicate-video.mp4")
            shutil.copyfile(root / "storage/covers/preview.webp", root / "storage/covers/duplicate-video.webp")
        for index in range(duplicate_copies):
            (root / f"duplicate-picture-{index}.png").write_bytes(png)
            # Every member owns distinct source AND derived paths. Alias paths
            # are correctly rejected by the real destructive-review service.
            shutil.copyfile(root / "storage/covers/preview.webp", root / f"storage/covers/duplicate-picture-{index}.webp")
        if not (root / "sample.mp4").is_file():
            raise RuntimeError("Generate the real isolated MP4 before starting the service fixture")
        chapter_data = [("第%d章 真实接口测试" % (i+1), ("这是 RHVideo 真实后端提供的章节正文。\n\n" * 100).encode("utf-8")) for i in range(3)]
        novel_path = root / "book.txt"
        novel_path.write_bytes(b"".join(body for _, body in chapter_data))
        async with AsyncSessionLocal() as db:
            db.add(User(id="fixture-user", username="preview", email="qa@example.invalid",
                        hashed_password=auth_handler.get_password_hash("fixture-only"), is_active=True))
            await db.flush()
            db.add(Video(id="real-video", user_id="fixture-user", filename="真实接口视频.mp4",
                         source_path=str(root / "sample.mp4"), source_kind="watch", source_size=(root / "sample.mp4").stat().st_size,
                         folder_label="真实测试", duration_seconds=14, resolution="640x360", status="completed",
                         variants=[], keyframes=["covers/preview.webp"], thumbnail_path="covers/preview.webp"))
            db.add(Picture(id="real-picture", user_id="fixture-user", original_filename="真实接口图片.png",
                           original_filesize=len(png), original_resolution="1600x1000", original_format="png",
                           md5_hash="0"*32, webp_path="covers/preview.webp", original_path=str(root / "original.png"), folder_label="真实测试", status="active"))
            if duplicate_copies:
                db.add(Video(id="real-video-copy", user_id="fixture-user", filename="真实重复视频.mp4",
                             source_path=str(root / "duplicate-video.mp4"), source_kind="watch", source_size=(root / "duplicate-video.mp4").stat().st_size,
                             folder_label="真实测试", duration_seconds=14, resolution="640x360", status="completed",
                             variants=[], keyframes=["covers/duplicate-video.webp"], thumbnail_path="covers/duplicate-video.webp"))
            for index in range(duplicate_copies):
                db.add(Picture(id=f"real-picture-{index}", user_id="fixture-user", original_filename=f"真实重复图片 {index}.png",
                               original_filesize=len(png), original_resolution="1600x1000", original_format="png",
                               md5_hash="0"*32, webp_path=f"covers/duplicate-picture-{index}.webp", original_path=str(root / f"duplicate-picture-{index}.png"), folder_label="真实测试", status="active"))
            db.add(Novel(id="real-novel", user_id="fixture-user", title="真实接口小说",
                         source_path=str(novel_path), encoding="utf-8", folder_label="真实测试",
                         word_count=12000, chapter_count=3, status="active"))
            await db.flush()
            offset = 0
            for index, (title, body) in enumerate(chapter_data):
                db.add(NovelChapter(novel_id="real-novel", chapter_index=index, title=title,
                                    byte_offset=offset, byte_length=len(body), word_count=4000))
                offset += len(body)
            await db.commit()
        if task_queue:
            now = datetime.utcnow()
            async with AsyncSessionLocal() as db:
                for index in range(70):
                    db.add(Video(id=f"queue-{index:03}", user_id="fixture-user", filename=f"队列任务 {index:03}.mp4",
                                 source_path=str(root / "sample.mp4"), status="pending", queue_priority=0,
                                 enqueued_at=now + timedelta(seconds=index)))
                db.add(Video(id="queue-running", user_id="fixture-user", filename="当前正在处理.mp4", source_path=str(root / "sample.mp4"), status="processing"))
                db.add(Video(id="queue-paused", user_id="fixture-user", filename="暂停批次源.mp4", source_path=str(root / "sample.mp4"), status="completed"))
                db.add(ProcessingRun(id="queue-running-run", video_id="queue-running", filename="当前正在处理.mp4", status="running", steps=[{"key":"compress","status":"running"}]))
                db.add_all([ReplaceBatch(id="queue-own", user_id="fixture-user", request_id="queue-own"),
                            ReplaceBatch(id="queue-paused", user_id="fixture-user", request_id="queue-paused", status="paused"),
                            ReplaceBatch(id="queue-private", user_id="other-user", request_id="queue-private")])
                await db.flush()
                for index in range(60):
                    db.add(ReplaceBatchItem(id=index+1,batch_id="queue-own",video_id=f"queue-{index:03}",position=index,filename=f"替换任务 {index:03}.mp4",status="pending"))
                db.add_all([ReplaceBatchItem(id=100,batch_id="queue-own",video_id="queue-060",position=60,filename="替换失败记录.mp4",status="failed",finished_at=now,message="生成的测试错误"),
                            ReplaceBatchItem(id=101,batch_id="queue-paused",video_id="queue-paused",position=0,filename="已暂停批次的等待任务.mp4",status="pending"),
                            ReplaceBatchItem(id=102,batch_id="queue-private",video_id="private-source",position=0,filename="其他账号的任务.mp4",status="pending"),
                            ReplaceBatchItem(id=103,batch_id="queue-own",video_id="queue-061",position=61,filename="当前正在替换.mp4",status="running",started_at=now)])
                await db.commit()
            (root / "queue-fixture.json").write_text(json.dumps({"format":"rhfiles-owned-task-queue-v1"}), encoding="utf-8")
        print("RHVIDEO_QA_READY", flush=True)
        yield

app.router.lifespan_context = lifespan
uvicorn.run(app, host="127.0.0.1", port=int(port), log_level="error")
