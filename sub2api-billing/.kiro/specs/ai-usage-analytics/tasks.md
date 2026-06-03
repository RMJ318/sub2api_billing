# Implementation Plan: AI Usage Analytics Platform

## Overview

This plan implements the AI Usage Analytics Platform in TypeScript (Node.js + Fastify backend, React + Vite + ECharts frontend, DuckDB for `request_detail`, `decimal.js` for money, `csv-parse` for RFC 4180 parsing, `fast-check` + Vitest for tests), exactly as specified in the design.

The work is layered to match the design's separation of concerns: a pure, deterministic compute core (parsing, classification, aggregation, KPIs, budget/Pareto/forecast, key health, insights, signals, export) is built and property-tested first, then the side-effecting adapters (folder scanning, streaming ingestion, DuckDB store, query service), then the Fastify API, then the React UI. Each task builds on prior tasks and ends by wiring components together so there is no orphaned code.

Property-based tests (Properties 1–43 from the design) are placed as sub-tasks next to the pure functions they validate. All test sub-tasks are marked optional with `*`.

## Tasks

- [x] 1. Set up monorepo, tooling, and shared record types
  - [x] 1.1 Initialize project structure and tooling
    - Create a TypeScript monorepo with packages `@core/compute`, `@core/ingest`, `@core/store`, `@app/api`, `@app/web`
    - Configure TypeScript, Vite, Fastify, and install `decimal.js`, `csv-parse`, `duckdb`/`@duckdb/node-api`, `echarts`, `@tanstack/react-query`, `@tanstack/react-table`, Tailwind CSS
    - Configure Vitest + `fast-check` as the unit/property test runner with a shared config
    - _Requirements: 3.1, 2.2_

  - [x] 1.2 Define shared normalized record types and enums
    - Implement TypeScript interfaces for `MonthlySummaryRecord`, `DailyUsageRecord`, `ModelUsageRecord`, `KeyUsageRecord`, `RequestDetailRecord` per the Data Models section (Decimal money, integer counts, tz-aware Date, nullable optionals)
    - Define `ModelFamily`, `IngestionLogEntry`, `IngestionSummary`, `ForecastResult`/`InsufficientData`, `Signal`/`SignalGroup`/`Severity`, and query/page DTO types
    - _Requirements: 2.10, 2.11_

- [x] 2. Implement model family classification
  - [x] 2.1 Implement `classifyModelFamily`
    - Total function returning exactly one of GPT/Claude/Gemini/Other with documented precedence (GPT when name starts `gpt`/`codex`; Claude when contains `claude`; Gemini when contains `gemini`; else Other)
    - Export as the single shared classifier used by Dashboard, Model, and Cost pages
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.2 Write property test for model family classification
    - **Property 1: Model family classification is total and rule-consistent**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 3. Implement CSV field codecs, row parser, and serializer
  - [x] 3.1 Implement field codecs
    - Implement `moneyUsd` (Decimal, sign + digits + at most one separator, else failure), `tokenCount` (non-negative integer, else failure), `timestampTz` (preserve offset, else UTC), `streamBool` (`t/true/1`→true, `f/false/0`→false case-insensitive + trimmed, else failure), `text` (trim; empty/whitespace → null)
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.2 Write property test for monetary codec
    - **Property 2: Monetary fields parse to precise decimals or fail**
    - **Validates: Requirements 2.3**

  - [x] 3.3 Write property test for token/count codec
    - **Property 3: Token and count fields parse to non-negative integers or fail**
    - **Validates: Requirements 2.4**

  - [x] 3.4 Write property test for timestamp codec
    - **Property 4: Timestamp parsing preserves offset or assumes UTC**
    - **Validates: Requirements 2.5**

  - [x] 3.5 Write property test for stream boolean codec
    - **Property 5: Stream boolean parsing maps accepted tokens and rejects others**
    - **Validates: Requirements 2.6**

  - [x] 3.6 Write property test for whitespace trimming and null defaults
    - **Property 6: Whitespace is trimmed and empty optional fields become null**
    - **Validates: Requirements 2.7, 2.8**

  - [x] 3.7 Implement row parser and validator
    - Map columns by header name, split fields via `csv-parse` (RFC 4180), apply per-column codecs, enforce required fields per record type, and on any failure evaluate all remaining fields then reject the row recording file/row/failing field + raw value
    - _Requirements: 2.1, 2.2, 2.9, 2.10, 2.11_

  - [x] 3.8 Write property test for invalid row rejection
    - **Property 7: Invalid rows are rejected and report every failing field**
    - **Validates: Requirements 2.9, 2.10**

  - [x] 3.9 Implement CSV record serializer
    - Serialize a normalized record to a CSV row under a given ordered header (RFC 4180 quoting for commas/quotes/newlines), reusable by the parser round-trip and the Export Service
    - _Requirements: 2.1, 2.2, 2.11_

  - [x] 3.10 Write property test for CSV serialize/parse round-trip
    - **Property 8: CSV serialize/parse round-trip preserves the record schema**
    - **Validates: Requirements 2.1, 2.2, 2.11**

- [~] 4. Checkpoint - parsing core
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement generic aggregation helpers
  - [x] 5.1 Implement `sumField`, `weightedAvg`, `groupSum`, `topN`, `displayLabel`
    - Decimal-safe sum, request-weighted average (0 when total weight is 0), keyed group-sum, descending bounded top-N, and username→email display fallback
    - _Requirements: 4.7, 5.2, 7.5, 11.5, 12.5_

  - [x] 5.2 Write property test for top-N ranking
    - **Property 18: Top-N ranking is bounded, descending, and complete when small**
    - **Validates: Requirements 5.2, 12.5**

  - [x] 5.3 Write property test for display label fallback
    - **Property 19: Display label falls back from username to email**
    - **Validates: Requirements 5.2, 7.5**

  - [x] 5.4 Write property test for dimensional group-sums
    - **Property 16: Dimensional group-sums preserve totals**
    - **Validates: Requirements 5.3, 11.1, 11.2, 11.3, 12.1, 13.4**

  - [x] 5.5 Write property test for request-weighted averages
    - **Property 13: Request-weighted averages follow the weighted-average formula**
    - **Validates: Requirements 4.7, 11.5**

- [x] 6. Implement Dashboard KPI computation
  - [x] 6.1 Implement `computeDashboardKpis`
    - Compute total Spend, active user count, total token count, total request count, total API key count, request-weighted avg response time, budget usage rate (rounded 1 dp, 0 when limit sum is 0), and per-KPI comparison vs the preceding month (no-comparison indicator when preceding is 0)
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 6.2 Write property test for additive aggregates
    - **Property 11: Additive aggregates equal the sum of their source field**
    - **Validates: Requirements 4.2, 4.4, 4.5, 4.6, 5.4**

  - [x] 6.3 Write property test for active user count
    - **Property 12: Active user count counts distinct active users**
    - **Validates: Requirements 4.3**

  - [x] 6.4 Write property test for budget usage rate
    - **Property 14: Budget usage rate equals the bounded, rounded ratio**
    - **Validates: Requirements 4.8, 4.9**

  - [x] 6.5 Write property test for KPI percentage change
    - **Property 15: KPI percentage change equals relative delta or signals no comparison**
    - **Validates: Requirements 4.10**

- [x] 7. Implement trend, scatter, sorting, search, and date-range helpers
  - [x] 7.1 Implement time-bucketed trend aggregation
    - Aggregate dated records into one ascending-ordered point per occupied bucket for daily (`usage_date`), weekly, and monthly (Billing_Month) granularity, including pre-filtered single-user/single-key series
    - _Requirements: 5.1, 10.1, 12.2, 12.3, 13.1, 13.2, 13.3_

  - [x] 7.2 Write property test for time-bucketed trends
    - **Property 17: Time-bucketed trends sum per bucket in ascending order**
    - **Validates: Requirements 5.1, 10.1, 12.2, 12.3, 13.1, 13.2, 13.3**

  - [x] 7.3 Implement scatter dataset mapping
    - Map per-entity records (users/models) to one point each with defined X/Y axis metrics and a point size that is monotonic non-decreasing in total token count
    - _Requirements: 8.1, 8.2, 11.4_

  - [x] 7.4 Write property test for scatter mapping
    - **Property 26: Scatter mapping is one point per entity with correct coordinates**
    - **Validates: Requirements 8.1, 8.2, 11.4**

  - [x] 7.5 Implement sorting, case-insensitive search, and date-range filtering/validation
    - Stable column sort (asc/desc), case-insensitive username/email substring filter, inclusive date-range filter, and date-range validation rejecting start-after-end
    - _Requirements: 3.5, 7.2, 7.3, 9.4, 19.2, 19.3_

  - [x] 7.6 Write property test for sorting
    - **Property 20: Sorting orders rows by the selected column and direction**
    - **Validates: Requirements 3.5, 7.2, 9.4**

  - [x] 7.7 Write property test for case-insensitive search
    - **Property 21: Case-insensitive search returns exactly the matching rows**
    - **Validates: Requirements 7.3**

  - [x] 7.8 Write property test for inclusive date-range filtering
    - **Property 24: Date-range filtering is inclusive**
    - **Validates: Requirements 19.2**

  - [x] 7.9 Write property test for date-range rejection
    - **Property 25: Date ranges with start after end are rejected**
    - **Validates: Requirements 19.3**

- [x] 8. Implement budget, Pareto, and forecast logic
  - [x] 8.1 Implement `usagePercent` and `budgetStyle`
    - Compute Usage_Percent and map to normal (<80), warning ([80,95)), critical (>=95)
    - _Requirements: 9.2, 9.3_

  - [x] 8.2 Write property test for budget style thresholds
    - **Property 27: Budget style follows the usage-percent thresholds**
    - **Validates: Requirements 9.2, 9.3**

  - [x] 8.3 Implement `paretoShares`
    - Compute cumulative Spend share for top 10/20/30 percent of users ranked by Spend descending
    - _Requirements: 14.1_

  - [x] 8.4 Write property test for Pareto shares
    - **Property 28: Pareto cumulative shares are monotonic and bounded**
    - **Validates: Requirements 14.1**

  - [x] 8.5 Implement `forecastMonthEnd`
    - Project month-end Spend from cumulative + average daily rate, projected days-to-budget, and over-budget flag; return InsufficientData when fewer than 3 distinct days exist
    - _Requirements: 14.2, 14.3, 14.4, 14.5_

  - [x] 8.6 Write property test for month-end forecast
    - **Property 29: Month-end forecast extrapolates the daily rate**
    - **Validates: Requirements 14.2, 14.3, 14.4**

- [x] 9. Implement key health and reconciliation logic
  - [x] 9.1 Implement key health classifiers
    - Long-unused keys (`last_request_at` > 14 days before month end), high-frequency keys (top by request count), and abnormal-growth keys (request count up >= 200% vs preceding month)
    - _Requirements: 12.4, 12.5, 12.6_

  - [x] 9.2 Write property test for long-unused keys
    - **Property 30: Long-unused keys are exactly those idle beyond 14 days**
    - **Validates: Requirements 12.4**

  - [x] 9.3 Write property test for abnormal-growth keys
    - **Property 31: Abnormal-growth keys exceed the 200 percent threshold**
    - **Validates: Requirements 12.6**

  - [x] 9.4 Implement reconciliation and unmatched-reference detection
    - Associate daily records with the monthly summary by `user_id` + Billing_Month, flag daily-vs-monthly `used_usd` mismatch > 1%, and detect request-detail `api_key_id` with no matching Key_Usage_Record while retaining the record
    - _Requirements: 21.1, 21.2, 21.3_

  - [x] 9.5 Write property test for daily-to-monthly reconciliation
    - **Property 32: Daily records reconcile to the monthly summary**
    - **Validates: Requirements 21.1, 21.2**

  - [x] 9.6 Write property test for unmatched API key references
    - **Property 33: Unmatched API key references are retained and logged**
    - **Validates: Requirements 21.3**

- [~] 10. Checkpoint - compute core
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Insight Engine
  - [x] 11.1 Implement `topPerformers` and `trendInsights`
    - Produce top-performer rankings by Spend/requests/tokens (null when all users are zero), and trend insights for total Spend, active users, and total requests vs the preceding month as short text plus supporting metric value
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 11.2 Write property test for top-performer rankings
    - **Property 34: Top-performer rankings are produced when data is non-trivial and ordered**
    - **Validates: Requirements 15.1**

  - [x] 11.3 Write property test for trend insights
    - **Property 35: Trend insights match the computed change**
    - **Validates: Requirements 15.3**

  - [x] 11.4 Write unit test for insight output shape
    - Verify each insight is a short text statement accompanied by its supporting metric value, and omitted (not placeholder) when inputs are unavailable
    - _Requirements: 15.4, 15.5_

- [x] 12. Implement Signal Engine
  - [x] 12.1 Implement `detectSignals` rules
    - High-spend (day Spend > 20% of limit), low-balance (remaining <= 10% of limit), API key anomaly (day requests > 3x key daily average), response-time anomaly (`avg_duration_ms` > 60000), risk hint (>= 2 consecutive high-spend days), each assigned its group and a fixed informational/warning/critical severity, with a navigation target
    - _Requirements: 16.2, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 12.2 Write property test for high-spend alerts
    - **Property 36: High-spend alerts trigger above 20 percent of limit**
    - **Validates: Requirements 17.1**

  - [x] 12.3 Write property test for low-balance alerts
    - **Property 37: Low-balance alerts trigger at or below 10 percent remaining**
    - **Validates: Requirements 17.2**

  - [x] 12.4 Write property test for API key anomalies
    - **Property 38: API key anomalies trigger above 3x the daily average**
    - **Validates: Requirements 17.3**

  - [x] 12.5 Write property test for response-time anomalies
    - **Property 39: Response-time anomalies trigger above the 60000 ms threshold**
    - **Validates: Requirements 17.4**

  - [x] 12.6 Write property test for risk hints
    - **Property 40: Risk hints trigger on consecutive high-spend days**
    - **Validates: Requirements 17.5**

  - [x] 12.7 Write property test for signal group and severity assignment
    - **Property 41: Every signal carries a group and severity determined by its rule**
    - **Validates: Requirements 16.2, 17.6**

  - [x] 12.8 Implement unread-badge count and signal navigation target
    - Compute the unread count over a signal list and expose each signal's referenced page + entity for navigation
    - _Requirements: 16.3, 16.5_

  - [x] 12.9 Write property test for unread badge count
    - **Property 42: The unread badge equals the count of unread signals**
    - **Validates: Requirements 16.3**

- [~] 13. Implement Export Service
  - [x] 13.1 Implement `buildCsvExport`
    - Emit a header row equal to the ordered column list followed by the filtered rows using the shared serializer, name the file `pageName_billingMonth_timestamp.csv`, and emit header-only content when rows are empty
    - _Requirements: 20.1, 20.2, 20.3, 20.5_

  - [-] 13.2 Write property test for CSV export round-trip
    - **Property 43: CSV export round-trips the filtered rows under the displayed header**
    - **Validates: Requirements 20.1, 20.2, 20.5**

  - [-] 13.3 Write unit test for export filename format
    - Verify the `pageName_month_timestamp.csv` naming
    - _Requirements: 20.3_

- [~] 14. Checkpoint - engines and export
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement Ingestion Service
  - [x] 15.1 Implement folder scanner predicates
    - Implement `isValidBillingMonthFolder` (`^\d{4}-(0[1-9]|1[0-2])$`) and `billingMonthFromFolder`, and the Billing_Month fallback that fills records whose `billing_month` is empty/whitespace from the folder name
    - _Requirements: 1.1, 1.3_

  - [x] 15.2 Write property test for Billing_Month folder fallback
    - **Property 9: Billing_Month falls back to the folder name**
    - **Validates: Requirements 1.3**

  - [x] 15.3 Implement ingestion orchestration over discovered folders
    - Scan the billing root non-recursively, read present expected files via the parser, record skipped-folder (none present), missing-file (1–4 present), access-error + halt (root unreadable), reconciliation/unmatched-reference entries, and a final ingestion summary (folders/files/records/rejected)
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 1.7, 21.2, 21.3_

  - [x] 15.4 Write integration tests for folder discovery scenarios
    - Fixture dirs for all-five-present, skipped-folder, missing-file, access-error/halt, and summary counts
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 1.7_

  - [x] 15.5 Implement streaming loader for `request_detail.csv`
    - Stream the file in bounded `requestDetailBatchSize` batches and insert into the DuckDB table so peak memory is independent of row count
    - _Requirements: 3.1_

  - [x] 15.6 Write integration test for bounded-memory streaming ingestion
    - Ingest a large generated fixture and assert peak memory does not scale with row count
    - _Requirements: 3.1_

- [x] 16. Implement Data Store
  - [x] 16.1 Implement in-memory record sets indexed by Billing_Month
    - Hold summary/daily/model/key records, expose month-scoped accessors and ascending `availableMonths()`, and retain each record's Billing_Month for cross-month queries
    - _Requirements: 1.8_

  - [x] 16.2 Write property test for Billing_Month partitioning
    - **Property 10: Records are partitioned by Billing_Month across folders**
    - **Validates: Requirements 1.8**

  - [x] 16.3 Implement DuckDB `request_detail` schema and `queryRequestDetail`
    - Create the documented table + indexes and a query function supporting filter/sort/pagination over DuckDB
    - _Requirements: 3.1_

- [x] 17. Implement Query Service
  - [x] 17.1 Implement request-detail query path
    - Enforce required `billingMonth` (reject + no records when missing), apply conjunctive user/model/key/date-range filters before pagination, default sort `created_at` desc, clamp page size to 1–1000 (default 100), and return `totalCount`/`totalPages` with empty page when beyond range
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 3.8_

  - [x] 17.2 Write property test for request-detail conjunctive filters
    - **Property 23: Request-detail filters combine conjunctively**
    - **Validates: Requirements 3.4, 4.3**

  - [x] 17.3 Write property test for pagination
    - **Property 22: Pagination partitions the ordered result with correct totals**
    - **Validates: Requirements 3.2, 3.7, 3.8, 7.4**

  - [x] 17.4 Write integration test for the DuckDB query path
    - Paginated/filtered/sorted request detail over 1–3 representative datasets
    - _Requirements: 3.4, 3.5, 3.7_

  - [x] 17.5 Write unit test for the missing-Billing_Month guard
    - Verify the request is rejected with an error response and no records before any DuckDB access
    - _Requirements: 3.3_

  - [x] 17.6 Implement aggregate query functions for all pages
    - Wire the pure compute library to serve dashboard KPIs/charts, user/model/key/cost aggregates, insights, and signals from summary record sets / server-side aggregation (never a full client load of `request_detail`), summing USD with no currency conversion
    - _Requirements: 3.6, 13.2, 13.3, 21.4_

- [~] 18. Checkpoint - ingestion, store, and query
  - Ensure all tests pass, ask the user if questions arise.

- [~] 19. Implement Fastify API layer
  - [x] 19.1 Implement HTTP server, routes, and DTO shaping
    - Expose endpoints for dashboard, user, model, key, cost aggregates, request-detail paging, signals/insights, and export; shape DTOs from compute outputs; validate request params (page size, date range, billing month)
    - _Requirements: 3.2, 3.3, 19.1, 19.2, 19.3, 20.1_

  - [~] 19.2 Write smoke test for server-side aggregation source
    - Verify dashboard aggregate endpoints read from summary sets / server-side aggregation rather than a full client-side load of `request_detail`
    - _Requirements: 3.6_

  - [~] 19.3 Write smoke tests for shared classifier and no currency conversion
    - Verify a single shared `classifyModelFamily` is used across Dashboard/Model/Cost endpoints and monetary aggregation performs no currency conversion
    - _Requirements: 6.5, 21.4_

- [~] 20. Implement Web UI foundation
  - [x] 20.1 Implement AppShell with theme and responsive layout
    - Nav + Bell with unread badge; `class`-based dark theme defaulting to dark and persisted to `localStorage`; responsive card grid (multi-column >=768px, single-column collapsed-nav 320–768px, single-column horizontal-scroll <320px)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [~] 20.2 Implement shared controls and data layer
    - `BillingMonthSelector`, `DateRangeFilter` (with start-after-end validation message), `SearchBox`, `ExportButton`; TanStack Query data fetching that updates the active page on filter/search/date change without full reload and a clear-filters reset to the latest month
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 20.3 Implement reusable ECharts wrapper
    - Thin React ECharts component that subscribes to a container resize observer and re-fits charts on viewport change
    - _Requirements: 18.6_

  - [~] 20.4 Write UI tests for theme and responsiveness
    - Dark-mode default + persistence, responsive breakpoints, and ECharts resize-on-container-change
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [~] 20.5 Write UI tests for filter/search/date reactivity
    - Reactivity without full reload and clear-filters reset to the latest Billing_Month
    - _Requirements: 19.1, 19.4, 19.5_

- [~] 21. Implement Dashboard Overview page
  - [x] 21.1 Implement Dashboard KPI cards and charts
    - KPI card row (with month-over-month change), daily trend line charts, top-10 user spend bar, model-family donut, and cost-composition stacked bar; render empty-state messages when a chart has no source records
    - _Requirements: 4.1, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [~] 21.2 Write unit tests for KPI presence and empty states
    - KPI card presence on render and chart empty-state rendering
    - _Requirements: 4.1, 5.5_

- [~] 22. Implement User Analysis page
  - [~] 22.1 Implement user table, scatter, budget list, and per-user trend
    - Sortable/searchable user ranking table (default 25/page, email fallback label), activity scatter (X requests, Y spend, size tokens, hover tooltip), budget monitor list sorted by Usage_Percent desc with warning/critical styles, and per-user daily trend (zero-line vs empty-state handling)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3_

  - [~] 22.2 Write unit tests for table columns, tooltips, and trend states
    - Table columns/labels, scatter/budget tooltips and list rendering, and per-user all-zero vs empty-state renders
    - _Requirements: 7.1, 8.3, 9.1, 10.2, 10.3_

- [~] 23. Implement Model Analysis page
  - [~] 23.1 Implement model spend/request rankings, token stack, and efficiency scatter
    - Model spend bar, request-count bar, `input/output/cache_read` token stacked bar per model, and efficiency scatter (X request-weighted `avg_duration_ms`, Y total Spend)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [~] 24. Implement API Key Analysis page
  - [~] 24.1 Implement key ranking, daily trends, and health panel
    - Key ranking (name, Spend, requests, owner), all-keys daily trend when none selected, per-key daily trend from request detail when selected, health panel (long-unused, high-frequency, abnormal-growth), and a deleted indicator on deleted-key rows
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 24.2 Write unit test for deleted-key indicator
    - Verify the deleted indicator renders when `api_key_deleted` is true
    - _Requirements: 12.7_

- [~] 25. Implement Cost Analysis page
  - [~] 25.1 Implement cost trend, treemap, Pareto, and forecast panels
    - Cost trend line with daily/weekly/monthly granularity, three-level user→model→key treemap sized by Spend, Pareto panel (top 10/20/30%), and forecast panel with over-budget indicator and insufficient-data message (< 3 days) suppressing the indicator
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [~] 25.2 Write unit test for insufficient-data forecast render
    - Verify the insufficient-data message replaces the forecast and the over-budget indicator is suppressed below 3 days
    - _Requirements: 14.5_

- [~] 26. Implement Signal Center drawer
  - [~] 26.1 Implement SignalCenterDrawer
    - Open as a fixed right-side drawer on Bell activation, close on Bell activation while open, group signals into the five categories, show the unread count badge regardless of drawer state, and navigate to the referenced page/entity on signal selection
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [~] 26.2 Write UI tests for drawer behavior and navigation
    - Open/close on Bell activation and navigation on signal click
    - _Requirements: 16.1, 16.4, 16.5_

- [~] 27. Wire report export into pages
  - [~] 27.1 Connect ExportButton to the Export Service per page
    - Export the currently filtered data of the active page to CSV; show a progress indicator while generating and ensure the export completes even if the indicator fails to render
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [~] 27.2 Write UI test for export progress resilience
    - Verify the download completes when the progress indicator render fault is injected
    - _Requirements: 20.4_

- [ ] 28. Final integration and checkpoint
  - [~] 28.1 Wire ingestion, store, API, and UI end-to-end
    - Implement the application entry point that runs ingestion into the data store, starts the Fastify API, and serves the React UI, connecting all six surfaces and the Signal Center to live data
    - _Requirements: 1.7, 1.8, 3.6, 19.1_

  - [~] 28.2 Final checkpoint - ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements clauses for traceability, and each property test references its design Property number and validated requirements.
- The pure compute core (Tasks 2–13) is built and property-tested before the side-effecting adapters (Tasks 15–17), matching the design's layering and the property-based testing strategy.
- Checkpoints (Tasks 4, 10, 14, 18, 28.2) provide incremental validation at layer boundaries.
- Properties 1–43 from the design each map to exactly one property-based test sub-task placed next to the function it validates.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "5.1", "15.1", "16.1", "16.3"] },
    { "id": 3, "tasks": ["2.2", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "5.2", "5.3", "5.4", "5.5", "6.1", "7.1", "7.3", "7.5", "8.1", "8.3", "8.5", "9.1", "9.4", "12.1", "15.2", "16.2", "17.1"] },
    { "id": 4, "tasks": ["3.8", "3.9", "6.2", "6.3", "6.4", "6.5", "7.2", "7.4", "7.6", "7.7", "7.8", "7.9", "8.2", "8.4", "8.6", "9.2", "9.3", "9.5", "9.6", "11.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "15.3", "15.5", "17.2", "17.3", "17.4", "17.5"] },
    { "id": 5, "tasks": ["3.10", "11.2", "11.3", "11.4", "12.9", "13.1", "15.4", "15.6", "17.6"] },
    { "id": 6, "tasks": ["13.2", "13.3", "19.1", "20.1"] },
    { "id": 7, "tasks": ["19.2", "19.3", "20.2", "20.3"] },
    { "id": 8, "tasks": ["20.4", "20.5", "21.1", "22.1", "23.1", "24.1", "25.1", "26.1"] },
    { "id": 9, "tasks": ["21.2", "22.2", "24.2", "25.2", "26.2", "27.1"] },
    { "id": 10, "tasks": ["27.2", "28.1"] }
  ]
}
```
