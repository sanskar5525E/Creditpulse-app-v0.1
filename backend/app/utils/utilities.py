from __future__ import annotations

from datetime import datetime, date
from typing import Any, Optional


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(value, maximum))


def normalize_ratio(numerator: float, denominator: float) -> float:
    numerator = safe_float(numerator)
    denominator = safe_float(denominator)

    if denominator <= 0:
        return 0.0

    return clamp(numerator / denominator)


def parse_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None

    if isinstance(value, date):
        return value

    if isinstance(value, str):
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return None

    return None


def calculate_days_late(due_date: Any, paid_date: Any = None) -> int:
    """
    Calculate how many days late a payment is.
    
    Args:
        due_date: Expected payment date
        paid_date: Actual payment date (if None, uses today's date)
    
    Returns:
        - Positive int: Days late (payment after due date)
        - 0: Payment on-time or early (no late payment)
    
    Examples:
        - due=2026-06-10, paid=2026-06-15 → 5 (5 days late)
        - due=2026-06-10, paid=2026-06-08 → 0 (early payment)
        - due=2026-06-10, today=2026-06-15 (no paid_date) → 5 (5 days unpaid)
    """
    due = parse_date(due_date)
    if due is None:
        return 0

    # If payment was made, check if it was late
    if paid_date is not None:
        paid = parse_date(paid_date)
        if paid is None:
            return 0
        # Positive value = late payment, negative/zero = on-time or early
        # max(0, ...) ensures we don't return negative (early payments stay at 0)
        return max(0, (paid - due).days)

    # If no payment made yet, calculate days overdue from today
    today = date.today()
    return max(0, (today - due).days)


def is_overdue(days_late: int) -> bool:
    return days_late > 0


def delay_score(days_late: int, max_delay_days: int = 45) -> float:
    days_late = max(0, int(days_late))
    max_delay_days = max(1, int(max_delay_days))
    return clamp(days_late / max_delay_days)


def total_amount(transactions: list[dict[str, Any]], t_type: Optional[str] = None) -> float:
    total = 0.0

    for txn in transactions:
        if t_type is not None and txn.get("type") != t_type:
            continue
        total += safe_float(txn.get("amount"))

    return round(total, 2)


def calculate_balance(total_credit: float, total_payment: float) -> float:
    return round(safe_float(total_credit) - safe_float(total_payment), 2)


def credit_usage_ratio(balance: float, credit_limit: float) -> float:
    """
    Ratio of balance to credit limit. Intentionally NOT capped at 1.0 the
    way normalize_ratio() is — a customer at 600% of their limit is far
    riskier than one sitting right at 100%, and risk scoring needs to see
    that difference. calculate_risk_score() clamps the final 0-100 score,
    so this is free to grow without breaking the output range.
    """
    balance = safe_float(balance)
    credit_limit = safe_float(credit_limit)

    if credit_limit <= 0:
        return 0.0

    return max(0.0, balance / credit_limit)


def calculate_risk_score(
    days_late: int,
    balance: float,
    credit_limit: float,
    max_delay_days: int = 45,
) -> int:
    days_component = delay_score(days_late, max_delay_days)
    amount_component = credit_usage_ratio(balance, credit_limit)

    score = (0.7 * days_component) + (0.3 * amount_component)
    return max(0, min(int(round(score * 100)), 100))



def get_risk_label(score: int) -> str:
    score = max(0, min(int(score), 100))

    if score < 25:
        return "LOW"
    elif score < 50:
        return "MEDIUM"
    elif score < 75:
        return "HIGH"
    else:
        return "CRITICAL"


def get_action_suggestion(score: int) -> str:
    score = max(0, min(int(score), 100))

    if score < 25:
        return "Give goods"
    elif score < 50:
        return "Give carefully"
    elif score < 75:
        return "Ask for partial payment"
    else:
        return "Collect payment first"


def calculate_penalty(score: int, amount: float, max_penalty_rate: float = 0.10) -> float:
    score = max(0, min(int(score), 100))
    amount = safe_float(amount)
    max_penalty_rate = clamp(max_penalty_rate, 0.0, 1.0)

    if score <= 40:
        return 0.0

    normalized = (score - 40) / 60
    penalty = normalized * (max_penalty_rate * amount)
    return round(penalty, 2)


def format_amount(amount: float) -> str:
    return f"₹{safe_float(amount):,.0f}"


def format_phone(phone: Any) -> str:
    """
    Normalize Indian phone numbers to +91XXXXXXXXXX format.
    
    Accepts:
    - 10-digit: 9876543210 → +919876543210
    - 12-digit with 91 prefix: 919876543210 → +919876543210
    - With country code: 91-9876543210 → +919876543210
    
    Returns: Formatted phone as +91XXXXXXXXXX or empty string if invalid
    
    Args:
        phone: Phone number (string, int, or None)
    
    Returns:
        str: Formatted phone number in +91XXXXXXXXXX format
    """
    if phone is None:
        return ""
    
    # Keep only digits
    phone = str(phone)
    phone = "".join(ch for ch in phone if ch.isdigit())
    
    # Case 1: Standard 10-digit Indian mobile
    if len(phone) == 10:
        return "+91" + phone
    
    # Case 2: 12-digit with country code prefix (91XXXXXXXXXX)
    if len(phone) == 12 and phone.startswith("91"):
        return "+91" + phone[2:]
    
    # Case 3: More than 12 digits - take last 10 digits
    if len(phone) > 12:
        return "+91" + phone[-10:]
    
    # Invalid format
    return ""


def generate_reminder_message(name: str, amount: float, days_late: int) -> str:
    return (
        f"Hi {name}, your payment of {format_amount(amount)} is {days_late} days late. Please pay soon. Thank you."
    )
