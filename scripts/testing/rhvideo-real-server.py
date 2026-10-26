"""Run the actual sibling RHVideo API against an isolated, generated database."""
import os
import sys
from pathlib import Path

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
import base64
import uvicorn
from app.main import app
from app.models.database import AsyncSessionLocal
from app.models.user import User
from app.models.models import Video, Picture, Novel, NovelChapter
from app.core.auth import auth_handler

original_lifespan = app.router.lifespan_context

@asynccontextmanager
async def lifespan(application):
    async with original_lifespan(application):
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=")
        (root / "storage" / "covers" / "preview.png").write_bytes(png)
        chapter_data = [("第%d章 真实接口测试" % (i+1), ("这是 RHVideo 真实后端提供的章节正文。\n\n" * 100).encode("utf-8")) for i in range(3)]
        novel_path = root / "book.txt"
        novel_path.write_bytes(b"".join(body for _, body in chapter_data))
        async with AsyncSessionLocal() as db:
            db.add(User(id="fixture-user", username="preview", email="qa@example.invalid",
                        hashed_password=auth_handler.get_password_hash("fixture-only"), is_active=True))
            await db.flush()
            db.add(Video(id="real-video", user_id="fixture-user", filename="真实接口视频.mp4",
                         source_path=str(root / "sample.mp4"), source_kind="watch", source_size=1000,
                         folder_label="真实测试", duration_seconds=14, resolution="640x360", status="completed",
                         variants=[], keyframes=["covers/preview.png"], thumbnail_path="covers/preview.png"))
            db.add(Picture(id="real-picture", user_id="fixture-user", original_filename="真实接口图片.png",
                           original_filesize=len(png), original_resolution="1x1", original_format="png",
                           md5_hash="0"*32, webp_path="covers/preview.png", folder_label="真实测试", status="active"))
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
        print("RHVIDEO_QA_READY", flush=True)
        yield

app.router.lifespan_context = lifespan
uvicorn.run(app, host="127.0.0.1", port=int(port), log_level="error")
