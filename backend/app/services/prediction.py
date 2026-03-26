"""Prediction service — orchestrates the full pipeline from raw DONKI data to Earth impact assessment.

This is the central service that the API routes call. It:
1. Checks Redis cache for recent predictions
2. Fetches latest CME data from DONKI (or cache)
3. Extracts features from earth-directed CMEs
4. Runs GP regression + classification
5. Computes Earth impact assessment
6. Caches results and stores prediction records in PostgreSQL
"""

import json
import structlog
from datetime import datetime, timedelta
from pathlib import Path

from app.config import get_settings
from app.data.donki_client import DONKIClient
from app.ml.gp_models import KpPredictor, GPPrediction
from app.ml.features import extract_cme_features, normalize_features
from app.ml.impact import (
    assess_earth_impact,
    estimate_cme_transit,
    kp_to_storm_severity,
)
from app.models.schemas import (
    KpPrediction,
    EarthImpact,
    CMEArrivalPrediction,
    PredictionResponse,
)

logger = structlog.get_logger()
settings = get_settings()


class PredictionService:
    """Manages the full prediction lifecycle."""

    def __init__(self):
        self.donki = DONKIClient()
        self.predictor = KpPredictor()
        self.model_loaded = False
        self.model_version: str | None = None
        self.last_prediction: PredictionResponse | None = None
        self.last_prediction_time: datetime | None = None

    def load_model(self, path: str = "models/helios_gp_models.pt"):
        """Load trained GP models from disk."""
        model_path = Path(path)
        if model_path.exists():
            self.predictor.load(str(model_path))
            self.model_loaded = True
            self.model_version = model_path.stem
            logger.info("prediction_service_model_loaded", path=path)
        else:
            logger.warning("prediction_service_no_model", path=path)

    async def get_current_prediction(self) -> dict:
        """Generate current prediction from latest DONKI data.

        Uses GP models if trained, otherwise falls back to
        physics-based heuristic.
        """
        # Fetch recent CMEs
        end = datetime.utcnow()
        start = end - timedelta(days=7)

        cmes = await self.donki.get_cme_events(start, end)
        flares = await self.donki.get_solar_flares(start, end)

        if not cmes:
            return self._quiet_prediction()

        # Extract features from the most recent earth-directed CME
        latest_cme = cmes[-1]
        features = extract_cme_features(latest_cme, flares)

        if features is None:
            return self._quiet_prediction()

        # Route to GP model or heuristic
        if self.model_loaded:
            return await self._gp_prediction(features, latest_cme, len(cmes))
        else:
            return self._heuristic_prediction(features, latest_cme, len(cmes))

    async def _gp_prediction(self, features, cme, n_active_cmes: int) -> dict:
        """Generate prediction using trained GP models."""
        import numpy as np
        import pandas as pd

        # Build single-row dataframe for normalization
        row = {
            "cme_speed": features.cme_speed,
            "cme_half_angle": features.cme_half_angle,
            "cme_latitude": features.cme_latitude or 0.0,
            "cme_longitude": features.cme_longitude or 0.0,
            "flare_class": features.associated_flare_class or -8.0,
            "is_halo": float(features.source_halo),
        }
        df = pd.DataFrame([row])
        X, _ = normalize_features(df, fit=False)

        # Run GP prediction
        preds = self.predictor.predict(X)
        gp_pred = preds[0]

        kp_pred = KpPrediction(
            predicted_kp=gp_pred.mean,
            uncertainty_std=gp_pred.std,
            lower_95=gp_pred.lower_95,
            upper_95=gp_pred.upper_95,
            storm_probability=gp_pred.storm_prob,
            storm_severity=kp_to_storm_severity(gp_pred.mean),
            confidence=min(0.95, 1.0 - gp_pred.std / 3.0),
        )

        arrival = estimate_cme_transit(features.cme_speed, cme.activity_id)
        impact = assess_earth_impact(kp_pred, arrival)

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "kp_prediction": kp_pred.model_dump(),
            "arrival": arrival.model_dump(),
            "earth_impact": impact.model_dump(),
            "active_cmes": n_active_cmes,
            "model_status": "gp_trained",
            "model_version": self.model_version,
            "feature_relevance": gp_pred.feature_relevance,
        }

    def _heuristic_prediction(self, features, cme, n_active_cmes: int) -> dict:
        """Fallback: physics-based heuristic when GP models aren't trained."""
        speed = features.cme_speed
        half_angle = features.cme_half_angle

        # Empirical Kp estimation from CME parameters
        # Based on Gopalswamy et al. correlations
        estimated_kp = 0.0
        if speed > 300:
            estimated_kp = min(9.0, (speed - 300) / 150)
        if half_angle > 60:  # wide CME = more geo-effective
            estimated_kp *= 1.2
        if features.source_halo:
            estimated_kp *= 1.4
        estimated_kp = min(9.0, max(0.0, estimated_kp))

        kp_pred = KpPrediction(
            predicted_kp=estimated_kp,
            uncertainty_std=2.0,  # high uncertainty for heuristic
            lower_95=max(0, estimated_kp - 3.9),
            upper_95=min(9, estimated_kp + 3.9),
            storm_probability=0.4 if estimated_kp >= 4 else 0.1,
            storm_severity=kp_to_storm_severity(estimated_kp),
            confidence=0.3,  # low confidence for heuristic
        )

        arrival = estimate_cme_transit(speed, cme.activity_id)
        impact = assess_earth_impact(kp_pred, arrival)

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "kp_prediction": kp_pred.model_dump(),
            "arrival": arrival.model_dump(),
            "earth_impact": impact.model_dump(),
            "active_cmes": n_active_cmes,
            "model_status": "heuristic",
        }

    def _quiet_prediction(self) -> dict:
        """Return a quiet-conditions prediction when no CMEs are active."""
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


# Global singleton
prediction_service = PredictionService()
