from app.database.supabase_client import supabase
from datetime import datetime


def get_transactions(user_id=None):
    # If user_id is provided, first fetch that user's customer ids
    if user_id is not None:
        cust_resp = (
            supabase
            .table("customers")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        cust_ids = [c.get("id") for c in (cust_resp.data or [])]
        if not cust_ids:
            return []
        response = (
            supabase
            .table("transactions")
            .select("*")
            .in_("customer_id", cust_ids)
            .execute()
        )
        return response.data or []

    response = (
        supabase
        .table("transactions")
        .select("*")
        .execute()
    )
    return response.data or []


def get_customer_transactions(customer_id, user_id=None):
    q = (
        supabase
        .table("transactions")
        .select("*")
        .eq("customer_id", customer_id)
    )
    if user_id is not None:
        # ensure transaction belongs to a customer owned by this user
        # filter via a join-like check by verifying customer.user_id
        # Supabase client doesn't support joins here, so verify customer ownership first
        cust_resp = (
            supabase
            .table("customers")
            .select("id")
            .eq("id", customer_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not cust_resp.data:
            return []

    response = q.execute()
    return response.data or []


def create_transaction(payload, user_id=None):
    payload.setdefault("created_at", datetime.utcnow().isoformat())
    response = (
        supabase
        .table("transactions")
        .insert(payload)
        .execute()
    )
    return response.data[0] if response.data else None
