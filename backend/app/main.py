from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# from app.config import settings
# from app.ws_handler import handle_guide_session

app = FastAPI(title="Cicerone Backend")

app.add_middleware(
    CORSMiddleware,
    # allow all origins for development; in production, specify allowed origins
    allow_origins=["*"],
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
