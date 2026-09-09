from app.database.supabase_client import supabase


def get_customer(customer_id, user_id=None):
    q = supabase.table("customers").select("*").eq("id", customer_id)
    if user_id is not None:
        q = q.eq("user_id", user_id)
    response = q.single().execute()
    return response.data

def list_customers(user_id=None):
    """
    Fetch all customer rows (raw, no computed metrics).
    Used by list_customers_with_metrics() to enrich each row
    with balance/risk data before returning to the frontend.
    """
    q = supabase.table("customers").select("*")
    if user_id is not None:
        q = q.eq("user_id", user_id)
    response = q.execute()
    return response.data or []

def create_customer(payload):
    response = (
        supabase
        .table("customers")
        .insert(payload)
        .execute()
    )
    return response.data[0] if response.data else None
