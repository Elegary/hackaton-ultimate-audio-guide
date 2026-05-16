"""Domain module for the audio guide: state, tools, prompt, tool handler."""

from __future__ import annotations

import dataclasses

import fastapi
import gradbot
import httpx
from loguru import logger

from app import geo
from app.tools import wikipedia as wiki_tool

# Emma — English female voice. Swap via /api/voices catalog if needed.
DEFAULT_VOICE_ID = "YTpq7expH9539ERJ"

SYSTEM_PROMPT = """You are a warm, knowledgeable audio guide on a phone call.

The user just connected. You know their GPS coordinates:
- latitude: {lat}
- longitude: {lng}

## Opening (ONCE, only on the very first turn of the session)

On your very first turn — and never again — call the \
`search_nearby_landmarks` tool, pick the single most interesting place (a \
famous monument, museum, park, or landmark — not a random street or \
neighborhood), and open with a short warm sentence that anchors on it AND \
uses its direction and distance. Example: "Hi! Just on your left, fifty \
meters away, that's the Eiffel Tower — want to hear its story?".

## Continuing the conversation

After your first turn you are MID-CONVERSATION. From that point on:

- NEVER say "Hi", "Hello", "Welcome" or any other greeting again. You have \
  already met the user.
- If you were just interrupted and the user said nothing intelligible \
  (silence, noise, a half-word), simply ask "Sorry, did you say something?" \
  or "I lost you — can you repeat?". Do not restart your previous topic from \
  scratch.
- If the user asks a question, answer it directly. No preamble.
- If the user goes quiet for a while, you can offer a follow-up about the \
  current place, or suggest exploring something else nearby — but do not \
  greet them.
- Re-call `search_nearby_landmarks` whenever the user asks what's around, \
  has clearly moved, or you need fresh ideas. Do NOT re-call it just because \
  it's a new turn.

## Tool result fields

Each result includes:
- `distance_m`: distance from the user in meters
- `direction`: "left", "right", "front" or "behind" relative to where the \
  user is facing
- `summary`: a short Wikipedia intro
- `title`, `url`, `lat`, `lng`: metadata

Always use `direction` and round `distance_m` to a natural number of meters \
(say "fifty meters", not "53 meters").

## Style

- Speak naturally, as if on a phone call. No bullet points, no markdown.
- Never read URLs, coordinates, or Wikipedia page titles verbatim.
- Keep replies short (1-3 sentences) — this is audio, not a wiki article."""


@dataclasses.dataclass
class AppState:
    """Per-session state held inside the WS handler."""

    session_id: str = ""
    language: str = "en"
    user_lat: float = 0.0
    user_lng: float = 0.0
    user_heading: float | None = None


TOOLS: list[gradbot.ToolDef] = [wiki_tool.TOOL]


def _build_prompt(state: AppState) -> str:
    return SYSTEM_PROMPT.format(lat=state.user_lat, lng=state.user_lng)


def make_config(
    state: AppState,
    *,
    speaks_first: bool = True,
) -> gradbot.SessionConfig:
    cfg = gradbot.config.from_env()
    lang = gradbot.LANGUAGES.get(state.language, gradbot.Lang.En)
    return gradbot.SessionConfig(
        voice_id=DEFAULT_VOICE_ID,
        instructions=_build_prompt(state),
        language=lang,
        tools=TOOLS,
        **{"assistant_speaks_first": speaks_first} | cfg.session_kwargs,
    )


async def on_tool_call(
    state: AppState,
    handle: gradbot.ToolHandle,
    input_handle: gradbot.SessionInputHandle,
    websocket: fastapi.WebSocket,
) -> None:
    """Dispatch a tool call from the LLM."""
    del input_handle  # not used yet
    name = handle.name
    args = handle.args
    logger.info("tool call: {} args={}", name, args)

    if name == "search_nearby_landmarks":
        radius_m = args.get("radius_m") or 500
        limit = args.get("limit") or 5
        try:
            results = await wiki_tool.run(
                lat=state.user_lat,
                lng=state.user_lng,
                radius_m=radius_m,
                limit=limit,
                lang=state.language,
            )
        except httpx.HTTPError as exc:
            logger.exception("wikipedia search failed")
            await handle.send_error(f"Wikipedia search failed: {exc}")
            return

        for r in results:
            bearing = geo.compute_bearing(
                state.user_lat, state.user_lng, r["lat"], r["lng"]
            )
            distance = geo.haversine(
                state.user_lat, state.user_lng, r["lat"], r["lng"]
            )
            r["bearing"] = round(bearing, 1)
            r["distance_m"] = int(round(distance))
            r["direction"] = geo.bearing_to_direction(bearing, state.user_heading)

        await websocket.send_json(
            {
                "type": "wikipedia_results",
                "search": {
                    "lat": state.user_lat,
                    "lng": state.user_lng,
                    "heading": state.user_heading,
                    "radius_m": int(radius_m),
                },
                "results": results,
            }
        )

        await handle.send_json({"results": results})
        return

    await handle.send_error(f"Unknown tool: {name}")
