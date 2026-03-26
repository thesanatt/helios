# ☀️ Project Helios — Space Weather Prediction Engine

A real-time space weather prediction engine that uses **Gaussian Process Regression** to forecast geomagnetic storm severity (Kp index) from NASA DONKI coronal mass ejection data, with an interactive dashboard showing Earth impact predictions.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              DATA INGESTION LAYER               │
│  NASA DONKI (CME, GST, FLR) + NOAA OMNI        │
└──────────────────────┬──────────────────────────┘
                       │ ETL + Feature Engineering
┌──────────────────────▼──────────────────────────┐
│            BAYESIAN ML PIPELINE                 │
│  GP Classifier (ADF) → Storm/Quiet              │
│  GP Regressor → Kp with uncertainty bands       │
│  CME Arrival Estimator → Transit time           │
│  Impact Mapper → GPS, aurora, satellites        │
└──────────────────────┬──────────────────────────┘
                       │ JSON API
┌──────────────────────▼──────────────────────────┐
│          API + REAL-TIME LAYER                  │
│  FastAPI + Redis Cache + PostgreSQL + WebSocket  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│           FRONTEND (Next.js + TS)               │
│  Live CME Tracker (Three.js)                    │
│  Kp Prediction with GP Posterior Bands          │
│  Aurora Visibility Map (D3 Azimuthal)           │
│  Earth Impact Dashboard                         │
│  Interactive GP Explainer                       │
└─────────────────────────────────────────────────┘
```

## Tech Stack

### Backend
- **Python 3.11+** with **FastAPI**
- **GPyTorch** + **PyTorch** for Gaussian Process models
- **scikit-learn** for preprocessing and baselines
- **PostgreSQL** for historical event storage
- **Redis** for DONKI API response caching
- **APScheduler** for periodic data ingestion
- **WebSockets** for real-time prediction streaming

### Frontend
- **Next.js 14** with **TypeScript**
- **Three.js** / **React Three Fiber** for 3D solar system viz
- **D3.js** for aurora visibility map
- **Recharts** for GP posterior visualization
- **Tailwind CSS** for styling
- **Framer Motion** for animations

### Deployment
- **Vercel** (frontend)
- **Railway** or **Render** (backend + PostgreSQL + Redis)

## Key Features

1. **Real-time CME tracking** — 3D visualization of CME propagation from Sun to Earth
2. **Probabilistic Kp prediction** — GP posterior mean + 95% credible intervals
3. **Storm classification** — GP classifier with ADF (storm vs quiet)
4. **Earth impact assessment** — GPS degradation, HF radio blackout zones, satellite risk
5. **Aurora forecast map** — Kp-to-latitude aurora oval on azimuthal projection
6. **Interactive GP explainer** — Drag points, change kernels, watch posteriors reshape
7. **Historical model validation** — Compare GP predictions vs NASA's WSA-ENLIL

## Data Sources

| Source | Endpoint | Data |
|--------|----------|------|
| DONKI CME | `/DONKI/CME` | CME speed, half-angle, source location |
| DONKI CME Analysis | `/DONKI/CMEAnalysis` | WSA-ENLIL simulation results |
| DONKI GST | `/DONKI/GST` | Geomagnetic storm Kp values |
| DONKI FLR | `/DONKI/FLR` | Solar flare class, X-ray flux |
| DONKI IPS | `/DONKI/IPS` | Interplanetary shock arrivals |
| NOAA OMNI | `omniweb` | Solar wind Bz, density, velocity |

## Scientific References

- Chakraborty & Morley (2020). "Probabilistic prediction of geomagnetic storms and the Kp index." *J. Space Weather Space Clim.*
- Rasmussen & Williams (2006). *Gaussian Processes for Machine Learning.*
- Newell et al. (2007). "A nearly universal solar wind-magnetosphere coupling function."

## Setup

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your NASA API key
python -m app.main

# Frontend
cd frontend
npm install
npm run dev
```

## Environment Variables

```
NASA_API_KEY=your_key_here
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
```

## License

MIT
