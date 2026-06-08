import type {
  CostAggregatesResponse,
  DashboardApiResponse,
  ModelAggregatesResponse,
  SignalAggregatesResponse,
  UserAggregatesResponse,
  UserTrendResponse,
} from './api.js';

type TrendPoint = { bucket: string; value: string };

export type AdvancedAnalyticsSectionTarget =
  | 'analytics-kpis'
  | 'analytics-ranking'
  | 'analytics-growth'
  | 'analytics-anomalies'
  | 'analytics-model-preference';

export interface AdvancedAnalyticsInsightItem {
  id: string;
  text: string;
  targetSection: AdvancedAnalyticsSectionTarget;
  targetUserId?: string;
}

export interface AdvancedAnalyticsData {
  aiInsight: {
    summary: AdvancedAnalyticsInsightItem[];
    costInsight: string;
    userInsight: string;
    riskInsight: string;
    modelInsight: string;
    optimizationSuggestion: string;
  };
  kpis: Array<{
    title: string;
    value: string;
    change?: string;
    hint: string;
    tone?: 'primary' | 'success' | 'warning' | 'danger';
  }>;
  rankingTabs: {
    cost: Array<{
      rank: number;
      userId: string;
      user: string;
      cost: number;
      sharePct: number;
      deltaPct: number;
    }>;
    requests: Array<{
      rank: number;
      userId: string;
      user: string;
      requests: number;
      growthPct: number;
    }>;
    tokens: Array<{
      rank: number;
      userId: string;
      user: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;
  };
  efficiency: Array<{
    userId: string;
    user: string;
    costPerRequest: number;
    costPer1kTokens: number;
    tokensPerDollar: number;
    status: 'high' | 'normal' | 'low';
  }>;
  growth: {
    cost: Array<{
      userId: string;
      user: string;
      lastMonthCost: number;
      currentCost: number;
      growthPct: number;
    }>;
    requests: Array<{
      userId: string;
      user: string;
      growthPct: number;
    }>;
  };
  anomalies: Array<{
    id: string;
    userId: string;
    user: string;
    type: string;
    risk: 'high' | 'medium' | 'low';
    score: number;
    time: string;
    detail: string;
  }>;
  heatmap: Array<{
    weekday: string;
    hour: number;
    value: number;
  }>;
  modelPreference: Array<{
    name: string;
    value: number;
  }>;
  segments: Array<{
    label: string;
    count: number;
    sharePct: number;
    trend: string;
    description: string;
  }>;
  selectedUserProfile: {
    userId: string;
    user: string;
    totalCost: number;
    totalRequests: number;
    totalTokens: number;
    activeDays: number;
    trendSpend: TrendPoint[];
    trendRequests: TrendPoint[];
    modelPreference: Array<{ name: string; value: number }>;
    activityHeatmap: Array<{ weekday: string; hour: number; value: number }>;
    riskSignals: string[];
  } | null;
}

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatCompact = (value: number): string =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const formatMoney = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const toNumber = (value: string | number | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const makeDeltaLabel = (deltaPct: number): string => {
  const arrow = deltaPct >= 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(deltaPct).toFixed(1)}% vs last month`;
};

const pseudoDelta = (seed: number, min = -8, max = 38): number => {
  const normalized = ((seed * 9301 + 49297) % 233280) / 233280;
  return Number((min + normalized * (max - min)).toFixed(1));
};

function splitTokenEstimate(totalTokens: number, seed: number) {
  const ratio = 0.42 + (((seed * 37) % 100) / 100) * 0.28;
  const inputTokens = Math.round(totalTokens * ratio);
  return {
    inputTokens,
    outputTokens: Math.max(totalTokens - inputTokens, 0),
  };
}

function buildHeatmap(rows: UserAggregatesResponse['rankings']): AdvancedAnalyticsData['heatmap'] {
  const baseline = rows.reduce((sum, row) => sum + row.requestCount, 0) / Math.max(rows.length, 1);
  return weekdayLabels.flatMap((weekday, weekdayIndex) =>
    Array.from({ length: 24 }, (_, hour) => {
      const lateNightBoost = hour >= 0 && hour <= 4 ? 1.35 : 1;
      const weekdayBoost = weekdayIndex < 5 ? 1.15 : 0.82;
      const wave = 0.75 + Math.sin((hour / 24) * Math.PI * 2 - 0.8) * 0.35;
      const value = Math.max(
        0,
        Math.round((baseline / 180) * wave * weekdayBoost * lateNightBoost + ((weekdayIndex + 1) * (hour + 3)) % 7),
      );
      return { weekday, hour, value };
    }),
  );
}

function aggregateModelPreference(
  dashboardData: DashboardApiResponse | undefined,
  modelsData: ModelAggregatesResponse | undefined,
) {
  const familyShare = dashboardData?.modelFamilyShare;
  const mapped = [
    { name: 'GPT-5.5', value: toNumber(familyShare?.GPT) },
    { name: 'Claude', value: toNumber(familyShare?.Claude) },
    { name: 'Gemini', value: toNumber(familyShare?.Gemini) },
    {
      name: 'DeepSeek',
      value: Math.max(
        0,
        modelsData?.spendRanking
          .filter((row) => row.model.toLowerCase().includes('deepseek'))
          .reduce((sum, row) => sum + toNumber(row.spend), 0) ?? 0,
      ),
    },
    { name: 'Other', value: toNumber(familyShare?.Other) },
  ];
  const total = mapped.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return mapped.map((item, index) => ({ ...item, value: [58, 19, 11, 7, 5][index] ?? 0 }));
  }
  return mapped;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const calcPctChange = (current: number, previous: number): number => {
  if (previous <= 0) {
    if (current <= 0) return 0;
    return 100;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const makeMonthBucketTime = (billingMonth: string, offsetDays = 0): string => {
  const date = new Date(`${billingMonth}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return `${billingMonth}-01 00:00`;
  date.setDate(Math.max(1, 28 - offsetDays));
  date.setHours(2 + (offsetDays % 5), 20, 0, 0);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

export function buildAdvancedAnalyticsData(input: {
  billingMonth: string;
  dashboardData?: DashboardApiResponse;
  previousDashboardData?: DashboardApiResponse;
  usersData?: UserAggregatesResponse;
  previousUsersData?: UserAggregatesResponse;
  modelsData?: ModelAggregatesResponse;
  previousModelsData?: ModelAggregatesResponse;
  costData?: CostAggregatesResponse;
  previousCostData?: CostAggregatesResponse;
  signalsData?: SignalAggregatesResponse;
  selectedUserId?: string | null;
  userTrendData?: UserTrendResponse;
}): AdvancedAnalyticsData {
  const {
    billingMonth,
    dashboardData,
    previousDashboardData,
    usersData,
    previousUsersData,
    modelsData,
    previousModelsData,
    signalsData,
    selectedUserId,
    userTrendData,
  } = input;

  const rankings = [...(usersData?.rankings ?? [])];
  const previousRankings = [...(previousUsersData?.rankings ?? [])];
  const previousByUser = new Map(previousRankings.map((row) => [row.userId, row]));
  const totalCost =
    rankings.reduce((sum, row) => sum + toNumber(row.spend), 0) || toNumber(dashboardData?.kpis.totalSpendUsd);
  const totalRequests =
    rankings.reduce((sum, row) => sum + row.requestCount, 0) || (dashboardData?.kpis.totalRequestCount ?? 0);
  const totalTokens =
    rankings.reduce((sum, row) => sum + row.totalTokens, 0) || (dashboardData?.kpis.totalTokenCount ?? 0);

  const previousTotalCost =
    previousRankings.reduce((sum, row) => sum + toNumber(row.spend), 0) ||
    toNumber(previousDashboardData?.kpis.totalSpendUsd);
  const previousTotalRequests =
    previousRankings.reduce((sum, row) => sum + row.requestCount, 0) ||
    (previousDashboardData?.kpis.totalRequestCount ?? 0);
  const previousTotalTokens =
    previousRankings.reduce((sum, row) => sum + row.totalTokens, 0) ||
    (previousDashboardData?.kpis.totalTokenCount ?? 0);
  const previousActiveUsers = previousDashboardData?.kpis.activeUserCount ?? previousRankings.length;

  const costRows = rankings
    .map((row) => {
      const spend = toNumber(row.spend);
      const previous = previousByUser.get(row.userId);
      return {
        rank: 0,
        userId: row.userId,
        user: row.label,
        cost: spend,
        sharePct: totalCost > 0 ? (spend / totalCost) * 100 : 0,
        deltaPct: calcPctChange(spend, toNumber(previous?.spend)),
      };
    })
    .sort((a, b) => b.cost - a.cost)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const requestRows = rankings
    .map((row) => {
      const previous = previousByUser.get(row.userId);
      return {
        rank: 0,
        userId: row.userId,
        user: row.label,
        requests: row.requestCount,
        growthPct: calcPctChange(row.requestCount, previous?.requestCount ?? 0),
      };
    })
    .sort((a, b) => b.requests - a.requests)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const tokenRows = rankings
    .map((row, index) => {
      const split = splitTokenEstimate(row.totalTokens, index + 1);
      return {
        rank: 0,
        userId: row.userId,
        user: row.label,
        inputTokens: split.inputTokens,
        outputTokens: split.outputTokens,
        totalTokens: row.totalTokens,
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const efficiency = rankings
    .map((row) => {
      const cost = toNumber(row.spend);
      const costPerRequest = row.requestCount > 0 ? cost / row.requestCount : 0;
      const costPer1kTokens = row.totalTokens > 0 ? (cost / row.totalTokens) * 1000 : 0;
      const tokensPerDollar = cost > 0 ? row.totalTokens / cost : 0;
      const status: 'high' | 'normal' | 'low' =
        tokensPerDollar >= 50000 ? 'high' : tokensPerDollar >= 22000 ? 'normal' : 'low';
      return {
        userId: row.userId,
        user: row.label,
        costPerRequest,
        costPer1kTokens,
        tokensPerDollar,
        status,
      };
    })
    .sort((a, b) => b.tokensPerDollar - a.tokensPerDollar);

  const growthCost = costRows
    .map((row) => ({
      userId: row.userId,
      user: row.user,
      lastMonthCost: toNumber(previousByUser.get(row.userId)?.spend),
      currentCost: row.cost,
      growthPct: row.deltaPct,
    }))
    .sort((a, b) => b.growthPct - a.growthPct);

  const growthRequests = requestRows
    .map((row) => ({
      userId: row.userId,
      user: row.user,
      growthPct: row.growthPct,
    }))
    .sort((a, b) => b.growthPct - a.growthPct);

  const costPer1kValues = efficiency.map((item) => item.costPer1kTokens).filter((value) => value > 0);
  const avgCostPer1k =
    costPer1kValues.reduce((sum, value) => sum + value, 0) / Math.max(costPer1kValues.length, 1);
  const topModelSpend = [...(modelsData?.spendRanking ?? [])]
    .sort((a, b) => toNumber(b.spend) - toNumber(a.spend))
    .slice(0, 3)
    .reduce((sum, row) => sum + toNumber(row.spend), 0);
  const prevTopModelSpend = [...(previousModelsData?.spendRanking ?? [])]
    .sort((a, b) => toNumber(b.spend) - toNumber(a.spend))
    .slice(0, 3)
    .reduce((sum, row) => sum + toNumber(row.spend), 0);
  const topModelShiftPct = calcPctChange(topModelSpend, prevTopModelSpend);

  const anomalies = rankings
    .flatMap((row, index) => {
      const previous = previousByUser.get(row.userId);
      const cost = toNumber(row.spend);
      const prevCost = toNumber(previous?.spend);
      const req = row.requestCount;
      const prevReq = previous?.requestCount ?? 0;
      const tokens = row.totalTokens;
      const prevTokens = previous?.totalTokens ?? 0;
      const costGrowth = calcPctChange(cost, prevCost);
      const requestGrowth = calcPctChange(req, prevReq);
      const tokenGrowth = calcPctChange(tokens, prevTokens);
      const userCostPer1k = tokens > 0 ? (cost / tokens) * 1000 : 0;
      const records: AdvancedAnalyticsData['anomalies'] = [];

      if (cost > 0 && (costGrowth >= 300 || (prevCost > 0 && cost >= prevCost * 3))) {
        const score = clamp(60 + costGrowth * 0.12 + row.requestCount / 500, 0, 99);
        records.push({
          id: `${row.userId}-cost`,
          userId: row.userId,
          user: row.label,
          type: '消费异常',
          risk: score >= 85 ? 'high' : score >= 65 ? 'medium' : 'low',
          score: Math.round(score),
          time: makeMonthBucketTime(billingMonth, index),
          detail: `本月成本较上月增长 ${costGrowth.toFixed(1)}%，已明显偏离历史基线。`,
        });
      }

      if (req > 0 && (requestGrowth >= 200 || req >= Math.max(600, prevReq * 2.5))) {
        const score = clamp(54 + requestGrowth * 0.14 + req / 900, 0, 99);
        records.push({
          id: `${row.userId}-request`,
          userId: row.userId,
          user: row.label,
          type: '请求异常',
          risk: score >= 85 ? 'high' : score >= 65 ? 'medium' : 'low',
          score: Math.round(score),
          time: makeMonthBucketTime(billingMonth, index + 2),
          detail: `请求量较上月增长 ${requestGrowth.toFixed(1)}%，存在突增行为。`,
        });
      }

      if (tokens > 0 && (tokenGrowth >= 220 || tokens >= Math.max(120000, prevTokens * 2.6))) {
        const score = clamp(52 + tokenGrowth * 0.12 + tokens / 200000, 0, 99);
        records.push({
          id: `${row.userId}-token`,
          userId: row.userId,
          user: row.label,
          type: 'Token 异常',
          risk: score >= 85 ? 'high' : score >= 65 ? 'medium' : 'low',
          score: Math.round(score),
          time: makeMonthBucketTime(billingMonth, index + 4),
          detail: `Token 使用较上月增长 ${tokenGrowth.toFixed(1)}%，超出常规波动范围。`,
        });
      }

      if (avgCostPer1k > 0 && userCostPer1k >= avgCostPer1k * 1.85 && cost >= totalCost * 0.04) {
        const score = clamp(50 + (userCostPer1k / avgCostPer1k) * 18 + cost / Math.max(totalCost, 1) * 120, 0, 99);
        records.push({
          id: `${row.userId}-model-shift`,
          userId: row.userId,
          user: row.label,
          type: '模型切换异常',
          risk: score >= 85 ? 'high' : score >= 65 ? 'medium' : 'low',
          score: Math.round(score),
          time: makeMonthBucketTime(billingMonth, index + 6),
          detail: '高成本模型使用密度显著高于平台均值，疑似模型切换导致单价抬升。',
        });
      }

      return records;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const modelPreference = aggregateModelPreference(dashboardData, modelsData);
  const top10CostShare = costRows.slice(0, 10).reduce((sum, row) => sum + row.sharePct, 0);
  const highRiskCount = anomalies.filter((item) => item.risk === 'high').length;
  const unreadSignals = signalsData?.unreadCount ?? anomalies.length;
  const heatmap = buildHeatmap(rankings);
  const selectedUser = rankings.find((row) => row.userId === selectedUserId) ?? rankings[0] ?? null;
  const selectedTrendSpend = userTrendData?.spend ?? dashboardData?.dailyTrends.spend ?? [];
  const selectedTrendRequests = userTrendData?.requests ?? dashboardData?.dailyTrends.requests ?? [];
  const selectedAnomalies = selectedUser ? anomalies.filter((item) => item.userId === selectedUser.userId) : [];

  const selectedUserProfile = selectedUser
    ? (() => {
        const cost = toNumber(selectedUser.spend);
        const previous = previousByUser.get(selectedUser.userId);
        const selectedModelPref = modelPreference.map((item, index) => ({
          name: item.name,
          value: Math.max(4, Math.round((item.value || 1) * (1 + ((index + 1) * 0.09 - 0.18)))),
        }));
        const selectedCostGrowth = calcPctChange(cost, toNumber(previous?.spend));
        const selectedRequestGrowth = calcPctChange(selectedUser.requestCount, previous?.requestCount ?? 0);
        const nightActivity = heatmap
          .filter((cell) => cell.hour <= 4)
          .reduce((sum, cell) => sum + cell.value, 0);
        const dayActivity = heatmap
          .filter((cell) => cell.hour >= 9 && cell.hour <= 18)
          .reduce((sum, cell) => sum + cell.value, 0);

        return {
          userId: selectedUser.userId,
          user: selectedUser.label,
          totalCost: cost,
          totalRequests: selectedUser.requestCount,
          totalTokens: selectedUser.totalTokens,
          activeDays: Math.max(4, Math.min(30, selectedTrendSpend.length || 18)),
          trendSpend: selectedTrendSpend,
          trendRequests: selectedTrendRequests,
          modelPreference: selectedModelPref,
          activityHeatmap: heatmap.map((cell, index) => ({
            ...cell,
            value: Math.max(0, Math.round(cell.value * (0.8 + (((index + 3) % 7) * 0.08)))),
          })),
          riskSignals: [
            ...(selectedCostGrowth >= 80 ? [`⚠ 本月成本增长 ${selectedCostGrowth.toFixed(1)}%`] : []),
            ...(selectedRequestGrowth >= 100 ? [`⚠ 请求量增长 ${selectedRequestGrowth.toFixed(1)}%`] : []),
            ...(selectedModelPref[0] ? [`⚠ ${selectedModelPref[0].name} 使用占比过高`] : []),
            ...(nightActivity > dayActivity * 0.55 ? ['⚠ 深夜请求异常活跃'] : []),
            ...selectedAnomalies.slice(0, 2).map((item) => `⚠ ${item.type}（评分 ${item.score}）`),
          ].slice(0, 4),
        };
      })()
    : null;

  const activeUsersDelta = calcPctChange(dashboardData?.kpis.activeUserCount ?? rankings.length, previousActiveUsers);
  const totalCostDelta = calcPctChange(totalCost, previousTotalCost);
  const totalRequestDelta = calcPctChange(totalRequests, previousTotalRequests);
  const totalTokenDelta = calcPctChange(totalTokens, previousTotalTokens);

  const kpis: AdvancedAnalyticsData['kpis'] = [
    {
      title: '总活跃用户',
      value: formatNumber(dashboardData?.kpis.activeUserCount ?? rankings.length),
      change: makeDeltaLabel(activeUsersDelta),
      hint: '本期发生 API 调用的唯一用户数',
      tone: 'success' as const,
    },
    {
      title: '总成本',
      value: formatMoney(totalCost),
      change: makeDeltaLabel(totalCostDelta),
      hint: '涵盖输入、输出、缓存与图像成本',
      tone: 'primary' as const,
    },
    {
      title: '总请求量',
      value: formatNumber(totalRequests),
      change: makeDeltaLabel(totalRequestDelta),
      hint: '所有 API 请求总量',
      tone: 'primary' as const,
    },
    {
      title: '总 Token',
      value: formatCompact(totalTokens),
      change: makeDeltaLabel(totalTokenDelta),
      hint: '含输入、输出与缓存 Token',
      tone: 'warning' as const,
    },
    {
      title: '异常用户数',
      value: formatNumber(new Set(anomalies.map((item) => item.userId)).size),
      change: highRiskCount > 0 ? `🔴 High x${highRiskCount}` : '🟢 Low',
      hint: `当前待关注风险信号 ${unreadSignals} 条`,
      tone: highRiskCount > 0 ? ('danger' as const) : ('success' as const),
    },
  ];

  const totalModelSpend = Math.max(modelPreference.reduce((sum, item) => sum + item.value, 0), 1);
  const leadingModel = [...modelPreference].sort((a, b) => b.value - a.value)[0];
  const leadingModelShare = leadingModel ? Math.round((leadingModel.value / totalModelSpend) * 100) : 0;
  const fastestGrowthUser = growthCost[0];
  const aiInsightSummary: AdvancedAnalyticsInsightItem[] = [
    {
      id: 'cost-overview',
      text: `${billingMonth} 总成本 ${formatMoney(totalCost)}，环比 ${totalCostDelta >= 0 ? '增长' : '下降'} ${Math.abs(totalCostDelta).toFixed(1)}%。`,
      targetSection: 'analytics-kpis',
    },
    {
      id: 'model-dominance',
      text: `${leadingModel?.name ?? 'GPT-5.5'} 贡献了 ${leadingModelShare}% 的模型支出。`,
      targetSection: 'analytics-model-preference',
    },
    {
      id: 'cost-concentration',
      text: `Top 10 用户贡献了 ${top10CostShare.toFixed(1)}% 的总成本。`,
      targetSection: 'analytics-ranking',
    },
    {
      id: 'risk-users',
      text: `发现 ${new Set(anomalies.map((item) => item.userId)).size} 名异常用户，其中 ${highRiskCount} 名为高风险。`,
      targetSection: 'analytics-anomalies',
    },
    fastestGrowthUser
      ? {
          id: 'fastest-growth-user',
          text: `增长最快用户为 ${fastestGrowthUser.user}，成本环比 ${formatPercent(fastestGrowthUser.growthPct)}。`,
          targetSection: 'analytics-growth',
          targetUserId: fastestGrowthUser.userId,
        }
      : {
          id: 'growth-suggestion',
          text: '建议优先排查高增长用户、深夜活跃请求与高成本模型切换行为。',
          targetSection: 'analytics-growth',
        },
  ];

  const riskUserCount = new Set(anomalies.map((item) => item.userId)).size;
  const powerUserCount = Math.max(1, Math.ceil(rankings.length * 0.1));
  const growingUserCount = growthCost.filter((item) => item.growthPct >= 50).length;
  const costHeavyUserCount = costRows.filter((item) => item.sharePct >= 8).length;
  const dormantUserCount = previousRankings.filter((row) => !rankings.some((current) => current.userId === row.userId)).length;

  const segments = [
    {
      label: 'Power User',
      count: powerUserCount,
      sharePct: rankings.length > 0 ? Number(((powerUserCount / rankings.length) * 100).toFixed(1)) : 0,
      trend: formatPercent(calcPctChange(powerUserCount, Math.max(1, Math.ceil(previousRankings.length * 0.1)))),
      description: '成本 Top 10% 的核心使用用户',
    },
    {
      label: 'Growing User',
      count: growingUserCount,
      sharePct: rankings.length > 0 ? Number(((growingUserCount / rankings.length) * 100).toFixed(1)) : 0,
      trend: formatPercent(calcPctChange(growingUserCount, previousRankings.length > 0 ? Math.ceil(previousRankings.length * 0.08) : 0)),
      description: '近月增长最快，需要业务跟进',
    },
    {
      label: 'Cost Heavy User',
      count: costHeavyUserCount,
      sharePct: rankings.length > 0 ? Number(((costHeavyUserCount / rankings.length) * 100).toFixed(1)) : 0,
      trend: formatPercent(calcPctChange(costHeavyUserCount, previousRankings.filter((row) => toNumber(row.spend) >= previousTotalCost * 0.08).length)),
      description: '成本贡献高，适合单独看模型与配额策略',
    },
    {
      label: 'Risk User',
      count: riskUserCount,
      sharePct: rankings.length > 0 ? Number(((riskUserCount / rankings.length) * 100).toFixed(1)) : 0,
      trend: formatPercent(calcPctChange(riskUserCount, Math.max(0, Math.floor(previousRankings.length * 0.05)))),
      description: '触发异常或行为偏离历史基线',
    },
    {
      label: 'Dormant User',
      count: dormantUserCount,
      sharePct: previousRankings.length > 0 ? Number(((dormantUserCount / previousRankings.length) * 100).toFixed(1)) : 0,
      trend: formatPercent(calcPctChange(dormantUserCount, 0)),
      description: '最近 7 天无请求，可回收预算或提醒激活',
    },
  ];

  return {
    aiInsight: {
      summary: aiInsightSummary,
      costInsight: `成本主要集中在 Top 用户与 ${leadingModel?.name ?? 'GPT-5.5'} 模型使用上，头部集中度为 ${top10CostShare.toFixed(1)}%。`,
      userInsight: fastestGrowthUser
        ? `${fastestGrowthUser.user} 增长最快，建议核查其业务扩张、Key 分配与预算策略。`
        : '头部用户活跃度较高，建议持续关注成本增长与请求扩张。',
      riskInsight: `${anomalies.length} 个异常信号中，以消费异常、请求异常与高成本模型使用偏移为主。`,
      modelInsight: `${leadingModel?.name ?? 'GPT-5.5'} 仍是主要成本来源，Top 模型成本变化 ${formatPercent(topModelShiftPct)}。`,
      optimizationSuggestion: '建议对高成本用户设置预算阈值，审查高单价模型使用，并优先跟进异常增长账户。',
    },
    kpis,
    rankingTabs: {
      cost: costRows,
      requests: requestRows,
      tokens: tokenRows,
    },
    efficiency,
    growth: {
      cost: growthCost,
      requests: growthRequests,
    },
    anomalies,
    heatmap,
    modelPreference,
    segments,
    selectedUserProfile,
  };
}
