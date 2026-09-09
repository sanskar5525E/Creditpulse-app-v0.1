from __future__ import annotations

from typing import Any, Dict, List

from app.core.data_processor import process_customer_data
from app.core.decision_engine import build_customer_decision_payload
from app.database.customer_queries import get_customer
from app.database.customer_queries import create_customer as _create_customer_query
from app.database.transaction_queries import get_customer_transactions 
from app.database.transaction_queries import get_transactions as _get_transactions_query
from app.database.transaction_queries import create_transaction as _create_transaction_query


def run_customer_flow(
    customer: Dict[str, Any],
    transactions: List[Dict[str, Any]],
    max_delay_days: int = 45,
) -> Dict[str, Any]:
    """
    Orchestrate the end-to-end customer risk flow:
    input -> processed info -> decision combined -> output.
    """
    credit_limit = float(customer.get("credit_limit", 0))

    processed_info = process_customer_data(
        transactions=transactions,
        credit_limit=credit_limit,
        max_delay_days=max_delay_days,
    )

    decision_combined = build_customer_decision_payload(
        customer=customer,
        processed=processed_info,
    )

    return {
        "input": {
            "customer": customer,
            "transactions": transactions,
            "max_delay_days": max_delay_days,
        },
        "processed_info": processed_info,
        "decision_combined": decision_combined,
        "output": decision_combined,
    }


def analyze_customer(customer_id, user_id=None):
    """
    Analyze a customer by fetching their data and running the full risk flow.
    """
    customer = get_customer(customer_id, user_id=user_id)
    transactions = get_customer_transactions(customer_id, user_id=user_id)

    return run_customer_flow(
        customer=customer,
        transactions=transactions
    )


def get_customer_detail(customer_id, user_id=None) -> Dict[str, Any]:
    """
    Fetch a customer plus their transactions, along with the full risk
    analysis (processed metrics + decision) so the customer-detail view
    has everything it needs in one call.
    """
    customer = get_customer(customer_id, user_id=user_id)
    transactions = get_customer_transactions(customer_id, user_id=user_id)

    if not customer:
        return {"customer": None, "transactions": transactions}

    flow = run_customer_flow(customer=customer, transactions=transactions)

    return {
        "customer": customer,
        "transactions": transactions,
        "processed_info": flow["processed_info"],
        "decision": flow["decision_combined"],
    }


def create_customer(payload: Dict[str, Any], user_id: str | None = None) -> Dict[str, Any]:
    """
    Create a new customer record.
    """
    if user_id is not None:
        payload.setdefault("user_id", user_id)
    return _create_customer_query(payload)


def create_transaction(payload: Dict[str, Any], user_id: str | None = None) -> Dict[str, Any]:
    """
    Create a new transaction record.
    """
    return _create_transaction_query(payload, user_id=user_id)


def create_transaction_and_decide(payload: Dict[str, Any], use_supabase: bool = True, user_id: str | None = None) -> Dict[str, Any]:
    """
    Create a new transaction, then immediately re-run the risk/decision
    flow for that transaction's customer using their full transaction
    history. Returns both the created transaction and the fresh decision.

    If the customer or their history can't be loaded, or the risk flow
    itself fails, `decision` is None — but the transaction still saves,
    and every failure is logged instead of swallowed silently.
    """
    raw_customer_id = payload.get("customer_id")
    customer_id = None
    if raw_customer_id is not None:
        try:
            customer_id = int(raw_customer_id)
        except (TypeError, ValueError):
            print(f"[ERROR] create_transaction_and_decide: invalid customer_id {raw_customer_id!r}")

    transaction = None
    if use_supabase:
        try:
            transaction = _create_transaction_query(payload, user_id=user_id)
        except Exception as e:
            print(f"[ERROR] create_transaction_and_decide: transaction creation failed: {e}")

    customer = None
    transactions: List[Dict[str, Any]] = []
    if use_supabase and customer_id is not None:
        try:
            customer = get_customer(customer_id, user_id=user_id)
            transactions = get_customer_transactions(customer_id, user_id=user_id)
        except Exception as e:
            print(f"[ERROR] create_transaction_and_decide: failed to load customer/transactions for id={customer_id}: {e}")
            customer = None
            transactions = []

    decision = None
    if customer:
        try:
            decision = run_customer_flow(customer=customer, transactions=transactions)
        except Exception as e:
            print(f"[ERROR] create_transaction_and_decide: risk flow failed for customer_id={customer_id}: {e}")
            decision = None

    return {"transaction": transaction, "decision": decision}


def list_customers_with_metrics(user_id: str | None = None) -> List[Dict[str, Any]]:
    """
    Fetch all customers along with their computed risk metrics
    (outstanding balance, risk score, etc.) so the home/report list
    views can show real numbers instead of raw customer rows.
    """
    from app.database.customer_queries import list_customers as _list_customers_query

    customers = _list_customers_query(user_id=user_id)
    all_transactions = _get_transactions_query(user_id=user_id)

    # Group transactions by customer_id once, instead of querying per customer
    txns_by_customer: Dict[int, List[Dict[str, Any]]] = {}
    for t in all_transactions:
        cid = t.get("customer_id")
        txns_by_customer.setdefault(cid, []).append(t)

    enriched = []
    for customer in customers:
        cid = customer.get("id")
        transactions = txns_by_customer.get(cid, [])
        try:
            flow = run_customer_flow(customer=customer, transactions=transactions)
            metrics = flow["processed_info"]
        except Exception as e:
            print(f"[ERROR] list_customers_with_metrics: failed for customer_id={cid}: {e}")
            metrics = {"balance": 0, "risk_score": 0, "total_credit": 0, "total_payment": 0}

        enriched.append({
            **customer,
            "outstanding": metrics.get("balance", 0),
            "total_credit": metrics.get("total_credit", 0),
            "total_paid": metrics.get("total_payment", 0),
            "risk_score": metrics.get("risk_score", 0),
        })

    return enriched
    
def list_transactions(user_id: str | None = None) -> List[Dict[str, Any]]:
    """
    Fetch all transactions (optionally filtered by user).
    """
    return _get_transactions_query(user_id=user_id)
