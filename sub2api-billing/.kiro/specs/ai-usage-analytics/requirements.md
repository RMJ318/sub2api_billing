# Requirements Document

## Introduction

The AI Usage Analytics Platform is an enterprise-internal management dashboard for analyzing AI Gateway (sub2api) usage across users, models, API keys, token consumption, and cost. The platform ingests monthly CSV billing exports (organized in per-month folders such as `2026-04` and `2026-05`) sourced from the sub2api Postgres `usage_logs` table, where `total_cost` is the primary cost field and the default monthly budget limit per user is 1000 USD.

The platform is not a passive data viewer. Beyond presenting six analytical pages (Dashboard Overview, User Analysis, Model Analysis, API Key Analysis, Cost Analysis, and a Signal Center), it auto-generates trend Insights, risk Signals, anomaly detection, and Top Performer rankings to provide an executive-dashboard / management-cockpit experience. The visual language follows modern enterprise SaaS dashboards (OpenAI Usage Dashboard, Vercel Analytics, Datadog, Grafana, Linear, Stripe Dashboard): dark-mode first, responsive, card-based, high information density, with ECharts-based visualizations.

This document defines the requirements for data ingestion and parsing of the CSV sources, the six pages, the auto-generated insight/signal/anomaly engine, and the cross-cutting UI requirements (dark mode, responsive layout, filtering, search, date range selection, and report export).

## Glossary

- **Platform**: The complete AI Usage Analytics web application, including its data layer and user interface.
- **Ingestion_Service**: The Platform component that scans monthly folders, reads CSV files, parses rows, validates fields, and loads normalized records into the Data_Store.
- **Data_Store**: The queryable persistence layer (database or in-memory aggregate store) that holds normalized usage records for the Platform.
- **CSV_Parser**: The Ingestion_Service subcomponent that converts CSV text into typed records according to the documented field schema.
- **Query_Service**: The Platform component that serves aggregated and filtered data to the user interface.
- **Dashboard**: The Dashboard Overview page presenting top-level KPI cards and summary charts.
- **User_Analysis_Page**: The page presenting user-level rankings, activity, budget monitoring, and per-user trends.
- **Model_Analysis_Page**: The page presenting model-level spend, requests, token, and efficiency analysis.
- **Key_Analysis_Page**: The API Key Analysis page presenting API-key-level rankings, trends, and health.
- **Cost_Analysis_Page**: The page presenting cost trends, distribution, Pareto analysis, and forecasting.
- **Signal_Center**: The right-side drawer that presents real-time alerts, anomalies, and risk hints.
- **Insight_Engine**: The Platform component that derives trend insights, top performer rankings, and narrative summaries from aggregated data.
- **Signal_Engine**: The Platform component that evaluates rules to produce alerts, anomalies, and risk hints surfaced in the Signal_Center.
- **KPI_Card**: A summary card on the Dashboard showing a single headline metric.
- **Monthly_Summary_Record**: A normalized record derived from `monthly_user_summary.csv` (one row per user per month).
- **Daily_Usage_Record**: A normalized record derived from `daily_user_usage.csv` (one row per user per day).
- **Model_Usage_Record**: A normalized record derived from `model_user_usage.csv` (one row per user per model per month).
- **Key_Usage_Record**: A normalized record derived from `api_key_usage.csv` (one row per user per API key per month).
- **Request_Detail_Record**: A normalized record derived from `request_detail.csv` (one row per request).
- **Billing_Month**: The month a record belongs to, in `YYYY-MM` format, derived from the `billing_month` field or the folder name.
- **Monthly_Budget_Limit**: The per-user monthly spend limit, defaulting to 1000 USD.
- **Usage_Percent**: The ratio of a user's used spend to the user's Monthly_Budget_Limit, expressed as a percentage.
- **Model_Family**: A grouping of model names into one of GPT, Claude, Gemini, or Other.
- **Date_Range_Filter**: A user-selected start date and end date that constrains the data shown on a page.
- **Export_Service**: The Platform component that produces downloadable report files from the currently displayed data.
- **Spend**: A monetary cost value in USD; on summary and aggregate views Spend is derived from `used_usd`/`actual_cost_usd`, and at the request level Spend is derived from `total_cost_usd`.

## Requirements

### Requirement 1: Monthly Folder Discovery and Ingestion

**User Story:** As a data PM, I want the Platform to automatically discover and ingest each monthly billing folder, so that all available months of usage data are available for analysis without manual import.

#### Acceptance Criteria

1. WHEN the Ingestion_Service runs, THE Ingestion_Service SHALL scan the configured billing root directory for its immediate (non-recursive) subfolders whose names match the `YYYY-MM` pattern, where `YYYY` is a four-digit year and `MM` is a two-digit month in the range 01 through 12.
2. WHEN a folder matching the `YYYY-MM` pattern is found, THE Ingestion_Service SHALL read each of the following five expected usage CSV files that is present in that folder: `monthly_user_summary.csv`, `daily_user_usage.csv`, `model_user_usage.csv`, `api_key_usage.csv`, and `request_detail.csv`.
3. IF a record lacks a populated `billing_month` value, THEN THE Ingestion_Service SHALL assign the Billing_Month derived from the containing folder name.
4. IF a folder matching the `YYYY-MM` pattern contains none of the five expected usage CSV files, THEN THE Ingestion_Service SHALL record a skipped-folder entry identifying the folder name in the ingestion log and SHALL continue scanning the remaining folders without loading records from that folder.
5. IF a folder matching the `YYYY-MM` pattern contains at least one but fewer than five of the expected usage CSV files, THEN THE Ingestion_Service SHALL process each present expected file, record a missing-file entry in the ingestion log naming the folder and each absent expected file, and SHALL continue scanning the remaining folders.
6. IF the configured billing root directory does not exist or cannot be read, THEN THE Ingestion_Service SHALL record an access-error entry in the ingestion log indicating the directory could not be accessed and SHALL halt the ingestion run without loading records.
7. WHEN ingestion of all discovered folders completes, THE Ingestion_Service SHALL record an ingestion summary containing the count of folders processed, the count of files processed, the count of records loaded, and the count of rows rejected.
8. THE Ingestion_Service SHALL load records from multiple monthly folders into the Data_Store such that each record retains its Billing_Month for month-scoped and cross-month queries.

### Requirement 2: CSV Parsing and Field Normalization

**User Story:** As a data PM, I want CSV fields parsed into correct types with consistent normalization, so that downstream charts and aggregates are accurate.

#### Acceptance Criteria

1. WHEN the CSV_Parser reads a usage CSV file, THE CSV_Parser SHALL treat the first row as the header and map each subsequent row to fields by header name.
2. WHEN the CSV_Parser encounters a quoted field containing commas or empty quoted values, THE CSV_Parser SHALL parse the field according to RFC 4180 quoting rules.
3. WHEN the CSV_Parser reads a monetary field including `used_usd`, `actual_cost_usd`, `total_cost_usd`, `current_balance_usd`, and the per-category cost fields, THE CSV_Parser SHALL convert a value consisting of an optional sign followed by digits and at most one decimal separator to a decimal number representing USD preserving its fractional digits, and SHALL treat any other non-empty value as a conversion failure.
4. WHEN the CSV_Parser reads a token or count field including `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `image_output_tokens`, `image_count`, and `request_count`, THE CSV_Parser SHALL convert a non-negative integer value to an integer, and SHALL treat a negative, fractional, or non-numeric value as a conversion failure.
5. WHEN the CSV_Parser reads a timestamp field including `first_request_at`, `last_request_at`, `created_at`, and `usage_date`, THE CSV_Parser SHALL convert the value to a timezone-aware datetime, preserving the UTC offset WHERE the value includes an offset and interpreting the value as UTC WHERE the value includes no offset.
6. WHEN the CSV_Parser reads the `stream` field, THE CSV_Parser SHALL convert the case-insensitive trimmed values `t`, `true`, and `1` to true and the values `f`, `false`, and `0` to false, and SHALL treat any other non-empty value as a conversion failure.
7. WHEN the CSV_Parser reads a field value, THE CSV_Parser SHALL trim leading and trailing whitespace and SHALL treat a value that is empty or whitespace-only as empty.
8. WHERE a non-required field is empty, THE CSV_Parser SHALL store a null value for that field.
9. IF a row contains one or more values that cannot be converted to their required types or one or more empty required-field values, THEN THE CSV_Parser SHALL continue evaluating the remaining fields in that row, reject the row, and record the file name, row number, and each failing field name with its raw value in the ingestion log.
10. THE CSV_Parser SHALL treat `user_id` as a required field for every record type, `usage_date` as a required field for Daily_Usage_Records, `model` as a required field for Model_Usage_Records, `api_key_id` as a required field for Key_Usage_Records, and `request_id` as a required field for Request_Detail_Records.
11. WHEN the CSV_Parser produces normalized records, THE CSV_Parser SHALL preserve the documented schema for each file type so that each record exposes all source fields under their documented names.

### Requirement 3: Large File Handling for Request Detail

**User Story:** As a front-end architect, I want the largest file (`request_detail.csv`) handled without loading it entirely into the browser, so that the Platform remains responsive as request volume grows.

#### Acceptance Criteria

1. WHEN the Ingestion_Service processes `request_detail.csv`, THE Ingestion_Service SHALL read the file using a streaming reader that processes the file in bounded-size increments such that peak memory consumption for the file does not increase proportionally with the total number of rows in the file.
2. THE Query_Service SHALL serve Request_Detail_Record results using pagination with a configurable page size that defaults to 100 records per page and accepts configured integer values from 1 to 1000 records per page inclusive.
3. IF the user interface requests Request_Detail_Records without a Billing_Month filter, THEN THE Query_Service SHALL reject the request, return no Request_Detail_Records, and return an error response indicating that a Billing_Month filter is required.
4. WHEN the user interface requests Request_Detail_Records with a Billing_Month filter, THE Query_Service SHALL apply any provided user, model, API key, and Date_Range_Filter criteria as a conjunctive (AND) filter to the matching records before pagination is applied.
5. WHEN the user interface requests Request_Detail_Records, THE Query_Service SHALL support sorting the results by `total_cost_usd`, `duration_ms`, or `created_at` in ascending or descending order as selected by the request, and SHALL apply a default sort of `created_at` in descending order when the request specifies no sort field.
6. WHEN any page renders aggregate metrics, THE Query_Service SHALL serve those metrics from pre-aggregated summary records or server-side aggregation rather than from a full client-side load of `request_detail.csv`.
7. WHEN the Query_Service serves a page of Request_Detail_Records, THE Query_Service SHALL include the total count of records matching the applied filters and the total number of pages for the configured page size.
8. IF the user interface requests a page number greater than the total number of pages for the applied filters, THEN THE Query_Service SHALL return an empty Request_Detail_Record result set together with the total matching record count and the total page count.

### Requirement 4: Dashboard Overview KPIs

**User Story:** As an executive, I want headline KPIs for the selected month at the top of the Dashboard, so that I can assess overall AI spend and activity at a glance.

#### Acceptance Criteria

1. WHEN the Dashboard loads for a selected Billing_Month, THE Dashboard SHALL display KPI_Cards for total Spend in USD, active user count, total request count, total token count, total API key count, average response time in milliseconds, and monthly budget usage rate.
2. THE Dashboard SHALL compute total Spend for the selected Billing_Month as the sum of `used_usd` across Monthly_Summary_Records for that month.
3. THE Dashboard SHALL compute the active user count for the selected Billing_Month as the count of distinct `user_id` values among Monthly_Summary_Records whose `request_count` is greater than or equal to 1.
4. THE Dashboard SHALL compute total token count as the sum of `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, and `image_output_tokens` across Monthly_Summary_Records for the selected Billing_Month.
5. THE Dashboard SHALL compute total request count as the sum of `request_count` across Monthly_Summary_Records for the selected Billing_Month.
6. THE Dashboard SHALL compute total API key count as the sum of `api_key_count` across Monthly_Summary_Records for the selected Billing_Month.
7. THE Dashboard SHALL compute average response time as the request-count-weighted average of `avg_duration_ms` across Monthly_Summary_Records for the selected Billing_Month, computed as the sum of `avg_duration_ms` multiplied by `request_count` divided by the sum of `request_count`.
8. THE Dashboard SHALL compute the monthly budget usage rate as total Spend divided by the sum of `monthly_limit_usd` across Monthly_Summary_Records for the selected Billing_Month, multiplied by 100 and rounded to one decimal place.
9. IF the sum of `monthly_limit_usd` across Monthly_Summary_Records for the selected Billing_Month is zero, THEN THE Dashboard SHALL display the monthly budget usage rate as 0 percent.
10. WHEN more than one Billing_Month is available, THE Dashboard SHALL display each KPI_Card with the percentage change relative to the most recent Billing_Month earlier than the selected one, computed as the current value minus the preceding value divided by the preceding value multiplied by 100, and SHALL display a no-comparison indicator WHERE the preceding value is zero.

### Requirement 5: Dashboard Overview Charts

**User Story:** As a data PM, I want trend and distribution charts on the Dashboard, so that I can see how spend, requests, and tokens move over time and how they break down.

#### Acceptance Criteria

1. WHEN the Dashboard renders the daily trend section, THE Dashboard SHALL display, for the selected Billing_Month, line charts of daily Spend computed as the sum of `used_usd`, daily request count computed as the sum of `request_count`, and daily token count computed as the sum of `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, and `image_output_tokens`, using Daily_Usage_Records aggregated by `usage_date` and ordered by `usage_date` in ascending order.
2. WHEN the Dashboard renders the user spend ranking, THE Dashboard SHALL display a horizontal bar chart of at most the 10 highest users by Spend (`used_usd`) for the selected Billing_Month using Monthly_Summary_Records, sorted by Spend in descending order, displaying all available users WHERE fewer than 10 users have records, and labeling each bar with the user's `username` or, WHERE `username` is empty, the user's `email`.
3. WHEN the Dashboard renders the model spend share, THE Dashboard SHALL display a donut chart of Spend (`actual_cost_usd`) grouped into the GPT, Claude, Gemini, and Other Model_Family values for the selected Billing_Month using Model_Usage_Records.
4. WHEN the Dashboard renders the cost composition, THE Dashboard SHALL display a stacked bar chart whose segments are the sums of `input_cost_usd`, `output_cost_usd`, `cache_creation_cost_usd`, `cache_read_cost_usd`, and `image_output_cost_usd` across Monthly_Summary_Records for the selected Billing_Month.
5. IF a chart on the Dashboard has no source records for the selected Billing_Month, THEN THE Dashboard SHALL display an empty-state message in that chart's area instead of a blank chart.

### Requirement 6: Model Family Classification

**User Story:** As a data PM, I want model names grouped into recognizable families, so that model spend share is meaningful at the executive level.

#### Acceptance Criteria

1. WHEN the Platform classifies a model name, THE Platform SHALL assign the model to the GPT Model_Family WHERE the model name begins with `gpt` or `codex`.
2. WHEN the Platform classifies a model name, THE Platform SHALL assign the model to the Claude Model_Family WHERE the model name contains `claude`.
3. WHEN the Platform classifies a model name, THE Platform SHALL assign the model to the Gemini Model_Family WHERE the model name contains `gemini`.
4. IF a model name matches none of the GPT, Claude, or Gemini classification rules, THEN THE Platform SHALL assign the model to the Other Model_Family.
5. THE Platform SHALL apply the same Model_Family classification rules consistently across the Dashboard, Model_Analysis_Page, and Cost_Analysis_Page.

### Requirement 7: User Ranking Table

**User Story:** As a data PM, I want a sortable, searchable user ranking table, so that I can identify the highest-spend and highest-volume users.

#### Acceptance Criteria

1. WHEN the User_Analysis_Page loads for a selected Billing_Month, THE User_Analysis_Page SHALL display a table with columns for username, Spend, request count, total tokens, and API key count using Monthly_Summary_Records.
2. WHEN the user selects a column header, THE User_Analysis_Page SHALL sort the table by that column in ascending or descending order.
3. WHEN the user enters text in the user search field, THE User_Analysis_Page SHALL filter the table to rows whose username or email contains the entered text, using case-insensitive matching.
4. THE User_Analysis_Page SHALL paginate the user ranking table with a user-configurable page size that defaults to 25 rows per page.
5. WHERE a Monthly_Summary_Record has an empty `username`, THE User_Analysis_Page SHALL display the user's `email` as the row label.

### Requirement 8: User Activity Scatter

**User Story:** As a data PM, I want a scatter plot of user activity, so that I can spot high-spend, high-frequency, and high-potential users.

#### Acceptance Criteria

1. WHEN the User_Analysis_Page renders the activity scatter, THE User_Analysis_Page SHALL plot one point per user with request count on the X axis and Spend on the Y axis using Monthly_Summary_Records for the selected Billing_Month.
2. THE User_Analysis_Page SHALL size each scatter point in proportion to the user's total token count.
3. WHEN the user hovers over a scatter point, THE User_Analysis_Page SHALL display a tooltip showing the username, request count, Spend, and total tokens for that user.

### Requirement 9: User Budget Monitoring

**User Story:** As a budget owner, I want a budget monitoring list with warning thresholds, so that I can act before users exceed their monthly limit.

#### Acceptance Criteria

1. WHEN the User_Analysis_Page renders the budget monitoring section, THE User_Analysis_Page SHALL display a progress-bar list showing each user's `monthly_limit_usd`, `used_usd`, and `remaining_monthly_limit_usd` for the selected Billing_Month.
2. WHILE a user's Usage_Percent is greater than or equal to 80 and less than 95, THE User_Analysis_Page SHALL render that user's progress bar in the yellow warning style.
3. WHILE a user's Usage_Percent is greater than or equal to 95, THE User_Analysis_Page SHALL render that user's progress bar in the red warning style.
4. THE User_Analysis_Page SHALL sort the budget monitoring list by Usage_Percent in descending order.

### Requirement 10: Per-User Trend Analysis

**User Story:** As a data PM, I want per-user daily trends when I select a single user, so that I can investigate that user's behavior over time.

#### Acceptance Criteria

1. WHEN the user selects a single user on the User_Analysis_Page, THE User_Analysis_Page SHALL display line charts of that user's daily Spend, daily request count, and daily token count using Daily_Usage_Records filtered to that `user_id` and the selected Billing_Month.
2. WHERE the selected user has Daily_Usage_Records whose metric values are all zero, THE User_Analysis_Page SHALL display the line charts rendering zero values rather than an empty state.
3. IF the selected user has no Daily_Usage_Records for the selected Billing_Month, THEN THE User_Analysis_Page SHALL display an empty-state message in the per-user trend section.

### Requirement 11: Model Analysis

**User Story:** As a data PM, I want model spend, request, token, and efficiency analysis, so that I can identify high-cost, high-latency, and cost-effective models.

#### Acceptance Criteria

1. WHEN the Model_Analysis_Page loads for a selected Billing_Month, THE Model_Analysis_Page SHALL display a bar chart ranking models by total Spend using Model_Usage_Records aggregated by `model`.
2. WHEN the Model_Analysis_Page loads for a selected Billing_Month, THE Model_Analysis_Page SHALL display a bar chart ranking models by total request count using Model_Usage_Records aggregated by `model`.
3. WHEN the Model_Analysis_Page renders the token analysis, THE Model_Analysis_Page SHALL display a stacked bar chart of `input_tokens`, `output_tokens`, and `cache_read_tokens` per model.
4. WHEN the Model_Analysis_Page renders the efficiency scatter, THE Model_Analysis_Page SHALL plot one point per model with `avg_duration_ms` on the X axis and total Spend on the Y axis.
5. WHEN the Model_Analysis_Page computes a model's `avg_duration_ms`, THE Model_Analysis_Page SHALL compute the request-count-weighted average of `avg_duration_ms` across Model_Usage_Records for that model.

### Requirement 12: API Key Analysis

**User Story:** As a cost owner, I want API key rankings, trends, and health indicators, so that I can attribute cost to projects and detect key-level anomalies.

#### Acceptance Criteria

1. WHEN the Key_Analysis_Page loads for a selected Billing_Month, THE Key_Analysis_Page SHALL display a ranking of API keys showing `api_key_name`, Spend, request count, and the owning username using Key_Usage_Records.
2. WHEN no API key is selected on the Key_Analysis_Page, THE Key_Analysis_Page SHALL display line charts of daily Spend and daily request count aggregated across all API keys for the selected Billing_Month.
3. WHEN the user selects an API key on the Key_Analysis_Page, THE Key_Analysis_Page SHALL display line charts of that key's daily Spend and daily request count using Request_Detail_Records filtered to that `api_key_id` and aggregated by day.
4. WHEN the Key_Analysis_Page renders the health section, THE Key_Analysis_Page SHALL list API keys whose `last_request_at` is more than 14 days before the end of the selected Billing_Month as long-unused keys.
5. WHEN the Key_Analysis_Page renders the health section, THE Key_Analysis_Page SHALL list the top API keys by request count for the selected Billing_Month as high-frequency keys.
6. WHEN the Key_Analysis_Page renders the health section AND more than one Billing_Month is available, THE Key_Analysis_Page SHALL list API keys whose request count increased by at least 200 percent relative to the preceding Billing_Month as abnormal-growth keys.
7. WHERE a Key_Usage_Record has `api_key_deleted` equal to true, THE Key_Analysis_Page SHALL display a deleted indicator on that key's row.

### Requirement 13: Cost Trend and Distribution

**User Story:** As a finance analyst, I want cost trends and a hierarchical cost breakdown, so that I can understand where spend concentrates.

#### Acceptance Criteria

1. WHEN the Cost_Analysis_Page renders the cost trend, THE Cost_Analysis_Page SHALL display a line chart of Spend over time with selectable daily, weekly, and monthly granularity.
2. WHILE daily granularity is selected, THE Cost_Analysis_Page SHALL aggregate Spend by `usage_date` using Daily_Usage_Records.
3. WHILE monthly granularity is selected, THE Cost_Analysis_Page SHALL aggregate Spend by Billing_Month using Monthly_Summary_Records.
4. WHEN the Cost_Analysis_Page renders the cost distribution, THE Cost_Analysis_Page SHALL display a treemap with a three-level hierarchy of user, then model, then API key, sized by Spend.

### Requirement 14: Pareto and Cost Forecast

**User Story:** As a finance analyst, I want Pareto concentration analysis and a month-end forecast, so that I can quantify spend concentration and anticipate budget risk.

#### Acceptance Criteria

1. WHEN the Cost_Analysis_Page renders the Pareto analysis, THE Cost_Analysis_Page SHALL compute and display the percentage of total Spend contributed by the top 10 percent, top 20 percent, and top 30 percent of users ranked by Spend for the selected Billing_Month.
2. WHEN the Cost_Analysis_Page renders the forecast, THE Cost_Analysis_Page SHALL compute the projected month-end Spend by extrapolating cumulative daily Spend to the last day of the selected Billing_Month using Daily_Usage_Records.
3. WHEN the Cost_Analysis_Page renders the forecast, THE Cost_Analysis_Page SHALL display the projected number of days until the aggregate Monthly_Budget_Limit is reached at the current average daily Spend rate.
4. IF the projected month-end Spend exceeds the aggregate Monthly_Budget_Limit for the selected Billing_Month, THEN THE Cost_Analysis_Page SHALL display an over-budget risk indicator.
5. IF the selected Billing_Month contains fewer than 3 days of Daily_Usage_Records, THEN THE Cost_Analysis_Page SHALL display an insufficient-data message instead of a forecast value and SHALL suppress the over-budget risk indicator.

### Requirement 15: Auto-Generated Insights and Top Performers

**User Story:** As an executive, I want the Platform to auto-generate trend insights and top performer rankings, so that the dashboard reads like a management cockpit rather than a raw data table.

#### Acceptance Criteria

1. WHEN aggregated data for the selected Billing_Month is available AND at least one user has a non-zero Spend, request count, or token count, THE Insight_Engine SHALL generate a ranked list of the top performing users by Spend, request count, and token count.
2. IF every user has zero Spend, zero requests, and zero tokens for the selected Billing_Month, THEN THE Insight_Engine SHALL omit the top performer rankings.
3. WHEN more than one Billing_Month is available, THE Insight_Engine SHALL generate trend insights describing the direction and magnitude of change in total Spend, active users, and total requests relative to the preceding Billing_Month.
4. WHEN the Insight_Engine generates an insight, THE Insight_Engine SHALL present the insight as a short textual statement accompanied by the supporting metric value.
5. WHERE the data required to compute an insight is unavailable, THE Insight_Engine SHALL omit that insight rather than display a placeholder value.

### Requirement 16: Signal Center Drawer

**User Story:** As an operations owner, I want a Bell-triggered drawer of real-time signals, so that I can monitor alerts, anomalies, and risk hints in one place.

#### Acceptance Criteria

1. WHEN the user activates the Bell icon, THE Signal_Center SHALL open as a fixed right-side drawer over the current page.
2. WHEN the Signal_Center opens, THE Signal_Center SHALL display signals grouped into high-spend alerts, low-balance alerts, API key anomalies, response time anomalies, and risk hints.
3. WHILE one or more signals remain unread, THE Signal_Center SHALL display a count badge on the Bell icon showing the number of unread signals regardless of whether the drawer is open or closed.
4. WHEN the user activates the Bell icon while the Signal_Center is open, THE Signal_Center SHALL close the drawer.
5. WHEN the user selects a signal, THE Signal_Center SHALL navigate to the page and entity that the signal references.

### Requirement 17: Signal and Anomaly Detection Rules

**User Story:** As an operations owner, I want clearly defined detection rules, so that signals are consistent, explainable, and actionable.

#### Acceptance Criteria

1. IF a user's single-day Spend exceeds 20 percent of that user's Monthly_Budget_Limit, THEN THE Signal_Engine SHALL produce a high-spend alert identifying the user, the date, and the day's Spend.
2. IF a user's `remaining_monthly_limit_usd` is less than or equal to 10 percent of that user's `monthly_limit_usd`, THEN THE Signal_Engine SHALL produce a low-balance alert identifying the user and the remaining amount.
3. IF an API key's single-day request count exceeds 3 times that key's average daily request count for the selected Billing_Month, THEN THE Signal_Engine SHALL produce an API key anomaly identifying the key, the owning user, and the date.
4. IF a user's `avg_duration_ms` exceeds the response-time threshold of 60000 milliseconds, THEN THE Signal_Engine SHALL produce a response time anomaly identifying the user and the average response time.
5. IF a user triggers a high-spend alert on 2 or more consecutive days within the selected Billing_Month, THEN THE Signal_Engine SHALL produce a risk hint identifying the user and the consecutive-day count.
6. WHEN the Signal_Engine produces a signal, THE Signal_Engine SHALL assign the signal a severity of informational, warning, or critical based on its rule.

### Requirement 18: Dark Mode and Responsive Layout

**User Story:** As a user on varied devices, I want a dark-mode-first, responsive interface, so that the Platform is comfortable and usable on desktop and mobile.

#### Acceptance Criteria

1. WHEN the Platform first loads without a stored theme preference, THE Platform SHALL render the user interface in dark mode.
2. WHEN the user toggles the theme control, THE Platform SHALL switch between dark mode and light mode and persist the selected preference across sessions.
3. WHILE the viewport width is 320 pixels or greater and less than 768 pixels, THE Platform SHALL render pages in a single-column card layout with navigation collapsed into a menu control.
4. WHILE the viewport width is less than 320 pixels, THE Platform SHALL render pages in a single-column card layout with horizontal scrolling enabled for content wider than the viewport.
5. WHILE the viewport width is 768 pixels or greater, THE Platform SHALL render pages in a multi-column card layout.
6. WHEN the viewport is resized, THE Platform SHALL resize ECharts visualizations to fit their containing cards.

### Requirement 19: Filtering, Search, and Date Range Selection

**User Story:** As a data PM, I want consistent filtering, search, and date range controls, so that I can scope every page to the data I care about.

#### Acceptance Criteria

1. THE Platform SHALL provide a Billing_Month selector that applies to the Dashboard, User_Analysis_Page, Model_Analysis_Page, Key_Analysis_Page, and Cost_Analysis_Page.
2. WHEN the user selects a Date_Range_Filter, THE Platform SHALL constrain time-series charts on the active page to records whose date falls within the selected start and end dates inclusive.
3. IF the user selects a Date_Range_Filter whose start date is later than its end date, THEN THE Platform SHALL reject the selection and display a validation message.
4. WHEN the user changes any filter, search term, or Date_Range_Filter, THE Platform SHALL update the active page's data without requiring a full page reload.
5. WHEN the user clears all filters, THE Platform SHALL restore the active page to the default view scoped to the most recent Billing_Month.

### Requirement 20: Report Export

**User Story:** As a data PM, I want to export reports of what I am viewing, so that I can share usage and cost summaries outside the Platform.

#### Acceptance Criteria

1. WHEN the user activates the export control on a page, THE Export_Service SHALL produce a downloadable file containing the currently filtered data for that page in CSV format.
2. WHEN the Export_Service produces a CSV export, THE Export_Service SHALL include a header row with column names matching the displayed table or chart series.
3. WHEN the Export_Service produces an export, THE Export_Service SHALL name the file using the page name, the selected Billing_Month, and the export timestamp.
4. WHILE an export is being generated, THE Export_Service SHALL display a progress indicator, and THE Export_Service SHALL complete the export even IF the progress indicator fails to render.
5. IF the data selected for export contains no records, THEN THE Export_Service SHALL produce a CSV file containing only the header row.

### Requirement 21: Data Integrity and Cross-Source Consistency

**User Story:** As a data PM, I want the Platform to reconcile values across the CSV sources, so that I can trust the numbers shown across pages.

#### Acceptance Criteria

1. WHEN the Query_Service aggregates Daily_Usage_Records for a user and Billing_Month, THE Query_Service SHALL associate those records with the corresponding Monthly_Summary_Record by `user_id` and Billing_Month.
2. IF the sum of `used_usd` across a user's Daily_Usage_Records for a Billing_Month differs from that user's Monthly_Summary_Record `used_usd` by more than 1 percent, THEN THE Platform SHALL record a reconciliation discrepancy in the ingestion log.
3. WHEN a Request_Detail_Record references an `api_key_id` that has no matching Key_Usage_Record for the same Billing_Month, THE Platform SHALL record an unmatched-reference entry in the ingestion log and SHALL retain the Request_Detail_Record for query.
4. THE Query_Service SHALL compute every monetary aggregate in USD using the documented cost fields without converting currencies.
