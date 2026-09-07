import os
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.models import SearchResult


def _base_url() -> str:
    return os.environ.get("SEARXNG_URL", "").strip().rstrip("/")


def _source_from_url(url: str) -> str:
    host = (urlparse(url).hostname or "web").lower()
    return host.removeprefix("www.")


async def search_searxng(query: str) -> list[SearchResult]:
    base = _base_url()

    if not base:
        raise HTTPException(
            503,
            "SEARXNG_URL non configurato. Impostalo nel file .env per abilitare la ricerca.",
        )

    params = {
        "q": query,
        "format": "json",
        "language": "all",
        "safesearch": 1,
    }

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
            follow_redirects=True,
        ) as client:
            response = await client.get(
                f"{base}/search",
                params=params,
                headers={"User-Agent": "SEEK/0.1"},
            )

            response.raise_for_status()
            payload = response.json()

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            502,
            f"SearXNG ha risposto con HTTP {exc.response.status_code}",
        ) from exc

    except Exception as exc:
        raise HTTPException(
            502,
            f"Ricerca SearXNG non disponibile: {exc}",
        ) from exc

    out = []
    seen = set()

    for item in payload.get("results") or []:
        url = str(item.get("url") or "").strip()
        title = str(item.get("title") or "").strip()

        if not url or not title or url in seen:
            continue

        seen.add(url)

        thumbnail = (
            item.get("thumbnail")
            or item.get("img_src")
            or item.get("image")
            or None
        )

        source = str(
            item.get("engine")
            or item.get("source")
            or ""
        ).strip()

        if not source:
            source = _source_from_url(url)

        out.append(
            SearchResult(
                title=title,
                url=url,
                source=source,
                snippet=str(
                    item.get("content")
                    or item.get("description")
                    or ""
                ),
                thumbnail=str(thumbnail) if thumbnail else None,
            )
        )

        if len(out) >= 50:
            break

    return out
