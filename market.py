from __future__ import annotations

import time
from datetime import datetime
from typing import Any

import httpx

from config import RATE_PROVIDER_URL, RATE_VS_CURRENCY, RATE_REFRESH_SECONDS, RATE_COINS

_cache: dict[str, Any] = {
    "ts": 0.0,
    "data": None,
}


def _format_price(value: float) -> str:
    if value >= 1000:
        return f"{value:,.2f}".replace(",", " ")
    if value >= 100:
        return f"{value:.2f}"
    if value >= 1:
        return f"{value:.4f}"
    return f"{value:.6f}"


async def _fetch_rates() -> dict[str, Any]:
    ids = ",".join(RATE_COINS.keys())
    params = {
        "ids": ids,
        "vs_currencies": RATE_VS_CURRENCY,
        "include_last_updated_at": "true",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(RATE_PROVIDER_URL, params=params)
        response.raise_for_status()
        return response.json()


async def get_rates() -> dict[str, Any] | None:
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < RATE_REFRESH_SECONDS:
        return _cache["data"]

    try:
        data = await _fetch_rates()
    except Exception:
        return _cache.get("data")

    _cache["data"] = data
    _cache["ts"] = now
    return data


async def get_rates_text() -> str:
    data = await get_rates()
    if not data:
        return "Курс сейчас: временно недоступен."

    lines = [f"<b>Курс сейчас</b> ({RATE_VS_CURRENCY.upper()})"]
    last_updated = None
    for coin_id, label in RATE_COINS.items():
        coin_data = data.get(coin_id, {})
        value = coin_data.get(RATE_VS_CURRENCY)
        if isinstance(value, (int, float)):
            lines.append(f"{label}: {_format_price(float(value))}")
        if not last_updated:
            last_updated = coin_data.get("last_updated_at")

    if last_updated:
        stamp = datetime.utcfromtimestamp(int(last_updated)).strftime("%H:%M UTC")
        lines.append(f"Обновлено: {stamp}")

    return "\n".join(lines)
