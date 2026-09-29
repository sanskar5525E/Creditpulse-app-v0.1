from fastapi import Header, HTTPException , Depends
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return authorization.split(" ", 1)[1]


def get_current_user(token: str = Depends(get_token)) -> str:
    try:
        result = supabase.auth.get_claims(token)
        claims = result.get("claims") if hasattr(result, "get") else None

        if not claims:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = claims.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID missing from token")

        return user_id  # just the id, as before

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_authed_client(token: str):
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.postgrest.auth(token)
    return client
