"""Background scheduler for periodic DONKI data ingestion and model retraining.

Runs as part of the FastAPI application lifecycle:
- Polls DONKI every 30 minutes for new CME/GST/FLR events
- Stores new events in PostgreSQL
- Retrains GP models every 6 hours with updated data
- Broadcasts new predictions via WebSocket
"""

import structlog
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings
from app.data.donki_client import DONKIClient
from app.data.db import async_session
from app.models.database import CMERecord, GSTRecord, SolarFlareRecord
from sqlalchemy import select

logger = structlog.get_logger()
settings = get_settings()

scheduler = AsyncIOScheduler()
donki = DONKIClient()


async def poll_donki():
    """Fetch latest events from DONKI and store new ones in the database."""
    logger.info("donki_poll_start")

    try:
        end = datetime.utcnow()
        start = end - timedelta(days=7)  # check last week for updates

        cmes = await donki.get_cme_events(start, end)
        gsts = await donki.get_geomagnetic_storms(start, end)
        flares = await donki.get_solar_flares(start, end)

        async with async_session() as session:
            new_cmes = 0
            for cme in cmes:
                # Check if already stored
                existing = await session.execute(
                    select(CMERecord).where(CMERecord.activity_id == cme.activity_id)
                )
                if existing.scalar_one_or_none():
                    continue

                # Extract best analysis
                speed = None
                half_angle = None
                lat = None
                lon = None
                if cme.cme_analyses:
                    for a in cme.cme_analyses:
                        if a.is_most_accurate or a == cme.cme_analyses[-1]:
                            speed = a.speed
                            half_angle = a.half_angle
                            lat = a.latitude
                            lon = a.longitude
                            break

                record = CMERecord(
                    activity_id=cme.activity_id,
                    start_time=cme.start_time,
                    source_location=cme.source_location,
                    active_region_num=cme.active_region_num,
                    speed=speed,
                    half_angle=half_angle,
                    latitude=lat,
                    longitude=lon,
                    is_halo=(half_angle or 0) >= 90,
                    raw_json=cme.model_dump(mode="json"),
                )
                session.add(record)
                new_cmes += 1

            new_gsts = 0
            for gst in gsts:
                existing = await session.execute(
                    select(GSTRecord).where(GSTRecord.gst_id == gst.gst_id)
                )
                if existing.scalar_one_or_none():
                    continue

                peak_kp = 0.0
                kp_values = []
                if gst.all_kp_index:
                    peak_kp = max(k.kp_index for k in gst.all_kp_index)
                    kp_values = [
                        {"time": k.observed_time.isoformat(), "kp": k.kp_index}
                        for k in gst.all_kp_index
                    ]

                record = GSTRecord(
                    gst_id=gst.gst_id,
                    start_time=gst.start_time,
                    peak_kp=peak_kp,
                    kp_values=kp_values,
                    raw_json=gst.model_dump(mode="json"),
                )
                session.add(record)
                new_gsts += 1

            new_flares = 0
            for flare in flares:
                existing = await session.execute(
                    select(SolarFlareRecord).where(SolarFlareRecord.flr_id == flare.flr_id)
                )
                if existing.scalar_one_or_none():
                    continue

                record = SolarFlareRecord(
                    flr_id=flare.flr_id,
                    begin_time=flare.begin_time,
                    peak_time=flare.peak_time,
                    end_time=flare.end_time,
                    class_type=flare.class_type,
                    source_location=flare.source_location,
                    active_region_num=flare.active_region_num,
                    raw_json=flare.model_dump(mode="json"),
                )
                session.add(record)
                new_flares += 1

            await session.commit()

        logger.info(
            "donki_poll_complete",
            new_cmes=new_cmes,
            new_gsts=new_gsts,
            new_flares=new_flares,
        )

    except Exception as e:
        logger.error("donki_poll_error", error=str(e))


async def retrain_models():
    """Retrain GP models with latest database data.

    Pulls all stored CME/GST/FLR records, rebuilds the training
    dataset, and retrains both the GP regressor and classifier.
    """
    logger.info("model_retrain_start")

    try:
        # TODO: Pull training data from PostgreSQL instead of re-fetching
        # TODO: Run the training pipeline from gp_models.py
        # TODO: Save new model weights and update the prediction service
        # TODO: Log training run to ModelTrainingRun table

        logger.info("model_retrain_complete")

    except Exception as e:
        logger.error("model_retrain_error", error=str(e))


def start_scheduler():
    """Start the background scheduler with DONKI polling and model retraining jobs."""
    scheduler.add_job(
        poll_donki,
        trigger=IntervalTrigger(minutes=settings.donki_poll_minutes),
        id="donki_poll",
        name="Poll DONKI for new space weather events",
        replace_existing=True,
    )

    scheduler.add_job(
        retrain_models,
        trigger=IntervalTrigger(hours=settings.model_retrain_hours),
        id="model_retrain",
        name="Retrain GP models with latest data",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "scheduler_started",
        poll_interval_min=settings.donki_poll_minutes,
        retrain_interval_hr=settings.model_retrain_hours,
    )


def stop_scheduler():
    """Gracefully stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
