import os
import re
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException
from yt_dlp import YoutubeDL

from app.models import FormatItem, ProbeResponse


DOWNLOAD_DIR = Path(os.environ.get("DOWNLOAD_DIR", "downloads")).resolve()
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Optional production hardening: comma-separated domains that may be probed/downloaded.
# Empty means unrestricted public URLs. Authentication, cookies and DRM bypasses are intentionally not used.
ALLOWED_DOMAINS = {
    d.strip().lower()
    for d in os.environ.get("ALLOW_DOWNLOAD_DOMAINS", "").split(",")
    if d.strip()
}


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def _check_url(url: str) -> None:
    host = _host(url)
    if not host:
        raise HTTPException(400, "URL non valido")
    if host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".local"):
        raise HTTPException(400, "Host locale non consentito")
    if ALLOWED_DOMAINS and not any(host == d or host.endswith("." + d) for d in ALLOWED_DOMAINS):
        raise HTTPException(403, "Dominio non autorizzato per il download")


def _ydl_base() -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "restrictfilenames": True,
        "nocheckcertificate": False,
        # Intentionally no cookies, credentials, impersonation or DRM-bypass options.
    }


def probe(url: str) -> ProbeResponse:
    _check_url(url)
    try:
        with YoutubeDL(_ydl_base()) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise HTTPException(422, f"Impossibile analizzare questa sorgente: {exc}") from exc

    if info.get("_type") == "playlist":
        raise HTTPException(400, "Nel MVP sono supportati solo singoli contenuti")

    formats: list[FormatItem] = []
    for f in info.get("formats") or []:
        fid = str(f.get("format_id") or "")
        if not fid:
            continue
        vcodec = f.get("vcodec") or "none"
        acodec = f.get("acodec") or "none"
        has_video = vcodec != "none"
        has_audio = acodec != "none"
        height = f.get("height")
        width = f.get("width")
        resolution = f.get("resolution")
        if not resolution and width and height:
            resolution = f"{width}x{height}"
        elif not resolution and height:
            resolution = f"{height}p"

        label_bits = []
        if height:
            label_bits.append(f"{height}p")
        elif f.get("format_note"):
            label_bits.append(str(f.get("format_note")))
        if f.get("fps"):
            label_bits.append(f"{int(f['fps'])} fps")
        if f.get("ext"):
            label_bits.append(str(f.get("ext")).upper())
        if has_video and not has_audio:
            label_bits.append("video")
        elif has_audio and not has_video:
            label_bits.append("audio")
        else:
            label_bits.append("A/V")

        formats.append(
            FormatItem(
                format_id=fid,
                label=" · ".join(label_bits) or fid,
                ext=f.get("ext"),
                resolution=resolution,
                fps=f.get("fps"),
                vcodec=None if vcodec == "none" else vcodec,
                acodec=None if acodec == "none" else acodec,
                filesize=f.get("filesize"),
                filesize_approx=f.get("filesize_approx"),
                has_video=has_video,
                has_audio=has_audio,
            )
        )

    # Put higher quality first, keeping audio-only lower.
    formats.sort(
        key=lambda x: (
            1 if x.has_video else 0,
            int(re.search(r"(\\d{3,4})p", x.label).group(1)) if re.search(r"(\\d{3,4})p", x.label) else 0,
            x.fps or 0,
        ),
        reverse=True,
    )

    return ProbeResponse(
        title=info.get("title") or "Contenuto",
        webpage_url=info.get("webpage_url") or url,
        thumbnail=info.get("thumbnail"),
        duration=info.get("duration"),
        formats=formats,
    )


def download(url: str, format_id: str) -> Path:
    _check_url(url)
    safe_format = re.sub(r"[^A-Za-z0-9_+.-]", "", format_id)
    if not safe_format:
        raise HTTPException(400, "Formato non valido")

    before = set(DOWNLOAD_DIR.iterdir())
    opts = _ydl_base() | {
        "format": safe_format,
        "paths": {"home": str(DOWNLOAD_DIR)},
        "outtmpl": "%(title).120s-%(id)s.%(ext)s",
        "overwrites": False,
    }

    try:
        with YoutubeDL(opts) as ydl:
            ydl.download([url])
    except Exception as exc:
        raise HTTPException(422, f"Download non riuscito: {exc}") from exc

    after = set(DOWNLOAD_DIR.iterdir())
    created = [p for p in (after - before) if p.is_file()]
    if created:
        return max(created, key=lambda p: p.stat().st_mtime)

    # Fallback: newest file in directory.
    files = [p for p in DOWNLOAD_DIR.iterdir() if p.is_file()]
    if not files:
        raise HTTPException(500, "File scaricato non trovato")
    return max(files, key=lambda p: p.stat().st_mtime)
