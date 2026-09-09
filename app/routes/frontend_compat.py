from fastapi import APIRouter, HTTPException , Depends
from typing import Any, Dict
from datetime import datetime

from app.database.supabase_client import supabase
from app.services.customer_service import get_customer_detail
from app.services.customer_service import create_customer as create_customer_service
from app.services.customer_service import create_transaction as create_transaction_service
from app.services.customer_service import create_transaction_and_decide
from app.services.customer_service import list_transactions as list_transactions_service
from app.auth import get_current_user

router = APIRouter(
    prefix="/api",
    tags=["frontend_compat"],
)

@router.get("/settings")
def get_settings():
    try:
        resp = supabase.table("settings").select("*").limit(1).execute()
        if resp.data:
            return resp.data[0]
        raise HTTPException(status_code=404, detail="Settings not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get settings: {e}")


@router.patch("/settings")
def patch_settings(payload: Dict[str, Any]):
    try:
        supabase.table("settings").upsert(payload).execute()
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {e}")



from app.services.customer_service import list_customers_with_metrics

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
        supabase.table("transactions").delete().eq("customer_id", customer_id).eq("user_id", current_user).execute()
        supabase.table("customers").delete().eq("id", customer_id).eq("user_id", current_user).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete customer: {e}")


@router.post("/transactions")
def create_transaction(payload: Dict[str, Any], current_user: str = Depends(get_current_user)):
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
    if not payload.get("customer_id"):
        raise HTTPException(status_code=400, detail="customer_id required")

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

    total_credit = sum([t.get("amount", 0) for t in transactions if t.get("type") == "credit"])
    total_paid = sum([t.get("amount", 0) for t in transactions if t.get("type") == "payment"])
    outstanding = total_credit - total_paid
    overdue = sum([
        t.get("amount", 0) for t in transactions
        if t.get("type") == "credit" and t.get("due_date") and t.get("due_date") < datetime.utcnow().date().isoformat()
    ])
    risky = sorted(customers, key=lambda c: c.get("outstanding", 0), reverse=True)[:10]
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
