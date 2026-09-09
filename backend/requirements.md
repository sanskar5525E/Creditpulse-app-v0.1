# Creditpulse Backend - Requirements & API Documentation

## Project Overview
Creditpulse is a credit risk analysis system that evaluates customer creditworthiness based on transaction history. It processes raw transaction data, calculates risk metrics, and generates automated decision recommendations with WhatsApp and calling integration.

---

## Dependencies

### Python Packages
```bash
pip install fastapi uvicorn pydantic python-dateutil supabase python-dotenv
```

#### Core Dependencies:
- **fastapi** `>=0.104.0` - Modern async web framework
- **uvicorn** `>=0.24.0` - ASGI server for running FastAPI
- **pydantic** `>=2.0.0` - Data validation and serialization
- **python-dateutil** - Date/time utilities
- **supabase** `>=2.0.0` - Supabase client for database operations
- **python-dotenv** `>=1.0.0` - Environment variable management

### Installation
```bash
# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn pydantic python-dateutil supabase python-dotenv
```

---

---

## Running the Server

### Development Mode
```bash
python main.py
```
Server runs on `http://localhost:8000`

### Using Uvicorn Directly
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Access API Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## API Endpoints

### 1. Root Status
```http
GET /
```
**Response:**
```json
{
  "message": "Server is running successfully 🚀"
}
```

### 2. Hello Endpoint
```http
GET /hello
```
**Response:**
```json
{
  "message": "Hello Sanskar!"
}
```

### 3. Add Numbers
```http
GET /add/{a}/{b}
```
**Example:** `GET /add/5/3`  
**Response:**
```json
{
  "result": 8
}
```

---

## Main Feature: Customer Risk Analysis

### Endpoint
```http
POST /api/v1/customer/analyze
```

### Request Body
```json
{
  "customer": {
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "credit_limit": 50000
  },
  "transactions": [
    {
      "type": "credit",
      "amount": 10000,
      "due_date": "2026-04-15",
      "paid_date": null
    },
    {
      "type": "payment",
      "amount": 5000,
      "due_date": null,
      "paid_date": "2026-04-20"
    }
  ],
  "max_delay_days": 45
}
```

### Response Body
```json
{
  "customer": {
    "name": "Rajesh Kumar",
    "phone": "+919876543210",
    "credit_limit": 50000
  },
  "metrics": {
    "balance": 5000.0,
    "days_late": 5,
    "risk_score": 23,
    "risk_label": "LOW"
  },
  "decision": {
    "action": "ALLOW",
    "recommendation": "Give goods",
    "should_remind": false,
    "should_call": false
  },
  "automation": {
    "whatsapp_message": null,
    "whatsapp_url": null,
    "tel_url": null
  }
}
```

### Request Fields

#### Customer (Required)
| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Customer name |
| `phone` | string | Phone (10 or 12 digits, no +) |
| `credit_limit` | float | Credit limit amount (must be > 0) |

#### Transactions (Optional, default: empty list)
| Field | Type | Description |
| --- | --- | --- |
| `type` | string | `"credit"` or `"payment"` |
| `amount` | float | Transaction amount |
| `due_date` | string (optional) | Due date in YYYY-MM-DD format |
| `paid_date` | string (optional) | Paid date in YYYY-MM-DD format |

#### Other
| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `max_delay_days` | int | 45 | Maximum acceptable delay threshold |

### Response Fields

#### Customer Info
| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Customer name |
| `phone` | string | Formatted phone (+91...) |
| `credit_limit` | float | Credit limit |

#### Metrics
| Field | Type | Description |
| --- | --- | --- |
| `balance` | float | Outstanding balance (credit - payment) |
| `days_late` | int | Maximum days late across transactions |
| `risk_score` | int | 0-100 risk score |
| `risk_label` | string | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |

#### Decision
| Field | Type | Description |
| --- | --- | --- |
| `action` | string | `ALLOW`, `CAUTION`, `PARTIAL_PAYMENT`, `COLLECT_FIRST` |
| `recommendation` | string | Human-readable action description |
| `should_remind` | bool | Send WhatsApp reminder? |
| `should_call` | bool | Make a call? |

#### Automation
| Field | Type | Description |
| --- | --- | --- |
| `whatsapp_message` | string or null | Generated reminder message |
| `whatsapp_url` | string or null | wa.me link for WhatsApp |
| `tel_url` | string or null | tel: URI for calling |

---

## Risk Scoring Logic

### Score Bands → Actions
| Score Range | Risk Label | Action | Reminder | Call |
| --- | --- | --- | --- | --- |
| 0-24 | LOW | ALLOW | ❌ | ❌ |
| 25-49 | MEDIUM | CAUTION | ❌ | ❌ |
| 50-74 | HIGH | PARTIAL_PAYMENT | ✅ | ❌ |
| 75-100 | CRITICAL | COLLECT_FIRST | ✅ | ✅ |

### Score Calculation
```
score = (0.7 × delay_component) + (0.3 × credit_usage_component)

delay_component = min(days_late / max_delay_days, 1.0)
credit_usage_component = min(balance / credit_limit, 1.0)
```

---

## Error Handling

### 400 Bad Request
```json
{
  "detail": "Customer name is required"
}
```

**Possible errors:**
- Customer name is required
- Customer phone is required
- Credit limit must be positive
- Invalid input: [details]

### 500 Internal Server Error
```json
{
  "detail": "Error processing request: [details]"
}
```

---

## Testing with cURL

```bash
# Test analysis endpoint
curl -X POST "http://localhost:8000/api/v1/customer/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "John Doe",
      "phone": "9876543210",
      "credit_limit": 50000
    },
    "transactions": [
      {"type": "credit", "amount": 20000, "due_date": "2026-04-01"},
      {"type": "payment", "amount": 10000, "due_date": null, "paid_date": "2026-04-10"}
    ],
    "max_delay_days": 45
  }'
```

---

## Module Descriptions

### `utils/utilities.py`
Helper functions for:
- Safe type conversion (`safe_float`, `clamp`)
- Date parsing and delay calculation
- Risk score computation
- Phone/amount formatting
- Message generation

### `core/data_processor.py`
Processes raw transactions into metrics:
- Aggregates credits and payments
- Calculates balance
- Identifies overdue days
- Computes risk score and label

### `core/decision_engine.py`
Generates business decisions:
- Risk → action mapping (4 bands)
- Reminder and call triggers
- WhatsApp/tel URL builders
- Combined decision payloads

### `services/customer_service.py`
Orchestrates end-to-end flow:
- Input validation
- Calls data processor
- Calls decision engine
- Returns structured output

### `routes/customer_routes.py`
HTTP API layer:
- Pydantic request/response models
- Input validation
- Error handling
- Service invocation

### `main.py`
FastAPI app setup:
- App initialization
- Router registration
- Basic test endpoints
- Server startup logic

---

## Notes

- All dates must be in `YYYY-MM-DD` format
- Phone numbers are normalized to +91XXXXXXXXXX format (India)
- Risk scores are always 0-100
- Transaction amounts can be 0, but credit_limit must be positive
- Empty transaction list defaults to 0 risk
