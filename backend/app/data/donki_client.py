"""NASA DONKI API client for fetching space weather data."""

import httpx
import structlog
from datetime import datetime, timedelta
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.models.schemas import CMEEvent, GSTEvent, SolarFlare

logger = structlog.get_logger()


class DONKIClient:
    """Async client for NASA's DONKI (Space Weather Database of
    Notifications, Knowledge, Information) API."""

    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.donki_base_url
        self.api_key = self.settings.nasa_api_key

    def _params(self, start: datetime, end: datetime, **extra) -> dict:
        return {
            "startDate": start.strftime("%Y-%m-%d"),
            "endDate": end.strftime("%Y-%m-%d"),
            "api_key": self.api_key,
            **extra,
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _get(self, endpoint: str, params: dict) -> list[dict]:
        """Make authenticated GET request to DONKI with retry."""
        url = f"{self.base_url}/{endpoint}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            logger.info(
                "donki_fetch",
                endpoint=endpoint,
                count=len(data) if isinstance(data, list) else 1,
            )
            return data if isinstance(data, list) else [data]

    # ── CME Events ──────────────────────────────────────

    async def get_cme_events(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[CMEEvent]:
        """Fetch Coronal Mass Ejection events.

        Default: last 30 days.
        """
        end = end or datetime.utcnow()
        start = start or (end - timedelta(days=30))
        raw = await self._get("CME", self._params(start, end))
        return [CMEEvent.model_validate(item) for item in raw]

    async def get_cme_analysis(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
        most_accurate_only: bool = True,
        min_speed: int = 0,
    ) -> list[dict]:
        """Fetch CME Analysis data with WSA-ENLIL simulation results."""
        end = end or datetime.utcnow()
        start = start or (end - timedelta(days=30))
        params = self._params(
            start, end,
            mostAccurateOnly=str(most_accurate_only).lower(),
            speed=min_speed,
            catalog="ALL",
        )
        return await self._get("CMEAnalysis", params)

    # ── Geomagnetic Storms ──────────────────────────────

    async def get_geomagnetic_storms(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[GSTEvent]:
        """Fetch Geomagnetic Storm events with Kp indices."""
        end = end or datetime.utcnow()
        start = start or (end - timedelta(days=30))
        raw = await self._get("GST", self._params(start, end))
        return [GSTEvent.model_validate(item) for item in raw]

    # ── Solar Flares ────────────────────────────────────

    async def get_solar_flares(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[SolarFlare]:
        """Fetch Solar Flare events."""
        end = end or datetime.utcnow()
        start = start or (end - timedelta(days=30))
        raw = await self._get("FLR", self._params(start, end))
        return [SolarFlare.model_validate(item) for item in raw]

    # ── Interplanetary Shocks ───────────────────────────

    async def get_interplanetary_shocks(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[dict]:
        """Fetch Interplanetary Shock events."""
        end = end or datetime.utcnow()
        start = start or (end - timedelta(days=30))
        return await self._get("IPS", self._params(start, end))

    # ── Bulk Historical Fetch ───────────────────────────

    async def fetch_historical_training_data(
        self,
        years_back: int = 10,
    ) -> dict:
        """Fetch historical data for model training.

        Pulls CMEs, GSTs, and flares going back `years_back` years.
        Chunks requests into 6-month windows to respect API limits.
        """
        end = datetime.utcnow()
        start = end - timedelta(days=365 * years_back)

        all_cmes: list[CMEEvent] = []
        all_gsts: list[GSTEvent] = []
        all_flares: list[SolarFlare] = []

        # Chunk into 6-month windows
        current = start
        while current < end:
            window_end = min(current + timedelta(days=180), end)
            logger.info(
                "historical_fetch_window",
                start=current.isoformat(),
                end=window_end.isoformat(),
            )

            cmes = await self.get_cme_events(current, window_end)
            gsts = await self.get_geomagnetic_storms(current, window_end)
            flares = await self.get_solar_flares(current, window_end)

            all_cmes.extend(cmes)
            all_gsts.extend(gsts)
            all_flares.extend(flares)

            current = window_end + timedelta(days=1)

        logger.info(
            "historical_fetch_complete",
            cmes=len(all_cmes),
            gsts=len(all_gsts),
            flares=len(all_flares),
        )

        return {
            "cmes": all_cmes,
            "gsts": all_gsts,
            "flares": all_flares,
        }
