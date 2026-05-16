"""FastAPI entry point: WebSocket session + Gradbot bundled JS + demo page."""

import pathlib

import fastapi
import gradbot
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app import guide, ws_handler

gradbot.init_logging()

app = fastapi.FastAPI(title="Cicerone Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cfg = gradbot.config.from_env()
_STATIC_DIR = pathlib.Path(__file__).parent.parent / "static"


def _apply_position(state: guide.AppState, pos: dict) -> None:
    """Update state from a {lat, lng, heading} dict; log invalid fields."""
    try:
        if "lat" in pos and pos["lat"] is not None:
            state.user_lat = float(pos["lat"])
        if "lng" in pos and pos["lng"] is not None:
            state.user_lng = float(pos["lng"])
        if "heading" in pos:
            h = pos["heading"]
            state.user_heading = float(h) % 360.0 if h is not None else None
    except (TypeError, ValueError) as exc:
        logger.warning("invalid position payload: {} ({})", pos, exc)


@app.websocket("/ws/chat")
async def ws_chat(websocket: fastapi.WebSocket) -> None:
    state = guide.AppState()

    async def on_start(msg: dict) -> gradbot.SessionConfig:
        _apply_position(
            state,
            {
                "lat": msg.get("lat"),
                "lng": msg.get("lng"),
                "heading": msg.get("heading"),
            },
        )
        state.language = msg.get("language") or "en"
        logger.info(
            "session start: lat={} lng={} heading={} lang={}",
            state.user_lat,
            state.user_lng,
            state.user_heading,
            state.language,
        )
        return guide.make_config(state, speaks_first=True)

    async def on_event(msg: dict) -> None:
        msg_type = msg.get("type")
        if msg_type == "position_update":
            _apply_position(state, msg)
            logger.info(
                "position update: lat={} lng={} heading={}",
                state.user_lat,
                state.user_lng,
                state.user_heading,
            )
            return
        logger.debug("unhandled event: {}", msg_type)

    async def on_tool_call(
        handle: gradbot.ToolHandle,
        input_handle: gradbot.SessionInputHandle,
        ws: fastapi.WebSocket,
    ) -> None:
        await guide.on_tool_call(state, handle, input_handle, ws)

    await ws_handler.handle_session(
        websocket,
        config=_cfg,
        on_start=on_start,
        on_event=on_event,
        on_tool_call=on_tool_call,
    )


gradbot.routes.setup(
    app,
    config=_cfg,
    static_dir=_STATIC_DIR,
    with_voices=False,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
