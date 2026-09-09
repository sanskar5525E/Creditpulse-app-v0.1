from fastapi import APIRouter, HTTPException, Depends

from app.routes.schemas import (
    CustomerAnalysisRequest,
    CustomerAnalysisResponse,
)
from app.services.customer_service import analyze_customer, run_customer_flow
from app.auth import get_current_user

router = APIRouter(
    prefix="/api/v1/customer",
    tags=["customer"],
    dependencies=[Depends(get_current_user)]
)

@router.post(
    "/analyze/by-id/{customer_id}",
    response_model=CustomerAnalysisResponse
)
async def analyze_customer_by_id(
    customer_id: int,
    user_id: str = Depends(get_current_user)
) -> CustomerAnalysisResponse:

    if customer_id <= 0:
        raise HTTPException(
            status_code=400,
            detail="Customer ID must be a positive integer"
        )

    try:
        result = analyze_customer(customer_id)

        output = result.get(
            "output",
            result.get("decision_combined", {})
        )

        if not output or "customer" not in output:
            raise HTTPException(
                status_code=404,
                detail=f"Customer with ID {customer_id} not found"
            )

        return output

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid input: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}"
        )


@router.post(
    "/analyze",
    response_model=CustomerAnalysisResponse
)
async def analyze_customer_inline(
    request: CustomerAnalysisRequest,
    user_id: str = Depends(get_current_user)
) -> CustomerAnalysisResponse:

    try:
        if not request.customer.name or not request.customer.name.strip():
            raise HTTPException(
                status_code=400,
                detail="Customer name is required"
            )

        if not request.customer.phone or not request.customer.phone.strip():
            raise HTTPException(
                status_code=400,
                detail="Customer phone number is required"
            )

        if request.customer.credit_limit <= 0:
            raise HTTPException(
                status_code=400,
                detail="Credit limit must be positive"
            )

        customer_data = {
            "name": request.customer.name.strip(),
            "phone": request.customer.phone.strip(),
            "credit_limit": request.customer.credit_limit,
        }

        transactions_data = [
            {
                "type": txn.type.lower(),
                "amount": txn.amount,
                "due_date": txn.due_date,
                "paid_date": txn.paid_date,
            }
            for txn in request.transactions
        ]

        result = run_customer_flow(
            customer=customer_data,
            transactions=transactions_data,
            max_delay_days=request.max_delay_days,
        )

        return result.get(
            "output",
            result.get("decision_combined", {})
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid input: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}"
        )
