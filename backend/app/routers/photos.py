from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from ..db import session_scope
from ..events_bus import bus
from ..models import Photo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/photos", tags=["photos"])

PHOTOS_DIR = Path(__file__).resolve().parent.parent.parent / "photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB

# Strip anything that isn't safe to round-trip through JSON to the frontend
# without leaking HTML/JS that some downstream renderer might interpret.
_UNSAFE_NAME_CHARS = re.compile(r"[^\w\s.\-+()\[\]]+", re.UNICODE)


def _sanitize_original_name(raw: str | None) -> str | None:
    if not raw:
        return None
    # Take the basename so any "/etc/passwd" prefix is dropped
    base = Path(raw).name
    cleaned = _UNSAFE_NAME_CHARS.sub("", base).strip()
    return cleaned[:120] or None


class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    original_name: str | None
    content_type: str | None
    size_bytes: int
    uploaded_at: datetime
    url: str

    @classmethod
    def from_row(cls, row: Photo) -> "PhotoOut":
        return cls(
            id=row.id,
            filename=row.filename,
            original_name=row.original_name,
            content_type=row.content_type,
            size_bytes=row.size_bytes,
            uploaded_at=row.uploaded_at,
            url=f"/api/photos/file/{row.filename}",
        )


@router.get("", response_model=list[PhotoOut])
def list_photos():
    with session_scope() as session:
        rows = (
            session.execute(select(Photo).order_by(Photo.uploaded_at.desc()))
            .scalars()
            .all()
        )
        return [PhotoOut.from_row(r) for r in rows]


@router.post("", response_model=list[PhotoOut], status_code=201)
async def upload_photos(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files supplied")

    saved: list[PhotoOut] = []
    for f in files:
        ct = (f.content_type or "").lower()
        if ct not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {ct or 'unknown'}",
            )
        # Read in chunks to enforce the size limit without loading huge files
        ext = (Path(f.filename or "").suffix or ".jpg").lower()
        new_name = f"{uuid.uuid4().hex}{ext}"
        dest = PHOTOS_DIR / new_name
        size = 0
        with dest.open("wb") as out:
            while True:
                chunk = await f.read(1024 * 64)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large (max {MAX_BYTES // (1024 * 1024)} MB)",
                    )
                out.write(chunk)
        with session_scope() as session:
            row = Photo(
                filename=new_name,
                original_name=_sanitize_original_name(f.filename),
                content_type=ct,
                size_bytes=size,
            )
            session.add(row)
            session.flush()
            saved.append(PhotoOut.from_row(row))

    await bus.publish("photos-updated")
    return saved


@router.get("/file/{filename}")
def serve_photo(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = PHOTOS_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Photo not found")
    return FileResponse(path)


@router.delete("/{photo_id}", status_code=204)
async def delete_photo(photo_id: int):
    with session_scope() as session:
        row = session.get(Photo, photo_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Photo not found")
        path = PHOTOS_DIR / row.filename
        session.delete(row)
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to delete file %s", path)
    await bus.publish("photos-updated")
