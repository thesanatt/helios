"""Feature engineering for the GP pipeline.

Transforms raw DONKI CME/flare/storm data into feature vectors
suitable for Gaussian Process regression and classification.

Features based on Chakraborty & Morley (2020) and the
WSA-ENLIL+Cone validation literature.
"""

import numpy as np
import pandas as pd
import structlog
from datetime import datetime, timedelta

from app.models.schemas import (
    CMEEvent, GSTEvent, SolarFlare, CMEFeatures,
)

logger = structlog.get_logger()


# ── Flare class parsing ──────────────────────────────────

def parse_flare_class(class_type: str | None) -> tuple[float, str]:
    """Convert flare class string (e.g., 'M1.2', 'X5.4') to numeric value.

    Returns (numeric_value, base_class).
    Encoding: B=1e-7, C=1e-6, M=1e-5, X=1e-4 (W/m^2 peak flux).
    We return the log10 of flux for better GP behavior.
    """
    if not class_type:
        return 0.0, "none"

    class_type = class_type.strip()
    base = class_type[0].upper()
    try:
        magnitude = float(class_type[1:]) if len(class_type) > 1 else 1.0
    except ValueError:
        magnitude = 1.0

    multipliers = {"A": 1e-8, "B": 1e-7, "C": 1e-6, "M": 1e-5, "X": 1e-4}
    flux = multipliers.get(base, 1e-7) * magnitude
    return np.log10(flux), base


# ── CME feature extraction ───────────────────────────────

def extract_cme_features(cme: CMEEvent, flares: list[SolarFlare]) -> CMEFeatures | None:
    """Extract feature vector from a single CME event.

    Selects the most accurate CME analysis measurement and links
    to the nearest associated solar flare (if any).
    """
    if not cme.cme_analyses:
        return None

    # Pick the most accurate analysis, or the last one
    best = None
    for analysis in cme.cme_analyses:
        if analysis.is_most_accurate:
            best = analysis
            break
    if best is None:
        best = cme.cme_analyses[-1]

    if best.speed is None or best.half_angle is None:
        return None

    # Link to nearest flare within +/- 6 hours of CME start
    flare_class = None
    flare_flux = None
    if cme.start_time and flares:
        window = timedelta(hours=6)
        candidates = [
            f for f in flares
            if f.peak_time
            and abs((f.peak_time - cme.start_time).total_seconds()) < window.total_seconds()
        ]
        if candidates:
            nearest = min(candidates, key=lambda f: abs((f.peak_time - cme.start_time).total_seconds()))
            flare_flux_val, _ = parse_flare_class(nearest.class_type)
            flare_class = flare_flux_val
            flare_flux = flare_flux_val

    # Determine if halo CME (half-angle >= 90 degrees)
    is_halo = best.half_angle >= 90.0

    return CMEFeatures(
        cme_speed=best.speed,
        cme_half_angle=best.half_angle,
        cme_latitude=best.latitude,
        cme_longitude=best.longitude,
        associated_flare_class=flare_class,
        associated_flare_flux=flare_flux,
        source_halo=is_halo,
        timestamp=cme.start_time,
    )


# ── Training dataset builder ────────────────────────────

def build_training_dataset(
    cmes: list[CMEEvent],
    gsts: list[GSTEvent],
    flares: list[SolarFlare],
) -> pd.DataFrame:
    """Build a labeled training dataset linking CMEs to resulting Kp.

    For each CME, we:
    1. Extract CME features (speed, half-angle, flare class, etc.)
    2. Find the geomagnetic storm (if any) within 1-5 days after CME
    3. Record the peak Kp index as the label

    CMEs with no resulting storm get Kp=0 (quiet conditions).
    """
    records = []

    # Build a lookup: for each GST, get peak Kp and start time
    gst_events = []
    for gst in gsts:
        if gst.all_kp_index:
            peak_kp = max(k.kp_index for k in gst.all_kp_index)
            gst_events.append({
                "start": gst.start_time,
                "peak_kp": peak_kp,
                "gst_id": gst.gst_id,
            })

    for cme in cmes:
        features = extract_cme_features(cme, flares)
        if features is None:
            continue

        # Find resulting GST within 1-5 day transit window
        target_kp = 0.0  # default: no storm
        matched_gst = None

        if cme.start_time:
            transit_min = cme.start_time + timedelta(hours=18)  # fastest CMEs
            transit_max = cme.start_time + timedelta(days=5)    # slowest CMEs

            candidates = [
                g for g in gst_events
                if g["start"] and transit_min <= g["start"] <= transit_max
            ]
            if candidates:
                # Take the strongest storm in the window
                best_match = max(candidates, key=lambda g: g["peak_kp"])
                target_kp = best_match["peak_kp"]
                matched_gst = best_match["gst_id"]

        records.append({
            "cme_speed": features.cme_speed,
            "cme_half_angle": features.cme_half_angle,
            "cme_latitude": features.cme_latitude or 0.0,
            "cme_longitude": features.cme_longitude or 0.0,
            "flare_class": features.associated_flare_class or -8.0,  # log10(1e-8)
            "is_halo": float(features.source_halo),
            "target_kp": target_kp,
            "is_storm": float(target_kp >= 5.0),
            "cme_timestamp": features.timestamp,
            "matched_gst": matched_gst,
        })

    df = pd.DataFrame(records)
    logger.info(
        "training_dataset_built",
        total_samples=len(df),
        storms=int(df["is_storm"].sum()) if len(df) > 0 else 0,
        quiet=int((1 - df["is_storm"]).sum()) if len(df) > 0 else 0,
    )
    return df


# ── Feature normalization ────────────────────────────────

def normalize_features(df: pd.DataFrame, fit: bool = True) -> tuple[np.ndarray, dict]:
    """Normalize features using Box-Cox / log transforms for GP compatibility.

    Following Chakraborty & Morley (2020): transform substantially
    non-normal features for better GP behavior.

    Returns (X_normalized, normalization_params).
    """
    feature_cols = [
        "cme_speed", "cme_half_angle", "cme_latitude",
        "cme_longitude", "flare_class", "is_halo",
    ]

    X = df[feature_cols].values.copy()
    params = {}

    if fit:
        # Log-transform speed (heavily right-skewed)
        X[:, 0] = np.log1p(X[:, 0])
        params["speed_transform"] = "log1p"

        # Standardize each column
        means = np.nanmean(X, axis=0)
        stds = np.nanstd(X, axis=0)
        stds[stds < 1e-8] = 1.0  # avoid division by zero
        X = (X - means) / stds

        params["means"] = means.tolist()
        params["stds"] = stds.tolist()
    else:
        # Apply stored transforms
        X[:, 0] = np.log1p(X[:, 0])
        means = np.array(params.get("means", np.zeros(X.shape[1])))
        stds = np.array(params.get("stds", np.ones(X.shape[1])))
        X = (X - means) / stds

    # Replace NaN with 0 (after normalization, 0 = mean)
    X = np.nan_to_num(X, nan=0.0)

    return X, params
