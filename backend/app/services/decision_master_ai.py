"""Client for the CreditPulse Decision Master AI Make.com webhook.

The deterministic decision engine remains authoritative. This module sends a
small, already-calculated customer snapshot to Make and accepts only a
structured JSON analysis response.
"""
from __future__ import annotations

import os
from typing import Any

import httpx


_REQUIRED_FIELDS = {
    "summary": str,
    "risk_factors": list,
    "recommended_actions": list,
    "customer_message": str,
}


class MakeAnalysisError(RuntimeError):
    """Raised when Make is unavailable or returns an invalid AI response."""


def _validate_analysis(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise MakeAnalysisError("Make response must be a JSON object.")

    for field, expected_type in _REQUIRED_FIELDS.items():
        if not isinstance(data.get(field), expected_type):
            raise MakeAnalysisError(
                f"Make response field '{field}' must be {expected_type.__name__}."
            )

    if not all(isinstance(item, str) for item in data["risk_factors"]):
        raise MakeAnalysisError("risk_factors must contain only strings.")
    if not all(isinstance(item, str) for item in data["recommended_actions"]):
        raise MakeAnalysisError("recommended_actions must contain only strings.")

    confidence = data.get("confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        raise MakeAnalysisError("confidence must be a number between 0 and 1.")
    if not 0 <= confidence <= 1:
        raise MakeAnalysisError("confidence must be between 0 and 1.")

    return data


async def analyze_with_make(payload: dict[str, Any]) -> dict[str, Any]:
    """Send a pre-calculated snapshot to Make and validate its JSON response."""
    webhook_url = os.getenv("MAKE_CREDITPULSE_WEBHOOK_URL", "").strip()
    if not webhook_url:
        raise MakeAnalysisError("Make webhook is not configured.")

    timeout = httpx.Timeout(25.0, connect=8.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                webhook_url,
                json=payload,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise MakeAnalysisError("Make webhook request failed.") from exc

    try:
        result = response.json()
    except ValueError as exc:
        raise MakeAnalysisError(
            "Make must return a JSON object, not plain text."
        ) from exc

    return _validate_analysis(result)
