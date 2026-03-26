"""API routes for Project Helios."""

from datetime import datetime, timedelta
from fastapi import APIRouter, Query, HTTPException

from app.data.donki_client import DONKIClient
from app.models.schemas import (
    HealthResponse, PredictionResponse, CMEEvent, GSTEvent,
    SolarFlare, KpPrediction, StormSeverity, EarthImpact,
)
from app.ml.impact import (
    assess_earth_impact, estimate_cme_transit,
    kp_to_storm_severity,
)

router = APIRouter()
donki = DONKIClient()


# ── Health ─────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        version="0.1.0",
        model_last_trained=None,
        donki_last_polled=None,
    )


# ── Live CME Data ──────────────────────────────────

@router.get("/cmes", response_model=list[CMEEvent])
async def get_cmes(
    days_back: int = Query(default=30, ge=1, le=365),
):
    """Fetch recent CME events from DONKI."""
    end = datetime.utcnow()
    start = end - timedelta(days=days_back)
    return await donki.get_cme_events(start, end)


@router.get("/storms", response_model=list[GSTEvent])
async def get_storms(
    days_back: int = Query(default=30, ge=1, le=365),
):
    """Fetch recent geomagnetic storm events."""
    end = datetime.utcnow()
    start = end - timedelta(days=days_back)
    return await donki.get_geomagnetic_storms(start, end)


@router.get("/flares", response_model=list[SolarFlare])
async def get_flares(
    days_back: int = Query(default=30, ge=1, le=365),
):
    """Fetch recent solar flare events."""
    end = datetime.utcnow()
    start = end - timedelta(days=days_back)
    return await donki.get_solar_flares(start, end)


# ── Predictions ────────────────────────────────────

@router.get("/predict/current")
async def predict_current():
    """Get current Kp prediction based on latest CME data.

    This endpoint:
    1. Fetches the latest CME events from DONKI
    2. Extracts features from earth-directed CMEs
    3. Runs the GP regression + classification models
    4. Returns Kp prediction with uncertainty + Earth impacts

    Uses GP models if trained, otherwise falls back to heuristic.
    """
    from app.services.prediction import prediction_service
    return await prediction_service.get_current_prediction()


# ── Historical Analysis ────────────────────────────

@router.get("/history/kp")
async def kp_history(
    days_back: int = Query(default=90, ge=7, le=365 * 5),
):
    """Fetch historical Kp data for model validation visualization."""
    end = datetime.utcnow()
    start = end - timedelta(days=days_back)
    storms = await donki.get_geomagnetic_storms(start, end)

    kp_series = []
    for storm in storms:
        if storm.all_kp_index:
            for kp in storm.all_kp_index:
                kp_series.append({
                    "time": kp.observed_time.isoformat(),
                    "kp": kp.kp_index,
                    "source": kp.source,
                })

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "total_storms": len(storms),
        "kp_series": sorted(kp_series, key=lambda x: x["time"]),
    }


# ── Model Info ─────────────────────────────────────

@router.get("/model/info")
async def model_info():
    """Return model metadata for the GP explainer page."""
    from app.services.prediction import prediction_service

    return {
        "regressor": {
            "type": "ExactGP",
            "kernel": "ScaleKernel(Matern52(ARD))",
            "features": [
                "cme_speed", "cme_half_angle", "cme_latitude",
                "cme_longitude", "flare_class", "is_halo",
            ],
            "trained": prediction_service.model_loaded,
        },
        "classifier": {
            "type": "VariationalGP (ADF approximation)",
            "kernel": "ScaleKernel(RBF(ARD))",
            "threshold": "Kp >= 5",
            "trained": prediction_service.model_loaded,
        },
        "data_source": "NASA DONKI (2010-present)",
        "reference": "Chakraborty & Morley (2020), J. Space Weather Space Clim.",
    }


@router.get("/model/validation")
async def model_validation(
    days_back: int = Query(default=90, ge=7, le=365),
):
    """Compare model predictions against actual observed Kp values.

    Returns time series of (predicted_kp, actual_kp, uncertainty)
    for model accuracy visualization.
    """
    # TODO: Pull from KpPredictionRecord table where actual_kp is filled
    # For now, return metadata about the validation approach
    return {
        "method": "Rolling backtest: train on data before event, predict, compare to observed Kp",
        "metrics": {
            "rmse": None,  # Will be computed after training
            "correlation": None,
            "storm_detection_tss": None,  # True Skill Statistic
            "comparison_baseline": "WSA-ENLIL+Cone (NASA operational model)",
        },
        "status": "awaiting_model_training",
    }

