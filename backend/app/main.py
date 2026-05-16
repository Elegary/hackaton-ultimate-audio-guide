from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.config import settings
from app.ws_handler import handle_guide_session

app = FastAPI(title="Cicerone Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"service": "cicerone-backend", "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/guide")
async def guide_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("New guide session opened")
    try:
        await handle_guide_session(websocket)
    except Exception as e:
        logger.exception(f"Session error: {e}")
    finally:
        logger.info("Guide session closed")