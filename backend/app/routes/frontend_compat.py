from fastapi import APIRouter, HTTPException , Depends
from typing import Any, Dict
from datetime import datetime

from app.database.supabase_client import supabase
from app.services.customer_service import get_customer_detail
from app.services.decision_master_ai import analyze_with_make, MakeAnalysisError
from app.services.customer_service import create_customer as create_customer_service
from app.services.customer_service import create_transaction as create_transaction_service
from app.services.customer_service import create_transaction_and_decide
from app.services.customer_service import list_transactions as list_transactions_service
from app.services.customer_service import list_customers_with_metrics
from app.database.customer_queries import get_customer as get_customer_record
from app.auth import get_current_user
from app.auth import get_authed_client , get_token
router = APIRouter(
    prefix="/api",
    tags=["frontend_compat"],
)
from fastapi import APIRouter, Depends, HTTPException

import logging
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)


def validate_transaction_payload(payload: Dict[str, Any], current_user: str) -> None:
    if payload.get("type") not in ("credit", "payment"):
        raise HTTPException(status_code=400, detail="type must be 'credit' or 'payment'")

    try:
        amount = float(payload.get("amount"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount must be a positive number")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than zero")

    try:
        customer_id = int(payload.get("customer_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="valid customer_id required")

    try:
        customer = get_customer_record(customer_id, user_id=current_user)
    except Exception:
        customer = None
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")


@router.get("/settings")
def get_settings(
    user_id: str = Depends(get_current_user),
    token: str = Depends(get_token),
):
    db = get_authed_client(token)

    try:
        resp = (
            db.table("settings")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if resp.data:
            return resp.data[0]

        created = (
            db.table("settings")
            .upsert({"user_id": user_id, "defaultCreditLimit": 30000})
            .execute()
        )

        if not created.data:
            raise HTTPException(status_code=500, detail="Failed to create default settings")

        return created.data[0]

    except HTTPException:
        raise
    except Exception :
        logger.exception("get_settings failed")
        raise HTTPException(status_code=500, detail="Could not load settings")



@router.get("/customers")
def list_customers(current_user: str = Depends(get_current_user)):
    try:
        return list_customers_with_metrics(current_user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list customers: {e}")


@router.post("/customers")
def create_customer(payload: Dict[str, Any], current_user: str = Depends(get_current_user)):
    if not payload.get("name"):
        raise HTTPException(status_code=400, detail="name required")
    try:
        created = create_customer_service(payload, user_id=current_user)
        if created:
            return created
        raise HTTPException(status_code=500, detail="Customer creation returned no data")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create customer: {e}")


@router.get("/customers/{customer_id}")
def get_customer(customer_id: int, current_user: str = Depends(get_current_user)):
    try:
        detail = get_customer_detail(customer_id, user_id=current_user)
        if detail.get("customer"):
            return detail
        raise HTTPException(status_code=404, detail="not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get customer: {e}")


@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: int, current_user: str = Depends(get_current_user)):
    try:
        # Verify customer ownership
        customer = supabase.table("customers") \
            .select("id") \
            .eq("id", customer_id) \
            .eq("user_id", current_user) \
            .execute()

        if not customer.data:
            raise HTTPException(
                status_code=404,
                detail="Customer not found"
            )

        # Delete customer's transactions
        supabase.table("transactions") \
            .delete() \
            .eq("customer_id", customer_id) \
            .execute()

        # Delete customer
        result = supabase.table("customers") \
            .delete() \
            .eq("id", customer_id) \
            .eq("user_id", current_user) \
            .execute()

        if not result.data:
            raise HTTPException(
                status_code=500,
                detail="Customer was not deleted"
            )

        return {"ok": True, "message": "Customer deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete customer: {e}"
        )
        
        
        

@router.post("/transactions")
def create_transaction(payload: Dict[str, Any], current_user: str = Depends(get_current_user)):
    validate_transaction_payload(payload, current_user)
    try:
        created = create_transaction_service(payload, user_id=current_user)
        if created:
            return created
        raise HTTPException(status_code=500, detail="Transaction creation returned no data")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create transaction: {e}")


@router.get("/transactions")
def list_transactions(current_user: str = Depends(get_current_user)):
    try:
        txns = list_transactions_service(current_user)
        return txns if txns is not None else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list transactions: {e}")


@router.post("/transactions/with-decision")
def create_transaction_with_decision(payload: Dict[str, Any], current_user: str = Depends(get_current_user)):
    """
    Create a transaction, then immediately re-run the decision engine
    for that customer using their updated transaction history.
    """
    validate_transaction_payload(payload, current_user)

    try:
        result = create_transaction_and_decide(payload, use_supabase=True, user_id=current_user)
        if result.get("transaction"):
            return result
        raise HTTPException(status_code=500, detail="Transaction creation returned no data")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create transaction with decision: {e}")


@router.get("/summary")
def get_summary(current_user: str = Depends(get_current_user)):
    try:
        customers = list_customers_with_metrics(current_user)
        transactions = list_transactions_service(current_user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load summary data: {e}")

    total_credit = round(sum(float(t.get("amount", 0) or 0) for t in transactions if t.get("type") == "credit"), 2)
    total_paid = round(sum(float(t.get("amount", 0) or 0) for t in transactions if t.get("type") == "payment"), 2)
    # Use the same per-customer open-balance and FIFO payment allocation
    # metrics as the dashboard's local logic.
    outstanding = round(sum(float(c.get("outstanding", 0) or 0) for c in customers), 2)
    overdue = round(sum(float(c.get("overdue_amount", 0) or 0) for c in customers), 2)
    risky = sorted(
        [c for c in customers if float(c.get("risk_score", 0) or 0) >= 50],
        key=lambda c: c.get("risk_score", 0),
        reverse=True,
    )
    return {
        "totalCredit": total_credit,
        "totalPaid": total_paid,
        "outstanding": outstanding,
        "overdue": overdue,
        "customers": len(customers),
        "risky": risky,
    }


@router.delete("/data")
def clear_all_data(current_user: str = Depends(get_current_user)):
    try:
        supabase.table("transactions").delete().eq("user_id", current_user).execute()
        supabase.table("customers").delete().eq("user_id", current_user).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear data: {e}")


@router.post("/customers/{customer_id}/decision-analysis")
async def decision_master_analysis(
    customer_id: int,
    current_user: str = Depends(get_current_user),
):
    """
    Return the existing deterministic decision plus optional Make AI guidance.

    FastAPI remains responsible for authentication, customer ownership, data
    access, and risk calculations. Make receives only a small calculated
    snapshot and cannot read or write Supabase directly.
    """
    try:
        detail = get_customer_detail(customer_id, user_id=current_user)
    except Exception:
        logger.exception("Decision Master: failed to load customer %s", customer_id)
        raise HTTPException(status_code=404, detail="Customer not found")

    customer = detail.get("customer")
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    metrics = detail.get("processed_info") or {}
    decision = detail.get("decision") or {}

    # Send only fields the current backend schema actually stores.
    transaction_snapshot = []
    for transaction in detail.get("transactions") or []:
        transaction_snapshot.append({
            key: transaction.get(key)
            for key in ("type", "amount", "due_date", "paid_date", "created_at")
            if transaction.get(key) is not None
        })

    make_payload = {
        "schema_version": "creditpulse.decision-master.v1",
        "customer_metrics": {
            "balance": metrics.get("balance", 0),
            "overdue_amount": metrics.get("overdue_amount", 0),
            "days_late": metrics.get("days_late", 0),
            "risk_score": metrics.get("risk_score", 0),
            "risk_label": metrics.get("risk_label", "LOW"),
            "total_credit": metrics.get("total_credit", 0),
            "total_payment": metrics.get("total_payment", 0),
        },
        "limits": {
            "credit_limit": customer.get("credit_limit", 0),
            "overdue_day_limit": 45,
        },
        "existing_decision": decision,
        "transaction_history": transaction_snapshot,
        "instructions": (
            "Explain the supplied metrics and suggest practical follow-up. "
            "Do not recalculate or override the existing_decision."
        ),
    }

    try:
        ai_analysis = await analyze_with_make(make_payload)
        return {
            "customer_id": customer_id,
            "analysis_status": "available",
            "decision": decision,
            "metrics": metrics,
            "ai_analysis": ai_analysis,
        }
    except MakeAnalysisError:
        logger.warning(
            "Decision Master AI unavailable or returned invalid JSON for customer %s",
            customer_id,
        )
        return {
            "customer_id": customer_id,
            "analysis_status": "unavailable",
            "decision": decision,
            "metrics": metrics,
            "ai_analysis": None,
            "message": "AI guidance is temporarily unavailable; the existing decision is still available.",
        }
