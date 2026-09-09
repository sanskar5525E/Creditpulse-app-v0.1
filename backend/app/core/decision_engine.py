from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict
from urllib.parse import quote

from app.utils.utilities import (
    format_amount,
    format_phone,
    generate_reminder_message,
)


class RiskBand(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Action(str, Enum):
    ALLOW = "ALLOW"
    CAUTION = "CAUTION"
    PARTIAL_PAYMENT = "PARTIAL_PAYMENT"
    COLLECT_FIRST = "COLLECT_FIRST"


@dataclass(frozen=True)
class DecisionResult:
    score: int
    risk_label: str
    action: str
    recommendation: str
    should_remind: bool
    should_call: bool


def get_decision(score: int) -> DecisionResult:
    """
    Convert a risk score into a clear business decision.

    Score bands:
    - 0..24   => ALLOW
    - 25..49  => CAUTION
    - 50..74  => PARTIAL_PAYMENT
    - 75..100+ => COLLECT_FIRST
    """
    score = max(0, min(int(score), 100))

    if score < 25:
        risk_label = RiskBand.LOW
        action = Action.ALLOW
        recommendation = "Give goods"
        should_remind = False
        should_call = False
    elif score < 50:
        risk_label = RiskBand.MEDIUM
        action = Action.CAUTION
        recommendation = "Give carefully"
        should_remind = False
        should_call = False
    elif score < 75:
        risk_label = RiskBand.HIGH
        action = Action.PARTIAL_PAYMENT
        recommendation = "Ask for partial payment"
        should_remind = True
        should_call = False
    else:
        risk_label = RiskBand.CRITICAL
        action = Action.COLLECT_FIRST
        recommendation = "Collect payment first"
        should_remind = True
        should_call = True

    return DecisionResult(
        score=score,
        risk_label=risk_label.value,
        action=action.value,
        recommendation=recommendation,
        should_remind=should_remind,
        should_call=should_call,
    )


def build_customer_decision_payload(
    customer: Dict[str, Any],
    processed: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Combine processed customer metrics with a final decision and automation links.

    Expected customer keys:
    - name
    - phone
    - credit_limit

    Expected processed keys:
    - balance
    - days_late
    - risk_score
    - risk_label
    """
    name = str(customer.get("name", "Customer"))
    phone = format_phone(customer.get("phone", ""))

    balance = float(processed.get("balance", 0))
    days_late = int(processed.get("days_late", 0))
    score = int(processed.get("risk_score", 0))

    decision = get_decision(score)

    reminder_message = generate_reminder_message(name, balance, days_late)
    whatsapp_url = build_whatsapp_url(phone, reminder_message) if decision.should_remind else None
    tel_url = build_tel_url(phone) if decision.should_call else None

    return {
        "customer": {
            "name": name,
            "phone": phone,
            "credit_limit": customer.get("credit_limit", 0),
        },
        "metrics": {
            "balance": round(balance, 2),
            "days_late": days_late,
            "risk_score": score,
            "risk_label": processed.get("risk_label", decision.risk_label),
        },
        "decision": {
            "action": decision.action,
            "recommendation": decision.recommendation,
            "should_remind": decision.should_remind,
            "should_call": decision.should_call,
        },
        "automation": {
            "whatsapp_message": reminder_message if decision.should_remind else None,
            "whatsapp_url": whatsapp_url,
            "tel_url": tel_url,
        },
    }


def build_whatsapp_url(phone: str, message: str) -> str:
    """
    Build a wa.me link that can be opened by frontend/mobile to start WhatsApp.
    """
    phone = format_phone(phone)
    phone = phone.replace("+", "")
    encoded_message = quote(message)
    return f"https://wa.me/{phone}?text={encoded_message}"


def build_tel_url(phone: str) -> str:
    """
    Build a tel: link for one-tap calling from the device.
    """
    phone = format_phone(phone)
    return f"tel:{phone}"


def get_followup_actions(customer: Dict[str, Any], processed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convenience helper if you want only the decision + action links.
    """
    payload = build_customer_decision_payload(customer, processed)
    return {
        "action": payload["decision"]["action"],
        "recommendation": payload["decision"]["recommendation"],
        "whatsapp_url": payload["automation"]["whatsapp_url"],
        "tel_url": payload["automation"]["tel_url"],
    }
