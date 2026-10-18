from app.database.supabase_client import supabase
from datetime import datetime


def get_transactions(user_id=None):
    # Transactions are scoped through the customers owned by this user.
    if user_id is not None:
        cust_resp = (
            supabase.table("customers")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        cust_ids = [c.get("id") for c in (cust_resp.data or [])]
        if not cust_ids:
            return []
        response = (
            supabase.table("transactions")
            .select("*")
            .in_("customer_id", cust_ids)
            .execute()
        )
        return response.data or []

    response = supabase.table("transactions").select("*").execute()
    return response.data or []


def get_customer_transactions(customer_id, user_id=None):
    if user_id is not None:
        owner = (
            supabase.table("customers")
            .select("id")
            .eq("id", customer_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not owner.data:
            return []

    response = (
        supabase.table("transactions")
        .select("*")
        .eq("customer_id", customer_id)
        .execute()
    )
    return response.data or []


def create_transaction(payload, user_id=None):
    # Validate the parent customer before writing. Transactions are scoped
    # through customers because this schema does not store transactions.user_id.
    customer_id = payload.get("customer_id")
    if customer_id is None:
        raise ValueError("customer_id is required")

    if user_id is not None:
        owner = (
            supabase.table("customers")
            .select("id")
            .eq("id", customer_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not owner.data:
            raise ValueError("Customer not found for this account")

    txn_type = payload.get("type")
    if txn_type not in ("credit", "payment"):
        raise ValueError("type must be 'credit' or 'payment'")

    try:
        amount = float(payload.get("amount"))
    except (TypeError, ValueError):
        raise ValueError("amount must be a positive number")
    if amount <= 0:
        raise ValueError("amount must be greater than zero")

    clean_payload = dict(payload)
    clean_payload["amount"] = amount
    clean_payload.setdefault("created_at", datetime.utcnow().isoformat())
    response = supabase.table("transactions").insert(clean_payload).execute()
    return response.data[0] if response.data else None
