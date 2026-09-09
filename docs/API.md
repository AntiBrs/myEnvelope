# REST API reference

[Magyar változat](API.hu.md) · [Back to README](../README.md)

Base URL in local development: `http://localhost:5000`.

## Conventions

- Request and response bodies use JSON unless an endpoint explicitly accepts multipart data.
- Protected routes require `Authorization: Bearer <JWT>`.
- User identity is read from the verified JWT, not trusted from a request body or query parameter.
- Dates use ISO `YYYY-MM-DD`; forecast months use `YYYY-MM` in responses.
- Monetary values are numeric and interpreted as RON by the current UI.
- Typical statuses: `200` success, `400` invalid request, `401` missing/invalid token, `404` missing resource, `500` internal error, `502/503` unavailable integration.

## Authentication

### `POST /user`

Registers a user. The backend hashes the password with bcrypt before storage.

```json
{
  "isAdult": true,
  "secureCode": "example-recovery-code",
  "userName": "demo-user",
  "password": "a-strong-password",
  "name": "Demo User",
  "telephoneNumber": "+00 000 000 000",
  "dateOfBirth": "2000-01-01"
}
```

Response:

```json
{
  "message": "User created",
  "userId": 1
}
```

### `POST /login`

```json
{
  "userName": "demo-user",
  "password": "a-strong-password"
}
```

Response:

```json
{
  "token": "<jwt-access-token>",
  "userId": 1,
  "userName": "demo-user"
}
```

Use the token on later requests:

```http
Authorization: Bearer <jwt-access-token>
```

## Transactions

### `POST /expenses`

Stores an expense for the authenticated user.

```json
{
  "date": "2026-09-01",
  "amount": 75.5,
  "category": "Food",
  "subcategory": "Groceries"
}
```

### `POST /earnings`

Uses the same structure to store an earning.

```json
{
  "date": "2026-09-01",
  "amount": 3500,
  "category": "Salary",
  "subcategory": "Regular"
}
```

### `GET /categories`

Returns the supported expense and earning category tree used by the client.

## Receipt processing

### `POST /invoices/analyze`

Content type: `multipart/form-data`. The file field must be named `invoice`.

```bash
curl -X POST http://localhost:5000/invoices/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -F "invoice=@sample-receipt.jpg"
```

Example response:

```json
{
  "message": "Analysis complete",
  "records": [
    {
      "date": "2026-09-01",
      "vendor": "Example Market",
      "amount": 75.5,
      "category": "Food",
      "subcategory": "Groceries",
      "description": "Example Market"
    }
  ]
}
```

The response is a suggestion. The mobile client lets the user edit it before calling `/expenses/manual`.

### `POST /expenses/manual`

Confirms a reviewed receipt-derived expense. It accepts the same core transaction fields as `/expenses`; extra display-only fields may be ignored by the backend.

## Statistics and summary

### `GET /user/summary`

Returns the minimal profile fields needed by the home screen plus totals. Sensitive fields such as password hash, recovery code, telephone number, and date of birth are not returned.

```json
{
  "user": {
    "userId": 1,
    "userName": "demo-user",
    "name": "Demo User"
  },
  "totalEarnings": 3500,
  "totalExpenses": 975.5,
  "balance": 2524.5
}
```

### `GET /user/statistics/:timeRange`

Supported UI values include `this_month`, with additional ranges handled by the backend implementation. The response contains totals and category/subcategory aggregations consumed by charts.

## Planning

### `POST /planning`

Upserts a monthly category plan:

```json
{
  "year": 2026,
  "month": 9,
  "plan": {
    "expenses": {
      "Food": 900,
      "Transportation": 300
    },
    "earnings": {
      "Salary": 3500
    }
  }
}
```

### `GET /planning?year=2026&month=9`

Returns the selected month's plan and the total planned expenses for the year.

### `GET /user/planning/compare?year=2026&month=9`

Returns one object per expense category:

```json
[
  {
    "category": "Food",
    "planned": 900,
    "actual": 720,
    "remaining": 180,
    "percent": 80
  }
]
```

## Forecasting

### `GET /user/predictions`

Optional query parameters:

- `startDate=YYYY-MM-DD` — defaults to the first day of the current month;
- `months=1..24` — defaults to 12 and is bounded to protect the service.

The backend generates total and category-level forecasts for both expenses and earnings. It selects a mean baseline, seasonal-naive forecast, or SARIMA based on the available monthly history.

```json
{
  "startDate": "2026-09-01",
  "months": 12,
  "expensePredictions": [
    {
      "month": "2026-09",
      "predictedAmount": 920.25,
      "category": "total"
    }
  ],
  "earningPredictions": [],
  "expensePredictionsByCategory": {
    "Food": [
      {
        "month": "2026-09",
        "predictedAmount": 310.5,
        "category": "Food"
      }
    ]
  },
  "earningPredictionsByCategory": {}
}
```

### Failure behavior

- Empty history returns empty forecast collections.
- Fewer than 12 months selects the mean monthly baseline.
- 12–23 months selects seasonal naive.
- 24+ months attempts SARIMA.
- SARIMA fitting/forecast failure falls back to seasonal naive.
- Negative predictions are clamped to zero.

## Assistant

### `POST /chat`

```json
{
  "question": "How much did I spend on groceries this month?"
}
```

The Flask backend sends the question and JWT-derived user ID to the configured n8n webhook. It returns `503` when the integration is not configured and `502` when the downstream workflow is unreachable.

The example workflow is under `n8n/workflow.example.json`. Configure credentials only inside n8n and use a dedicated read-only MySQL account.

## Health

### `GET /health`

```json
{
  "status": "ok",
  "service": "myEnvelope API"
}
```

This lightweight endpoint intentionally exposes no database or secret configuration.
