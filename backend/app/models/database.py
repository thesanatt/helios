"""SQLAlchemy models for persistent storage of space weather events and predictions."""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, Float, String, DateTime, Boolean, Text,
    ForeignKey, JSON, Index,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class CMERecord(Base):
    """Stored CME event from DONKI."""
    __tablename__ = "cme_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    activity_id = Column(String(100), unique=True, nullable=False, index=True)
    start_time = Column(DateTime, index=True)
    source_location = Column(String(50))
    active_region_num = Column(Integer)

    # Best analysis measurements
    speed = Column(Float)
    half_angle = Column(Float)
    latitude = Column(Float)
    longitude = Column(Float)
    cme_type = Column(String(10))  # S, C, O
    is_halo = Column(Boolean, default=False)

    # Linked flare info
    linked_flare_class = Column(String(10))
    linked_flare_flux = Column(Float)

    # Raw JSON for full fidelity
    raw_json = Column(JSON)

    # Metadata
    fetched_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    predictions = relationship("KpPredictionRecord", back_populates="cme")

    __table_args__ = (
        Index("ix_cme_start", "start_time"),
    )


class GSTRecord(Base):
    """Stored geomagnetic storm event from DONKI."""
    __tablename__ = "gst_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    gst_id = Column(String(100), unique=True, nullable=False, index=True)
    start_time = Column(DateTime, index=True)
    peak_kp = Column(Float)
    kp_values = Column(JSON)  # list of {time, kp, source}
    linked_cme_ids = Column(JSON)  # list of activity_ids
    raw_json = Column(JSON)
    fetched_at = Column(DateTime, default=datetime.utcnow)


class SolarFlareRecord(Base):
    """Stored solar flare event from DONKI."""
    __tablename__ = "flare_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    flr_id = Column(String(100), unique=True, nullable=False, index=True)
    begin_time = Column(DateTime)
    peak_time = Column(DateTime, index=True)
    end_time = Column(DateTime)
    class_type = Column(String(10))  # e.g., M1.2, X5.4
    source_location = Column(String(50))
    active_region_num = Column(Integer)
    raw_json = Column(JSON)
    fetched_at = Column(DateTime, default=datetime.utcnow)


class KpPredictionRecord(Base):
    """Stored model prediction for audit and validation."""
    __tablename__ = "kp_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # What triggered this prediction
    cme_id = Column(Integer, ForeignKey("cme_events.id"), nullable=True)
    cme = relationship("CMERecord", back_populates="predictions")

    # Input features
    features = Column(JSON)  # {speed, half_angle, ...}

    # GP Regressor output
    predicted_kp = Column(Float, nullable=False)
    uncertainty_std = Column(Float)
    lower_95 = Column(Float)
    upper_95 = Column(Float)

    # GP Classifier output
    storm_probability = Column(Float)
    predicted_severity = Column(String(5))  # G0-G5

    # Downstream impacts
    gps_degradation_m = Column(Float)
    aurora_min_lat = Column(Float)
    satellite_risk = Column(String(20))

    # Model version for tracking
    model_version = Column(String(50))
    model_type = Column(String(20), default="gp")  # gp, heuristic

    # Validation: actual observed Kp (filled in later)
    actual_kp = Column(Float, nullable=True)
    actual_gst_id = Column(String(100), nullable=True)
    validated_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_pred_created", "created_at"),
    )


class ModelTrainingRun(Base):
    """Record of each model training run for reproducibility."""
    __tablename__ = "model_training_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Training data
    n_samples = Column(Integer)
    n_storms = Column(Integer)
    data_start_date = Column(DateTime)
    data_end_date = Column(DateTime)

    # Model config
    kernel_type = Column(String(20))  # matern52, rbf
    n_epochs_reg = Column(Integer)
    n_epochs_cls = Column(Integer)
    learning_rate = Column(Float)

    # Results
    reg_final_loss = Column(Float)
    cls_final_loss = Column(Float)
    noise_variance = Column(Float)
    feature_relevance = Column(JSON)  # {feature_name: score}

    # File paths
    model_path = Column(String(500))
    status = Column(String(20), default="running")  # running, completed, failed
    error_message = Column(Text, nullable=True)
