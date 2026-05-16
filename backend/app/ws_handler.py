"""WebSocket session handler — Gradbot session + custom JSON events.

Adapted from `gradbot.websocket.handle_session` (v0.1.8). The only behavioural
difference is in `handle_input`: any incoming JSON whose `type` is not one of
the Gradbot-reserved values ("start", "config", "stop") is forwarded to our
`on_event(msg)` callback instead of being silently dropped. This lets the
frontend stream `position_update`, `user_tap`, etc. over the same WebSocket
that carries the audio, without triggering Gradbot's disruptive session
reconfigure path (which restarts the conversation).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable

import fastapi
import gradbot
from gradbot import config as gradbot_config
from gradbot import schemas
from gradbot.websocket import ToolHandle, _ensure_async
from loguru import logger

_RESERVED_TYPES = {"start", "config", "stop"}

StartCallback = Callable[
    [dict], Awaitable[gradbot.SessionConfig] | gradbot.SessionConfig
]
EventCallback = Callable[[dict], Awaitable[None] | None]
ToolCallCallback = Callable[..., Awaitable[None]]


async def handle_session(
    websocket: fastapi.WebSocket,
    *,
    config: gradbot_config.Config,
    on_start: StartCallback,
    on_event: EventCallback | None = None,
    on_tool_call: ToolCallCallback | None = None,
) -> None:
    """Run a Gradbot voice session with custom-event dispatch."""
    run_kwargs = config.client_kwargs
    output_format = config.audio_format
    debug = config.debug

    on_start_async = _ensure_async(on_start)
    on_event_async = _ensure_async(on_event) if on_event is not None else None

    pending_tool_tasks: set[asyncio.Task[Any]] = set()
    stop_event = asyncio.Event()
    input_handle: gradbot.SessionInputHandle | None = None
    output_handle: gradbot.SessionOutputHandle | None = None

    async def send_error(exc: Exception) -> None:
        try:
            text = str(exc) if debug else "An error occurred"
            await websocket.send_json(schemas.Error(message=text).model_dump())
        except Exception:
            pass

    async def handle_input(raw: dict) -> bool:
        """Return False to stop the session."""
        if "bytes" in raw:
            assert input_handle is not None
            await input_handle.send_audio(raw["bytes"])
            return True
        if "text" not in raw:
            return True

        try:
            data = json.loads(raw["text"])
        except json.JSONDecodeError:
            logger.warning("non-JSON text frame ignored")
            return True

        msg_type = data.get("type")
        if msg_type == "stop":
            return False

        if msg_type in _RESERVED_TYPES:
            # Gradbot owns these; we don't expose on_config. Ignore silently.
            return True

        if on_event_async is not None and msg_type:
            try:
                await on_event_async(data)
            except Exception:
                logger.exception("on_event {} failed", msg_type)
        return True

    async def handle_output(msg: gradbot.MsgOut) -> None:
        nonlocal input_handle
        if msg.msg_type == "tool_call":
            if on_tool_call is None:
                return
            tool_handle = ToolHandle(msg.tool_call_handle, msg.tool_call)

            async def _safe(h: ToolHandle = tool_handle) -> None:
                try:
                    await on_tool_call(h, input_handle, websocket)
                except Exception as exc:
                    logger.exception("tool {} failed", h.name)
                    try:
                        await h.send_error(str(exc))
                    except Exception:
                        pass

            task = asyncio.create_task(_safe())
            pending_tool_tasks.add(task)
            task.add_done_callback(pending_tool_tasks.discard)
            return

        schema = schemas.from_msg(msg)
        if schema is None:
            return
        await websocket.send_json(schema.model_dump())
        if msg.msg_type == "audio":
            await websocket.send_bytes(msg.data)

    async def input_loop() -> None:
        while not stop_event.is_set():
            try:
                raw = await websocket.receive()
                if not await handle_input(raw):
                    stop_event.set()
                    if input_handle is not None:
                        await input_handle.close()
                    break
            except (fastapi.WebSocketDisconnect, RuntimeError):
                stop_event.set()
                if input_handle is not None:
                    await input_handle.close()
                break
            except Exception:
                logger.exception("input loop error")
                stop_event.set()
                break

    async def output_loop() -> None:
        while not stop_event.is_set():
            try:
                assert output_handle is not None
                msg = await output_handle.receive()
                if msg is None:
                    break
                await handle_output(msg)
            except Exception as exc:
                logger.exception("output loop error")
                await send_error(exc)
                break

    await websocket.accept()
    try:
        start_msg = await websocket.receive_json()
        if start_msg.get("type") != "start":
            await websocket.close(code=4000, reason="Expected start message")
            return

        try:
            session_cfg = await on_start_async(start_msg)
        except RuntimeError as exc:
            logger.error("on_start error: {}", exc)
            await websocket.close(code=4001, reason=str(exc))
            return

        input_handle, output_handle = await gradbot.run(
            **run_kwargs,
            session_config=session_cfg,
            input_format=gradbot.AudioFormat.OggOpus,
            output_format=output_format,
        )

        logger.info("session started")
        results = await asyncio.gather(
            output_loop(),
            input_loop(),
            return_exceptions=True,
        )
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error("task {} raised: {}", i, r)

    except Exception as exc:
        logger.exception("session error")
        await send_error(exc)
    finally:
        for t in pending_tool_tasks:
            t.cancel()
        if pending_tool_tasks:
            await asyncio.gather(*pending_tool_tasks, return_exceptions=True)
        try:
            await websocket.close()
        except Exception:
            pass
