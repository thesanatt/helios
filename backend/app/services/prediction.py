"""Lightweight prediction service for Render deployment."""

import structlog
from datetime import datetime, timedelta

from app.data.donki_client import DONKIClient
from app.models.schemas import (
    KpPrediction, EarthImpact, CMEArrivalPrediction,
)
from app.ml.impact import (
    assess_earth_impact, estimate_cme_transit, kp_to_storm_severity,
)

logger = structlog.get_logger()


class PredictionService:
    def __init__(self):
        self.donki = DONKIClient()
        self.model_loaded = False

    def load_model(self, path: str):
        logger.info("model_load_skipped_lightweight_mode")

    async def get_current_prediction(self) -> dict:
        end = datetime.utcnow()
        start = end - timedelta(days=7)

        cmes = await self.donki.get_cme_events(start, end)
        flares = await self.donki.get_solar_flares(start, end)

        if not cmes:
            return self._quiet_prediction()

        latest = cmes[-1]
        speed = 0.0
        half_angle = 0.0
        if latest.cme_analyses:
            for a in latest.cme_analyses:
                if a.speed:
                    speed = a.speed
                if a.half_angle:
                    half_angle = a.half_angle
                break

        # Physics-based heuristic
        kp = 0.0
        if speed > 300:
            kp = min(9.0, (speed - 300) / 150)
        if half_angle > 60:
            kp *= 1.2
        kp = min(9.0, max(0.0, kp))

        kp_pred = KpPrediction(
            predicted_kp=kp,
            uncertainty_std=2.0,
            lower_95=max(0, kp - 3.9),
            upper_95=min(9, kp + 3.9),
            storm_probability=0.4 if kp >= 4 else 0.1,
            storm_severity=kp_to_storm_severity(kp),
            confidence=0.3,
        )

        arrival = estimate_cme_transit(speed, latest.activity_id)
        impact = assess_earth_impact(kp_pred, arrival)

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "kp_prediction": kp_pred.model_dump(),
            "arrival": arrival.model_dump(),
            "earth_impact": impact.model_dump(),
            "active_cmes": len(cmes),
            "model_status": "heuristic",
        }

    def _quiet_prediction(self) -> dict:
        kp_pred = KpPrediction(
            predicted_kp=1.0,
            uncertainty_std=0.8,
            lower_95=0.0,
            upper_95=2.6,
            storm_probability=0.02,
            storm_severity="G0",
            confidence=0.85,
        )
        impact = assess_earth_impact(kp_pred, None)
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "kp_prediction": kp_pred.model_dump(),
            "arrival": None,
            "earth_impact": impact.model_dump(),
            "active_cmes": 0,
            "model_status": "quiet",
        }


prediction_service = PredictionService()