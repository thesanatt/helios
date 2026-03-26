"""Pydantic models for NASA DONKI API responses and internal data."""

from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


# ──────────────────────────────────────────────
# DONKI API Response Models
# ──────────────────────────────────────────────

class CMEAnalysis(BaseModel):
    """Single CME analysis measurement from DONKI."""
    time21_5: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    half_angle: float | None = Field(None, alias="halfAngle")
    speed: float | None = None
    type: str | None = None  # S, C, O (Slow, Common, Occasional)
    is_most_accurate: bool = Field(False, alias="isMostAccurate")
    note: str | None = None
    link: str | None = None

    model_config = {"populate_by_name": True}


class CMEEvent(BaseModel):
    """Coronal Mass Ejection event from DONKI."""
    activity_id: str = Field(..., alias="activityID")
    catalog: str | None = None
    start_time: datetime | None = Field(None, alias="startTime")
    source_location: str | None = Field(None, alias="sourceLocation")
    active_region_num: int | None = Field(None, alias="activeRegionNum")
    note: str | None = None
    cme_analyses: list[CMEAnalysis] | None = Field(None, alias="cmeAnalyses")
    linked_events: list[dict] | None = Field(None, alias="linkedEvents")

    model_config = {"populate_by_name": True}


class KpIndex(BaseModel):
    """Individual Kp measurement within a geomagnetic storm."""
    observed_time: datetime = Field(..., alias="observedTime")
    kp_type: str | None = Field(None, alias="kpType")
    kp_index: float = Field(..., alias="kpIndex")
    source: str | None = None

    model_config = {"populate_by_name": True}


class GSTEvent(BaseModel):
    """Geomagnetic Storm event from DONKI."""
    gst_id: str = Field(..., alias="gstID")
    start_time: datetime | None = Field(None, alias="startTime")
    all_kp_index: list[KpIndex] | None = Field(None, alias="allKpIndex")
    linked_events: list[dict] | None = Field(None, alias="linkedEvents")

    model_config = {"populate_by_name": True}


class SolarFlare(BaseModel):
    """Solar Flare event from DONKI."""
    flr_id: str = Field(..., alias="flrID")
    begin_time: datetime | None = Field(None, alias="beginTime")
    peak_time: datetime | None = Field(None, alias="peakTime")
    end_time: datetime | None = Field(None, alias="endTime")
    class_type: str | None = Field(None, alias="classType")
    source_location: str | None = Field(None, alias="sourceLocation")
    active_region_num: int | None = Field(None, alias="activeRegionNum")
    linked_events: list[dict] | None = Field(None, alias="linkedEvents")

    model_config = {"populate_by_name": True}


# ──────────────────────────────────────────────
# Internal Models
# ──────────────────────────────────────────────

class StormSeverity(str, Enum):
    """NOAA G-scale geomagnetic storm levels."""
    QUIET = "G0"
    MINOR = "G1"  # Kp=5
    MODERATE = "G2"  # Kp=6
    STRONG = "G3"  # Kp=7
    SEVERE = "G4"  # Kp=8
    EXTREME = "G5"  # Kp=9


class CMEFeatures(BaseModel):
    """Extracted feature vector for ML pipeline input."""
    cme_speed: float  # km/s
    cme_half_angle: float  # degrees
    cme_latitude: float | None = None
    cme_longitude: float | None = None
    associated_flare_class: float | None = None  # numeric (e.g., M1.0 -> 1.0)
    associated_flare_flux: float | None = None
    source_halo: bool = False  # full halo CME indicator
    timestamp: datetime | None = None


class KpPrediction(BaseModel):
    """GP model prediction output."""
    predicted_kp: float
    uncertainty_std: float
    lower_95: float
    upper_95: float
    storm_probability: float  # from GP classifier
    storm_severity: StormSeverity
    confidence: float  # model confidence score


class CMEArrivalPrediction(BaseModel):
    """CME Earth arrival time estimate."""
    cme_id: str
    estimated_arrival: datetime
    transit_hours: float
    transit_uncertainty_hours: float
    speed_at_1au: float | None = None


class EarthImpact(BaseModel):
    """Downstream Earth impact assessment."""
    kp_prediction: KpPrediction
    arrival: CMEArrivalPrediction | None = None
    gps_degradation_meters: float
    hf_radio_blackout: bool
    hf_blackout_latitudes: float | None = None  # min latitude affected
    satellite_risk_level: str  # low, moderate, high, extreme
    aurora_min_latitude: float  # minimum latitude for aurora visibility
    power_grid_risk: bool
    description: str


# ──────────────────────────────────────────────
# API Response Models
# ──────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    model_last_trained: datetime | None = None
    donki_last_polled: datetime | None = None


class PredictionResponse(BaseModel):
    """Full prediction response for the frontend."""
    timestamp: datetime
    active_cmes: list[CMEEvent]
    kp_prediction: KpPrediction
    arrival_predictions: list[CMEArrivalPrediction]
    earth_impact: EarthImpact
    model_metadata: dict
