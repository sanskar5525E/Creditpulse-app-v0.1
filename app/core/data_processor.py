from typing import Any

from app.utils.utilities import (
    calculate_balance,
    calculate_days_late,
    calculate_risk_score,
    get_risk_label,
    total_amount,
)


def process_customer_data(
    transactions: list[dict[str, Any]],
    credit_limit: float,
    max_delay_days: int = 45,
) -> dict[str, Any]:
    """
    Convert raw transaction data into clean metrics for the customer screen.
    Expected transaction shape:
    {
        "type": "credit" or "payment",
        "amount": 500,
        "due_date": "2026-04-01",   # optional
        "paid_date": "2026-04-10"   # optional
    }
    """

    total_credit = total_amount(transactions, "credit")
    total_payment = total_amount(transactions, "payment")
    balance = calculate_balance(total_credit, total_payment)

    overdue_days_list = []
    for txn in transactions:
        due_date = txn.get("due_date")
        paid_date = txn.get("paid_date")

        if due_date:
            days_late = calculate_days_late(due_date, paid_date)
            if days_late > 0:
                overdue_days_list.append(days_late)

    worst_days_late = max(overdue_days_list, default=0)

    risk_score = calculate_risk_score(
        days_late=worst_days_late,
        balance=balance,
        credit_limit=credit_limit,
        max_delay_days=max_delay_days,
    )

    risk_label = get_risk_label(risk_score)

    return {
        "total_credit": total_credit,
        "total_payment": total_payment,
        "balance": balance,
        "credit_limit": credit_limit,
        "days_late": worst_days_late,
        "risk_score": risk_score,
        "risk_label": risk_label,
        "transactions": transactions,
    }
