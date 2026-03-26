"""Training script: fetch historical DONKI data and train GP models.

Usage:
    python -m scripts.train_models [--years-back 10] [--output models/]

This script:
1. Fetches historical CME, GST, and FLR data from DONKI
2. Builds a labeled training dataset (CME features -> Kp)
3. Trains the GP Regressor (Kp prediction with uncertainty)
4. Trains the GP Classifier (storm vs quiet)
5. Saves trained models to disk
6. Prints training metrics and feature relevance analysis
"""

import asyncio
import argparse
import numpy as np
from pathlib import Path

from app.data.donki_client import DONKIClient
from app.ml.features import build_training_dataset, normalize_features
from app.ml.gp_models import KpPredictor


async def main(years_back: int = 10, output_dir: str = "models"):
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    # ── Step 1: Fetch historical data ────────────────
    print(f"\n{'='*60}")
    print(f"  Project Helios — GP Model Training")
    print(f"  Fetching {years_back} years of DONKI data...")
    print(f"{'='*60}\n")

    client = DONKIClient()
    data = await client.fetch_historical_training_data(years_back=years_back)

    cmes = data["cmes"]
    gsts = data["gsts"]
    flares = data["flares"]

    print(f"  CME events:  {len(cmes)}")
    print(f"  GST events:  {len(gsts)}")
    print(f"  FLR events:  {len(flares)}")

    # ── Step 2: Build training dataset ───────────────
    print(f"\n  Building training dataset...")
    df = build_training_dataset(cmes, gsts, flares)

    if len(df) < 20:
        print(f"  ERROR: Only {len(df)} samples. Need at least 20.")
        print(f"  Try increasing years_back or check API key.")
        return

    print(f"  Total samples: {len(df)}")
    print(f"  Storm events (Kp>=5): {int(df['is_storm'].sum())}")
    print(f"  Quiet events (Kp<5):  {int((1 - df['is_storm']).sum())}")
    print(f"  Kp range: [{df['target_kp'].min():.1f}, {df['target_kp'].max():.1f}]")
    print(f"  Mean CME speed: {df['cme_speed'].mean():.0f} km/s")

    # ── Step 3: Normalize features ───────────────────
    X, norm_params = normalize_features(df, fit=True)
    y_kp = df["target_kp"].values.astype(np.float32)
    y_storm = df["is_storm"].values.astype(np.float32)

    print(f"\n  Feature matrix shape: {X.shape}")

    # ── Step 4: Train GP models ──────────────────────
    print(f"\n  Training GP Regressor (Matern-5/2 + ARD)...")
    predictor = KpPredictor()
    predictor.norm_params = norm_params

    metrics = predictor.train(
        X, y_kp, y_storm,
        n_epochs_reg=150,
        n_epochs_cls=100,
        lr=0.1,
    )

    # ── Step 5: Print results ────────────────────────
    print(f"\n{'='*60}")
    print(f"  Training Complete!")
    print(f"{'='*60}")
    print(f"\n  Regressor final loss:  {metrics['reg_final_loss']:.4f}")
    print(f"  Classifier final loss: {metrics['cls_final_loss']:.4f}")
    print(f"  Noise variance:        {metrics['noise_variance']:.4f}")

    print(f"\n  Feature Relevance (ARD — higher = more important):")
    relevance = metrics["feature_relevance"]
    for name, score in sorted(relevance.items(), key=lambda x: -x[1]):
        bar = "█" * int(score * 20)
        print(f"    {name:20s} {score:.4f}  {bar}")

    # ── Step 6: Validation predictions ───────────────
    print(f"\n  Sample predictions on training data:")
    preds = predictor.predict(X[:5])
    for i, (pred, true_kp) in enumerate(zip(preds, y_kp[:5])):
        print(
            f"    [{i}] True Kp={true_kp:.1f}  "
            f"Pred={pred.mean:.2f} ± {pred.std:.2f}  "
            f"95% CI=[{pred.lower_95:.2f}, {pred.upper_95:.2f}]  "
            f"P(storm)={pred.storm_prob:.3f}"
        )

    # ── Step 7: Save models ──────────────────────────
    model_path = output_path / "helios_gp_models.pt"
    predictor.save(str(model_path))
    print(f"\n  Models saved to: {model_path}")
    print(f"  Done!\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Helios GP models")
    parser.add_argument("--years-back", type=int, default=10)
    parser.add_argument("--output", type=str, default="models")
    args = parser.parse_args()

    asyncio.run(main(years_back=args.years_back, output_dir=args.output))
