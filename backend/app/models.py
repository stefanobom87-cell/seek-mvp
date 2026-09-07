from typing import Optional
from pydantic import BaseModel, HttpUrl


class SearchResult(BaseModel):
    title: str
    url: str
    source: str
    snippet: str = ""
    thumbnail: Optional[str] = None


class ProbeRequest(BaseModel):
    url: HttpUrl


class FormatItem(BaseModel):
    format_id: str
    label: str
    ext: str | None = None
    resolution: str | None = None
    fps: float | None = None
    vcodec: str | None = None
    acodec: str | None = None
    filesize: int | None = None
    filesize_approx: int | None = None
    has_video: bool = False
    has_audio: bool = False


class ProbeResponse(BaseModel):
    title: str
    webpage_url: str
    thumbnail: str | None = None
    duration: float | None = None
    formats: list[FormatItem]


class DownloadRequest(BaseModel):
    url: HttpUrl
    format_id: str
