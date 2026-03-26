"""Project Helios — FastAPI application.

Real-time space weather prediction engine.
"""

import structlog
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.routes import router as api_router
from app.data.db import init_db, close_db
from app.services.scheduler import start_scheduler, stop_scheduler

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown."""
    logger.info("helios_starting", version="0.1.0")

    # Skip database and scheduler for local dev without PostgreSQL
    # await init_db()
    # start_scheduler()
    logger.info("running_without_database")

    # Load trained GP models
    from app.services.prediction import prediction_service
    prediction_service.load_model("models/helios_gp_models.pt")

    yield

    # Shutdown
    # stop_scheduler()
    # await close_db()
    logger.info("helios_shutting_down")


app = FastAPI(
    title="Project Helios",
    description="Space Weather Prediction Engine using Gaussian Process Regression",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(api_router, prefix="/api/v1")


# ── WebSocket for real-time predictions ──────────────────

class ConnectionManager:
    """Manages active WebSocket connections for live prediction streaming."""

    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info("ws_connected", total=len(self.active))

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)
        logger.info("ws_disconnected", total=len(self.active))

    async def broadcast(self, data: dict):
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()


@app.websocket("/ws/predictions")
async def prediction_stream(websocket: WebSocket):
    """Live prediction stream via WebSocket.

    Sends updated Kp predictions and CME tracking data
    whenever new DONKI data arrives or models update.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, receive any client messages
            data = await websocket.receive_text()
            # Client can request specific data
            if data == "ping":
                await websocket.send_json({"type": "pong", "ts": datetime.utcnow().isoformat()})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
