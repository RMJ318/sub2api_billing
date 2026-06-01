sub2api monthly billing export

Month: 2026-05
Range: [2026-05-01, 2026-06-01)
Monthly limit used for percent/remaining columns: 1000 USD
Generated at: 2026-06-01 01:30:00 +0800

Files:
- monthly_user_summary.csv: one row per active user, best file for monthly reporting.
- daily_user_usage.csv: per-user daily usage trend.
- model_user_usage.csv: per-user per-model cost and token breakdown.
- api_key_usage.csv: per-user per-API-key usage, without exporting raw API keys.
- request_detail.csv: request-level audit detail for tracing abnormal usage.

Billing source table: public.usage_logs
Primary user-facing usage field: total_cost
