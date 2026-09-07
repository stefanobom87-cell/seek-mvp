from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.media import download, probe
from app.models import DownloadRequest, ProbeRequest, ProbeResponse, SearchResult
from app.providers.searxng import search_searxng


app = FastAPI(title="SEEK API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/search", response_model=list[SearchResult])
async def search(q: str = Query(min_length=2, max_length=300)):
    # First provider. The provider interface is intentionally simple so we can
    # add Internet Archive, Wikimedia, podcast/video APIs, custom crawlers, etc.
    return await search_searxng(q)


@app.post("/media/probe", response_model=ProbeResponse)
def media_probe(body: ProbeRequest):
    return probe(str(body.url))


@app.post("/media/download")
def media_download(body: DownloadRequest):
    path: Path = download(str(body.url), body.format_id)
    return FileResponse(path, filename=path.name, media_type="application/octet-stream")
