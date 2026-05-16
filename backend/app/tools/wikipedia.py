"""Wikipedia geosearch tool: find notable places near a GPS point."""

import json
from typing import Any

import gradbot
import httpx
from loguru import logger

_SUMMARY_MAX_CHARS = 400
_THUMB_SIZE_PX = 480
_TIMEOUT_S = 10.0
# Wikipedia requires a meaningful User-Agent identifying the app + contact.
_USER_AGENT = (
    "CiceroneAudioGuide/0.1 (https://github.com/Elegary/hackaton-ultimate-audio-guide; "
    "contact@astro-automate.com)"
)

TOOL = gradbot.ToolDef(
    "search_nearby_landmarks",
    (
        "Search Wikipedia for notable places (monuments, museums, parks, "
        "landmarks, churches) around the user's current position. Always "
        "returns up to 5 results — the user-facing UI shows all of them, "
        "so do NOT limit yourself to one. Call this at the very start of "
        "the session to ground your greeting in a real nearby landmark, "
        "and any time the user asks what's around them or you need ideas "
        "for what to talk about next. Results include name, distance, a "
        "short description, a thumbnail URL, and the Wikipedia URL."
    ),
    json.dumps(
        {
            "type": "object",
            "properties": {
                "radius_m": {
                    "type": "number",
                    "description": (
                        "Search radius in meters. Default 500, max 5000. "
                        "Increase if the user explicitly asks to look further."
                    ),
                },
            },
            "required": [],
        }
    ),
)


async def run(
    *,
    lat: float,
    lng: float,
    radius_m: int = 500,
    limit: int = 5,
    lang: str = "en",
) -> list[dict[str, Any]]:
    """Geosearch + intro extracts. Returns a list of place dicts.

    Each dict: {title, lat, lng, distance_m, summary, url}.
    """
    radius_m = max(10, min(int(radius_m or 500), 5000))
    limit = max(1, min(int(limit or 5), 10))

    base_url = f"https://{lang}.wikipedia.org/w/api.php"

    async with httpx.AsyncClient(
        timeout=_TIMEOUT_S,
        headers={"User-Agent": _USER_AGENT},
    ) as client:
        geo = await client.get(
            base_url,
            params={
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lng}",
                "gsradius": radius_m,
                "gslimit": limit,
                "format": "json",
            },
        )
        geo.raise_for_status()
        hits = geo.json().get("query", {}).get("geosearch", [])
        if not hits:
            return []

        page_ids = "|".join(str(h["pageid"]) for h in hits)
        ext = await client.get(
            base_url,
            params={
                "action": "query",
                "prop": "extracts|info|pageimages",
                "exintro": 1,
                "explaintext": 1,
                "inprop": "url",
                "piprop": "thumbnail",
                "pithumbsize": _THUMB_SIZE_PX,
                "pageids": page_ids,
                "format": "json",
            },
        )
        ext.raise_for_status()
        pages = ext.json().get("query", {}).get("pages", {})

    results: list[dict[str, Any]] = []
    for h in hits:
        page = pages.get(str(h["pageid"]), {})
        description = (page.get("extract") or "").strip()
        if len(description) > _SUMMARY_MAX_CHARS:
            description = description[:_SUMMARY_MAX_CHARS].rsplit(" ", 1)[0] + "…"
        thumb = page.get("thumbnail") or {}
        results.append(
            {
                "title": h["title"],
                "lat": h["lat"],
                "lng": h["lon"],
                "distance_m": int(h["dist"]),
                "description": description,
                "photo_url": thumb.get("source"),
                "url": page.get("fullurl")
                or f"https://{lang}.wikipedia.org/?curid={h['pageid']}",
            }
        )

    logger.info(
        "wikipedia: {} results around ({}, {}) r={}m",
        len(results),
        lat,
        lng,
        radius_m,
    )
    return results
