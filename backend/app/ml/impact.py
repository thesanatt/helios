"""Earth impact assessment from Kp predictions.

Translates predicted Kp index values into human-understandable
downstream effects: GPS degradation, radio blackouts, satellite
risk, aurora visibility, and power grid impacts.

Based on NOAA Space Weather Scales and published correlations.
"""

from app.models.schemas import (
    KpPrediction, EarthImpact, CMEArrivalPrediction,
    StormSeverity,
)


def kp_to_storm_severity(kp: float) -> StormSeverity:
    """Map Kp index to NOAA G-scale storm severity."""
    if kp < 5:
        return StormSeverity.QUIET
    elif kp < 6:
        return StormSeverity.MINOR
    elif kp < 7:
        return StormSeverity.MODERATE
    elif kp < 8:
        return StormSeverity.STRONG
    elif kp < 9:
        return StormSeverity.SEVERE
    else:
        return StormSeverity.EXTREME


def kp_to_aurora_latitude(kp: float) -> float:
    """Estimate minimum geographic latitude for aurora visibility.

    Empirical relationship: higher Kp pushes the aurora oval
    equatorward. At Kp=5, aurora visible ~60N. At Kp=9, ~40N.

    Based on NOAA OVATION model simplified relationship.
    """
    # Linear approximation: lat = 70 - 3.3 * kp (for kp >= 3)
    if kp < 3:
        return 67.0  # typical quiet-time aurora boundary
    return max(35.0, 70.0 - 3.3 * kp)


def kp_to_gps_degradation(kp: float) -> float:
    """Estimate GPS position error increase in meters.

    Geomagnetic storms cause ionospheric irregularities that
    degrade GPS accuracy. Based on Khurana (2017) CCMC study.
    """
    if kp < 5:
        return 0.0  # negligible
    elif kp < 6:
        return 2.0  # minor degradation
    elif kp < 7:
        return 5.0
    elif kp < 8:
        return 15.0
    else:
        return 30.0  # severe degradation


def assess_earth_impact(
    kp_pred: KpPrediction,
    arrival: CMEArrivalPrediction | None = None,
) -> EarthImpact:
    """Generate full Earth impact assessment from Kp prediction."""

    kp = kp_pred.predicted_kp
    severity = kp_to_storm_severity(kp)

    # HF radio blackout assessment
    hf_blackout = kp >= 6
    hf_lat = 65.0 - 2.5 * max(0, kp - 5) if hf_blackout else None

    # Satellite risk
    if kp < 5:
        sat_risk = "low"
    elif kp < 7:
        sat_risk = "moderate"
    elif kp < 8:
        sat_risk = "high"
    else:
        sat_risk = "extreme"

    # Power grid risk
    power_risk = kp >= 8

    # Aurora
    aurora_lat = kp_to_aurora_latitude(kp)

    # GPS
    gps_deg = kp_to_gps_degradation(kp)

    # Generate human-readable description
    descriptions = {
        StormSeverity.QUIET: "No significant geomagnetic activity expected. Normal operations.",
        StormSeverity.MINOR: (
            f"Minor G1 storm expected. Weak power grid fluctuations possible. "
            f"Aurora visible down to {aurora_lat:.0f}°N latitude. "
            f"Minor GPS degradation (~{gps_deg:.0f}m)."
        ),
        StormSeverity.MODERATE: (
            f"Moderate G2 storm expected. High-latitude power systems may experience "
            f"voltage alarms. HF radio may fade at high latitudes. "
            f"Aurora visible down to {aurora_lat:.0f}°N. GPS error ~{gps_deg:.0f}m."
        ),
        StormSeverity.STRONG: (
            f"Strong G3 storm predicted. Intermittent satellite navigation problems. "
            f"HF radio intermittent at high latitudes. Low-frequency radio navigation "
            f"degraded. Aurora visible down to {aurora_lat:.0f}°N."
        ),
        StormSeverity.SEVERE: (
            f"Severe G4 storm predicted. Widespread voltage control problems in power grids. "
            f"Some protective systems may trip key grid assets. Satellite surface charging "
            f"and tracking problems likely. HF radio propagation sporadic. "
            f"Aurora visible down to {aurora_lat:.0f}°N."
        ),
        StormSeverity.EXTREME: (
            f"Extreme G5 storm predicted! Widespread voltage collapse and transformer "
            f"damage possible in power grids. Extensive satellite charging, orientation "
            f"problems. HF radio blacked out for days. GPS severely degraded (~{gps_deg:.0f}m). "
            f"Aurora visible as far south as {aurora_lat:.0f}°N."
        ),
    }

    return EarthImpact(
        kp_prediction=kp_pred,
        arrival=arrival,
        gps_degradation_meters=gps_deg,
        hf_radio_blackout=hf_blackout,
        hf_blackout_latitudes=hf_lat,
        satellite_risk_level=sat_risk,
        aurora_min_latitude=aurora_lat,
        power_grid_risk=power_risk,
        description=descriptions[severity],
    )


def estimate_cme_transit(
    cme_speed: float,
    cme_id: str = "unknown",
) -> CMEArrivalPrediction:
    """Estimate CME arrival time at Earth using empirical drag model.

    Simple ballistic + drag model:
    - Fast CMEs (> 800 km/s) decelerate toward ambient solar wind (~400 km/s)
    - Slow CMEs (< 400 km/s) accelerate toward ambient
    - Transit distance: ~1 AU = 1.496e8 km

    More sophisticated: Gopalswamy et al. (2001) empirical model.
    """
    from datetime import datetime, timedelta

    AU_KM = 1.496e8  # 1 AU in km
    V_AMBIENT = 400.0  # ambient solar wind speed km/s

    # Effective speed at 1 AU (simple drag convergence)
    # v_eff = v_ambient + (v_cme - v_ambient) * exp(-drag * distance)
    drag_param = 0.5  # empirical
    v_effective = V_AMBIENT + (cme_speed - V_AMBIENT) * (1 - drag_param)
    v_effective = max(v_effective, 200.0)  # floor

    transit_seconds = AU_KM / v_effective
    transit_hours = transit_seconds / 3600.0

    # Uncertainty: ~20% for fast CMEs, ~30% for slow
    uncertainty_frac = 0.20 if cme_speed > 600 else 0.30
    uncertainty_hours = transit_hours * uncertainty_frac

    now = datetime.utcnow()

    return CMEArrivalPrediction(
        cme_id=cme_id,
        estimated_arrival=now + timedelta(hours=transit_hours),
        transit_hours=transit_hours,
        transit_uncertainty_hours=uncertainty_hours,
        speed_at_1au=v_effective,
    )
