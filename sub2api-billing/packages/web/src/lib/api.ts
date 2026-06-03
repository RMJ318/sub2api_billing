export interface DashboardApiResponse {
  kpis: {
    totalSpendUsd: string;
    activeUserCount: number;
    totalRequestCount: number;
    totalTokenCount: number;
    totalApiKeyCount: number;
    avgResponseMs: number;
    budgetUsageRatePct: number;
  };
  dailyTrends: {
    spend: Array<{ bucket: string; value: string }>;
    requests: Array<{ bucket: string; value: string }>;
    tokens: Array<{ bucket: string; value: string }>;
  };
  topUserSpend: Array<{
    label: string;
    userId: string;
    spend: string;
  }>;
  modelFamilyShare: Record<'GPT' | 'Claude' | 'Gemini' | 'Other', string>;
  costComposition: {
    input: string;
    output: string;
    cacheCreation: string;
    cacheRead: string;
    imageOutput: string;
  };
}

export interface UserAggregatesResponse {
  rankings: Array<{
    userId: string;
    label: string;
    spend: string;
    requestCount: number;
    totalTokens: number;
    apiKeyCount: number;
  }>;
  budgetMonitor: Array<{
    userId: string;
    label: string;
    usedUsd: string;
    limitUsd: string;
    remainingUsd: string;
    usagePct: number;
    style: 'normal' | 'warning' | 'critical';
  }>;
  activityScatter: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    size: number;
  }>;
}

export interface KeyAggregatesResponse {
  rankings: Array<{
    apiKeyId: string;
    apiKeyName: string | null;
    spend: string;
    requestCount: number;
    ownerLabel: string;
    deleted: boolean;
  }>;
  keyHealth: {
    longUnused: unknown[];
    highFrequency: unknown[];
    abnormalGrowth: unknown[];
  };
  allKeysDailyTrend: {
    spend: Array<{ bucket: string; value: string }>;
    requests: Array<{ bucket: string; value: string }>;
  };
}

export interface ModelAggregatesResponse {
  spendRanking: Array<{ model: string; spend: string }>;
  requestRanking: Array<{ model: string; requestCount: number }>;
  tokenStacks: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  }>;
  efficiencyScatter: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    size: number;
  }>;
}

export interface CostAggregatesResponse {
  trend: {
    daily: Array<{ bucket: string; value: string }>;
    weekly: Array<{ bucket: string; value: string }>;
    monthly: Array<{ bucket: string; value: string }>;
  };
  pareto: {
    top10: number;
    top20: number;
    top30: number;
  };
  forecast:
    | {
        kind?: undefined;
        projectedMonthEndSpendUsd: string;
        averageDailySpendUsd: string;
        remainingDays: number;
        projectedDaysToBudget: number | null;
        isOverBudget: boolean;
      }
    | {
        kind: string;
        reason: string;
      };
}

export interface SignalAggregatesResponse {
  unreadCount: number;
  signals: Array<{
    id: string;
    group: string;
    severity: 'informational' | 'warning' | 'critical';
    message: string;
    target: {
      page: string;
      entityId: string;
    };
    read: boolean;
  }>;
}

export interface UserTrendResponse {
  spend: Array<{ bucket: string; value: string }>;
  requests: Array<{ bucket: string; value: string }>;
  tokens: Array<{ bucket: string; value: string }>;
}

export interface KeyTrendResponse {
  spend: Array<{ bucket: string; value: string }>;
  requests: Array<{ bucket: string; value: string }>;
}

export interface MonthsResponse {
  months: string[];
}

async function fetchJson<T>(input: string): Promise<T> {
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<{ status: string }> {
  return fetchJson('/health');
}

export async function fetchMonths(): Promise<MonthsResponse> {
  return fetchJson('/api/metadata/months');
}

export async function fetchDashboard(
  billingMonth: string,
): Promise<DashboardApiResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/dashboard?${params.toString()}`);
}

export async function fetchUsers(
  billingMonth: string,
): Promise<UserAggregatesResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/users?${params.toString()}`);
}

export async function fetchUserTrend(
  billingMonth: string,
  userId: string,
): Promise<UserTrendResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/users/${userId}/trend?${params.toString()}`);
}

export async function fetchKeys(
  billingMonth: string,
): Promise<KeyAggregatesResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/keys?${params.toString()}`);
}

export async function fetchKeyTrend(
  billingMonth: string,
  apiKeyId: string,
): Promise<KeyTrendResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/keys/${apiKeyId}/trend?${params.toString()}`);
}

export async function fetchModels(
  billingMonth: string,
): Promise<ModelAggregatesResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/models?${params.toString()}`);
}

export async function fetchCost(
  billingMonth: string,
): Promise<CostAggregatesResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/cost?${params.toString()}`);
}

export async function fetchSignals(
  billingMonth: string,
): Promise<SignalAggregatesResponse> {
  const params = new URLSearchParams({ billingMonth });
  return fetchJson(`/api/signals?${params.toString()}`);
}

export function buildExportUrl(pageName: string, billingMonth: string): string {
  const params = new URLSearchParams({ pageName, billingMonth });
  return `/api/export?${params.toString()}`;
}
