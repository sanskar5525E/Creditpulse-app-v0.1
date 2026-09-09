from typing import List, Optional

from pydantic import BaseModel, Field


class TransactionRequest(BaseModel):
    """Single transaction in customer history"""
    type: str = Field(..., description="'credit' or 'payment'")
    amount: float = Field(..., description="Transaction amount")
    due_date: Optional[str] = Field(None, description="YYYY-MM-DD format")
    paid_date: Optional[str] = Field(None, description="YYYY-MM-DD format")


class CustomerRequest(BaseModel):
    """Customer input for analysis"""
    name: str = Field(..., description="Customer name")
    phone: str = Field(..., description="Phone number (10 or 12 digits)")
    credit_limit: float = Field(..., description="Credit limit amount")


class CustomerAnalysisRequest(BaseModel):
    """Full request for customer risk analysis"""
    customer: CustomerRequest
    transactions: List[TransactionRequest] = Field(default_factory=list)
    max_delay_days: int = Field(default=45, description="Maximum acceptable delay in days")


class CustomerMetrics(BaseModel):
    """Customer financial metrics"""
    balance: float
    days_late: int
    risk_score: int
    risk_label: str


class DecisionInfo(BaseModel):
    """Decision details for the customer"""
    action: str
    recommendation: str
    should_remind: bool
    should_call: bool


class AutomationLinks(BaseModel):
    """Automation URLs for reminders and calls"""
    whatsapp_message: Optional[str]
    whatsapp_url: Optional[str]
    tel_url: Optional[str]


class CustomerAnalysisResponse(BaseModel):
    """Final analysis response"""
    customer: dict
    metrics: CustomerMetrics
    decision: DecisionInfo
    automation: AutomationLinks
