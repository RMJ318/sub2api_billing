import { useEffect, useMemo, useState, type JSX } from 'react';
import type { ECElementEvent, EChartsOption } from 'echarts';
import { DashboardSummaryCard } from '../components/DashboardSummaryCard.js';
import { EChartCard } from '../components/EChartCard.js';
import type {
  CostAggregatesResponse,
  DashboardApiResponse,
  ModelAggregatesResponse,
  SignalAggregatesResponse,
  UserAggregatesResponse,
  UserTrendResponse,
} from '../lib/api.js';
import {
  buildAdvancedAnalyticsData,
  type AdvancedAnalyticsInsightItem,
  type AdvancedAnalyticsSectionTarget,
} from '../lib/advancedAnalytics.js';

type RankingTabKey = 'cost' | 'requests' | 'tokens';
type GrowthLimit = 10 | 20 | 'all';

type AnalyticsSectionId =
  | 'analytics-overview'
  | 'analytics-kpis'
  | 'analytics-ranking'
  | 'analytics-efficiency'
  | 'analytics-growth'
  | 'analytics-anomalies'
  | 'analytics-heatmap'
  | 'analytics-model-preference'
  | 'analytics-segments'
  | 'analytics-user-profile';

export interface AdvancedAnalyticsPageProps {
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
  userTrendData?: UserTrendResponse;
  loading?: boolean;
  selectedUserId?: string | null;
  onSelectUser?: (userId: string | null) => void;
}

const rankingTabs: Array<{ key: RankingTabKey; label: string }> = [
  { key: 'cost', label: 'Cost Ranking' },
  { key: 'requests', label: 'Request Ranking' },
  { key: 'tokens', label: 'Token Ranking' },
];

const growthOptions: GrowthLimit[] = [10, 20, 'all'];

const kpiSectionTargets: Record<string, AnalyticsSectionId> = {
  总活跃用户: 'analytics-ranking',
  总成本: 'analytics-ranking',
  总请求量: 'analytics-growth',
  '总 Token': 'analytics-model-preference',
  异常用户数: 'analytics-anomalies',
};

const sectionIds: Record<AdvancedAnalyticsSectionTarget, AnalyticsSectionId> = {
  'analytics-kpis': 'analytics-kpis',
  'analytics-ranking': 'analytics-ranking',
  'analytics-growth': 'analytics-growth',
  'analytics-anomalies': 'analytics-anomalies',
  'analytics-model-preference': 'analytics-model-preference',
};

const analyticsSections: Array<{
  id: AnalyticsSectionId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'analytics-overview',
    label: 'Overview',
    shortLabel: 'Overview',
    description: 'AI Insight 自动分析与运营摘要',
  },
  {
    id: 'analytics-kpis',
    label: 'KPI',
    shortLabel: 'KPI',
    description: '活跃用户、成本、请求、Token 与异常概览',
  },
  {
    id: 'analytics-ranking',
    label: 'User Ranking',
    shortLabel: 'Ranking',
    description: '成本、请求量与 Token 排行',
  },
  {
    id: 'analytics-efficiency',
    label: 'Efficiency',
    shortLabel: 'Efficiency',
    description: '识别高成本低产出与高性价比用户',
  },
  {
    id: 'analytics-growth',
    label: 'Growth',
    shortLabel: 'Growth',
    description: '本月增长最快的成本与请求账户',
  },
  {
    id: 'analytics-anomalies',
    label: 'Anomalies',
    shortLabel: 'Anomaly',
    description: '消费、请求、Token 与模型切换异常',
  },
  {
    id: 'analytics-heatmap',
    label: 'Heatmap',
    shortLabel: 'Heatmap',
    description: '按周与小时查看请求热度分布',
  },
  {
    id: 'analytics-model-preference',
    label: 'Model Preference',
    shortLabel: 'Models',
    description: '模型使用占比与单用户偏好对比',
  },
  {
    id: 'analytics-segments',
    label: 'Segments',
    shortLabel: 'Segments',
    description: 'Power / Growing / Risk / Dormant 分群视图',
  },
  {
    id: 'analytics-user-profile',
    label: 'User Profile',
    shortLabel: 'Profile',
    description: '单用户成本、请求、模型偏好与风险画像',
  },
];

const riskToneClass = {
  high: 'text-red-300 bg-red-500/15 border-red-400/30',
  medium: 'text-amber-200 bg-amber-500/15 border-amber-300/30',
  low: 'text-emerald-200 bg-emerald-500/15 border-emerald-400/30',
} as const;

const efficiencyToneClass = {
  high: 'text-emerald-200 bg-emerald-500/12 border-emerald-400/20',
  normal: 'text-sky-200 bg-sky-500/12 border-sky-400/20',
  low: 'text-amber-200 bg-amber-500/12 border-amber-300/20',
} as const;

const signalDetailToneClass = {
  high: 'text-red-200 bg-red-500/15 border-red-400/30',
  medium: 'text-amber-100 bg-amber-500/15 border-amber-300/30',
  low: 'text-emerald-100 bg-emerald-500/15 border-emerald-400/30',
} as const;

interface RiskSignalDetail {
  id: string;
  title: string;
  summary: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
  userId?: string;
  userLabel?: string;
}

interface HeatmapFocusDetail {
  weekday: string;
  hour: number;
  value: number;
  scope: 'platform' | 'selected-user';
}

type ProfileRiskLevel = 'high' | 'medium' | 'low';

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatMoney = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const getProfileRiskLevel = (riskSignals: string[]): ProfileRiskLevel => {
  const normalized = riskSignals.join(' ');
  if (/异常|评分|过高|突增|增长/.test(normalized)) return 'high';
  if (/活跃|占比|集中/.test(normalized)) return 'medium';
  return 'low';
};

const profileRiskLabelMap: Record<ProfileRiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

const profileRiskToneClassMap: Record<ProfileRiskLevel, string> = {
  high: 'text-red-200 bg-red-500/12 border-red-400/28',
  medium: 'text-amber-100 bg-amber-500/12 border-amber-300/24',
  low: 'text-emerald-100 bg-emerald-500/12 border-emerald-400/24',
};

const WATCHLIST_STORAGE_KEY = 'advanced-analytics-watchlist';

const hashString = (input: string): number =>
  input.split('').reduce((accumulator, character) => accumulator + character.charCodeAt(0) * 17, 0);

const buildEstimatedModelAffinity = (
  userId: string,
  modelName: string,
  modelPreference: Array<{ name: string; value: number }>,
): number => {
  const targetModel = modelPreference.find((item) => item.name === modelName);
  const total = Math.max(
    modelPreference.reduce((sum, item) => sum + item.value, 0),
    1,
  );
  const baseShare = (targetModel?.value ?? 0) / total;
  const hash = hashString(`${userId}:${modelName}`);
  const affinityFactor = 0.82 + ((hash % 37) / 100);
  return Number((baseShare * 100 * affinityFactor).toFixed(2));
};

const buildRiskSignalDetail = (
  signal: string,
  index: number,
  context?: { userId?: string; userLabel?: string },
): RiskSignalDetail => {
  const cleanedSignal = signal.replace(/^⚠\s*/, '').trim();
  const severity: RiskSignalDetail['severity'] =
    /异常|过高|增长/.test(cleanedSignal) ? 'high' : /活跃|占比/.test(cleanedSignal) ? 'medium' : 'low';

  if (cleanedSignal.includes('成本增长')) {
    return {
      id: `risk-signal-${index}`,
      title: '成本增长预警',
      summary: cleanedSignal,
      severity,
      description: '该用户当月成本较历史周期出现明显抬升，可能与调用量提升、模型切换或异常请求有关。',
      recommendation: '建议优先核查预算阈值、调用来源和高单价模型使用情况。',
      userId: context?.userId,
      userLabel: context?.userLabel,
    };
  }

  if (cleanedSignal.includes('请求量增长')) {
    return {
      id: `risk-signal-${index}`,
      title: '请求量突增预警',
      summary: cleanedSignal,
      severity,
      description: '请求量在短周期内快速上升，可能代表业务放量，也可能意味着脚本、批量任务或异常访问。',
      recommendation: '建议排查请求来源、访问时段分布以及是否存在重复重试或自动任务。',
      userId: context?.userId,
      userLabel: context?.userLabel,
    };
  }

  if (cleanedSignal.includes('使用占比过高')) {
    return {
      id: `risk-signal-${index}`,
      title: '模型集中度风险',
      summary: cleanedSignal,
      severity: 'medium',
      description: '单一模型使用占比偏高，容易放大成本波动，也可能限制整体调度与优化空间。',
      recommendation: '建议评估是否可以引入替代模型、路由策略或按场景拆分模型配比。',
      userId: context?.userId,
      userLabel: context?.userLabel,
    };
  }

  if (cleanedSignal.includes('深夜请求异常活跃')) {
    return {
      id: `risk-signal-${index}`,
      title: '深夜活跃异常',
      summary: cleanedSignal,
      severity: 'medium',
      description: '非高峰时段请求活跃度偏高，通常需要结合定时任务、自动化脚本或异常访问行为进一步判断。',
      recommendation: '建议检查夜间调用 IP、任务计划、Key 使用范围以及告警阈值设置。',
      userId: context?.userId,
      userLabel: context?.userLabel,
    };
  }

  if (cleanedSignal.includes('评分')) {
    return {
      id: `risk-signal-${index}`,
      title: '异常评分命中',
      summary: cleanedSignal,
      severity: 'high',
      description: '系统已根据多维指标识别出该用户的异常特征，说明其行为偏离历史基线。',
      recommendation: '建议结合异常类型、时间点和相关趋势图进一步复核，并视情况限制额度。',
      userId: context?.userId,
      userLabel: context?.userLabel,
    };
  }

  return {
    id: `risk-signal-${index}`,
    title: '风险信号详情',
    summary: cleanedSignal,
    severity,
    description: '该信号表示当前用户存在需要关注的使用行为变化，建议结合趋势和画像信息综合判断。',
    recommendation: '建议进一步查看成本、请求和模型偏好变化，以确认是否需要采取干预措施。',
    userId: context?.userId,
    userLabel: context?.userLabel,
  };
};

export function AdvancedAnalyticsPage({
  billingMonth,
  dashboardData,
  previousDashboardData,
  usersData,
  previousUsersData,
  modelsData,
  previousModelsData,
  costData,
  previousCostData,
  signalsData,
  userTrendData,
  loading = false,
  selectedUserId,
  onSelectUser,
}: AdvancedAnalyticsPageProps): JSX.Element {
  const [rankingTab, setRankingTab] = useState<RankingTabKey>('cost');
  const [growthLimit, setGrowthLimit] = useState<GrowthLimit>(10);
  const [highlightedSection, setHighlightedSection] = useState<AdvancedAnalyticsSectionTarget | null>(null);
  const [highlightedUserId, setHighlightedUserId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<AnalyticsSectionId>('analytics-overview');
  const [activeRiskSignal, setActiveRiskSignal] = useState<RiskSignalDetail | null>(null);
  const [activeModelFocus, setActiveModelFocus] = useState<string | null>(null);
  const [activeAnomalyTypeFocus, setActiveAnomalyTypeFocus] = useState<string | null>(null);
  const [activeHeatmapFocus, setActiveHeatmapFocus] = useState<HeatmapFocusDetail | null>(null);
  const [watchedUserIds, setWatchedUserIds] = useState<string[]>([]);
  const [watchlistHydrated, setWatchlistHydrated] = useState(false);

  const data = useMemo(
    () =>
      buildAdvancedAnalyticsData({
        billingMonth,
        dashboardData,
        previousDashboardData,
        usersData,
        previousUsersData,
        modelsData,
        previousModelsData,
        costData,
        previousCostData,
        signalsData,
        selectedUserId,
        userTrendData,
      }),
    [
      billingMonth,
      costData,
      dashboardData,
      modelsData,
      previousCostData,
      previousDashboardData,
      previousModelsData,
      previousUsersData,
      selectedUserId,
      signalsData,
      userTrendData,
      usersData,
    ],
  );

  const platformModelOption = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#8c909f' } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          label: { color: '#c2c6d6' },
          itemStyle: { borderColor: '#111827', borderWidth: 2 },
          data: data.modelPreference.map((item, index) => ({
            name: item.name,
            value: item.value,
            itemStyle: {
              color: ['#4d8eff', '#00c2ff', '#8b5cf6', '#00a572', '#64748b'][index] ?? '#64748b',
            },
          })),
        },
      ],
    }),
    [data.modelPreference],
  );

  const stackedPreferenceOption = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, textStyle: { color: '#8c909f' } },
      grid: { left: 24, right: 20, top: 24, bottom: 44 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: ['Platform', data.selectedUserProfile?.user ?? 'Selected User'] },
      series: data.modelPreference.map((item, index) => ({
        name: item.name,
        type: 'bar',
        stack: 'usage',
        emphasis: { focus: 'series' },
        itemStyle: { color: ['#4d8eff', '#00c2ff', '#8b5cf6', '#00a572', '#64748b'][index] ?? '#64748b' },
        data: [
          item.value,
          (data.selectedUserProfile?.modelPreference.find((model) => model.name === item.name)?.value ?? item.value) *
            0.86,
        ],
      })),
    }),
    [data.modelPreference, data.selectedUserProfile],
  );

  const userSpendTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!data.selectedUserProfile) return undefined;
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: '#8c909f' } },
      grid: { left: 28, right: 20, top: 26, bottom: 40 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.selectedUserProfile.trendSpend.map((item) => item.bucket),
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Cost',
          type: 'line',
          smooth: true,
          lineStyle: { color: '#4d8eff', width: 3 },
          areaStyle: { color: 'rgba(77,142,255,0.12)' },
          data: data.selectedUserProfile.trendSpend.map((item) => Number(item.value)),
        },
      ],
    };
  }, [data.selectedUserProfile]);

  const userRequestTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!data.selectedUserProfile) return undefined;
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: '#8c909f' } },
      grid: { left: 28, right: 20, top: 26, bottom: 40 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.selectedUserProfile.trendRequests.map((item) => item.bucket),
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Requests',
          type: 'line',
          smooth: true,
          lineStyle: { color: '#00c2ff', width: 3 },
          areaStyle: { color: 'rgba(0,194,255,0.12)' },
          data: data.selectedUserProfile.trendRequests.map((item) => Number(item.value)),
        },
      ],
    };
  }, [data.selectedUserProfile]);

  const watchedUserIdSet = useMemo(() => new Set(watchedUserIds), [watchedUserIds]);

  const linkedFilteredUserIds = useMemo(() => {
    if (!activeModelFocus && !activeAnomalyTypeFocus) return null;

    const userIds = new Set<string>();

    if (activeModelFocus) {
      const rankedByAffinity = [...data.rankingTabs.cost]
        .map((row) => ({
          userId: row.userId,
          affinity: buildEstimatedModelAffinity(row.userId, activeModelFocus, data.modelPreference),
        }))
        .sort((left, right) => right.affinity - left.affinity)
        .slice(0, 8)
        .filter((item) => item.affinity > 0.5);

      rankedByAffinity.forEach((item) => userIds.add(item.userId));

      data.anomalies.forEach((item) => {
        if (item.type === '模型切换异常' || item.detail.includes(activeModelFocus)) {
          userIds.add(item.userId);
        }
      });
    }

    if (activeAnomalyTypeFocus) {
      data.anomalies.forEach((item) => {
        if (item.type === activeAnomalyTypeFocus) {
          userIds.add(item.userId);
        }
      });
    }

    if (data.selectedUserProfile?.userId) userIds.add(data.selectedUserProfile.userId);
    if (highlightedUserId) userIds.add(highlightedUserId);
    watchedUserIds.forEach((userId) => userIds.add(userId));

    return userIds.size > 0 ? userIds : null;
  }, [
    activeAnomalyTypeFocus,
    activeModelFocus,
    data.anomalies,
    data.modelPreference,
    data.rankingTabs.cost,
    data.selectedUserProfile?.userId,
    highlightedUserId,
    watchedUserIds,
  ]);

  const contextScoreByUser = useMemo(() => {
    const scores = new Map<string, number>();

    const addScore = (userId: string, score: number) => {
      scores.set(userId, (scores.get(userId) ?? 0) + score);
    };

    if (activeModelFocus) {
      data.rankingTabs.cost.forEach((row) => {
        const affinity = buildEstimatedModelAffinity(row.userId, activeModelFocus, data.modelPreference);
        const costBias = row.sharePct * 1.8 + Math.max(row.deltaPct, 0) * 0.35;
        addScore(row.userId, affinity + costBias);
      });

      data.anomalies.forEach((item) => {
        if (item.type === '模型切换异常') {
          addScore(item.userId, 32 + item.score * 0.45);
        }
      });
    }

    if (activeAnomalyTypeFocus) {
      data.anomalies.forEach((item) => {
        if (item.type === activeAnomalyTypeFocus) {
          addScore(item.userId, 26 + item.score * 0.3);
        }
      });
    }

    if (data.selectedUserProfile?.userId) {
      addScore(data.selectedUserProfile.userId, 140);
    }

    if (highlightedUserId) {
      addScore(highlightedUserId, 24);
    }

    watchedUserIds.forEach((userId) => addScore(userId, 72));

    return scores;
  }, [
    activeAnomalyTypeFocus,
    activeModelFocus,
    data.anomalies,
    data.modelPreference,
    data.rankingTabs.cost,
    data.selectedUserProfile?.userId,
    highlightedUserId,
    watchedUserIds,
  ]);

  const sortRowsByContext = <T extends { userId: string }>(rows: T[]): T[] =>
    [...rows].sort((left, right) => {
      const scoreDiff = (contextScoreByUser.get(right.userId) ?? 0) - (contextScoreByUser.get(left.userId) ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return 0;
    });

  const filterRowsByLinkedContext = <T extends { userId: string }>(rows: T[]): T[] => {
    if (!linkedFilteredUserIds) return rows;
    const filteredRows = rows.filter((row) => linkedFilteredUserIds.has(row.userId));
    return filteredRows.length > 0 ? filteredRows : rows;
  };

  const visibleRankingCostRows = useMemo(
    () => filterRowsByLinkedContext(sortRowsByContext(data.rankingTabs.cost)).slice(0, 12),
    [contextScoreByUser, data.rankingTabs.cost, linkedFilteredUserIds],
  );
  const visibleRankingRequestRows = useMemo(
    () => filterRowsByLinkedContext(sortRowsByContext(data.rankingTabs.requests)).slice(0, 12),
    [contextScoreByUser, data.rankingTabs.requests, linkedFilteredUserIds],
  );
  const visibleRankingTokenRows = useMemo(
    () => filterRowsByLinkedContext(sortRowsByContext(data.rankingTabs.tokens)).slice(0, 12),
    [contextScoreByUser, data.rankingTabs.tokens, linkedFilteredUserIds],
  );
  const visibleEfficiencyRows = useMemo(
    () => filterRowsByLinkedContext(sortRowsByContext(data.efficiency)).slice(0, 8),
    [contextScoreByUser, data.efficiency, linkedFilteredUserIds],
  );
  const sortedGrowthCostRows = useMemo(
    () => filterRowsByLinkedContext(sortRowsByContext(data.growth.cost)),
    [contextScoreByUser, data.growth.cost, linkedFilteredUserIds],
  );
  const sortedGrowthRequestRows = useMemo(
    () => filterRowsByLinkedContext(sortRowsByContext(data.growth.requests)),
    [contextScoreByUser, data.growth.requests, linkedFilteredUserIds],
  );
  const visibleGrowthCostRows = growthLimit === 'all' ? sortedGrowthCostRows : sortedGrowthCostRows.slice(0, growthLimit);
  const visibleGrowthRequestRows =
    growthLimit === 'all' ? sortedGrowthRequestRows : sortedGrowthRequestRows.slice(0, growthLimit);
  const sortedAnomalies = useMemo(() => {
    const prioritizedType = activeAnomalyTypeFocus;
    return [...data.anomalies].sort((left, right) => {
      const leftTypeBoost = prioritizedType && left.type === prioritizedType ? 1 : 0;
      const rightTypeBoost = prioritizedType && right.type === prioritizedType ? 1 : 0;
      if (rightTypeBoost !== leftTypeBoost) return rightTypeBoost - leftTypeBoost;

      const scoreDiff = (contextScoreByUser.get(right.userId) ?? 0) - (contextScoreByUser.get(left.userId) ?? 0);
      if (scoreDiff !== 0) return scoreDiff;

      return right.score - left.score;
    });
  }, [activeAnomalyTypeFocus, contextScoreByUser, data.anomalies]);
  const visibleAnomalies = useMemo(() => {
    const anomalyTypeFiltered = activeAnomalyTypeFocus
      ? sortedAnomalies.filter((item) => item.type === activeAnomalyTypeFocus)
      : sortedAnomalies;

    if (!linkedFilteredUserIds) return anomalyTypeFiltered;

    const linkedRows = anomalyTypeFiltered.filter((item) => linkedFilteredUserIds.has(item.userId));
    return linkedRows.length > 0 ? linkedRows : anomalyTypeFiltered;
  }, [activeAnomalyTypeFocus, linkedFilteredUserIds, sortedAnomalies]);

  const linkedFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (activeModelFocus) parts.push(`模型：${activeModelFocus}`);
    if (activeAnomalyTypeFocus) parts.push(`异常：${activeAnomalyTypeFocus}`);
    return parts.join(' · ');
  }, [activeAnomalyTypeFocus, activeModelFocus]);

  useEffect(() => {
    if (!highlightedSection) return undefined;
    const timeoutId = window.setTimeout(() => setHighlightedSection(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedSection]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawValue = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (!rawValue) {
        setWatchlistHydrated(true);
        return;
      }
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        setWatchedUserIds(parsed.filter((item): item is string => typeof item === 'string'));
      }
    } catch {
      // Ignore malformed watchlist cache and fall back to in-memory state.
    } finally {
      setWatchlistHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!watchlistHydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([...new Set(watchedUserIds)]));
    } catch {
      // Ignore persistence failures in private mode or blocked storage environments.
    }
  }, [watchlistHydrated, watchedUserIds]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const nextId = visibleEntries[0]?.target.id as AnalyticsSectionId | undefined;
        if (nextId) {
          setActiveSectionId(nextId);
        }
      },
      {
        root: null,
        rootMargin: '-15% 0px -55% 0px',
        threshold: [0.2, 0.35, 0.55, 0.75],
      },
    );

    analyticsSections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (sectionId: AnalyticsSectionId) => {
    setActiveSectionId(sectionId);

    window.requestAnimationFrame(() => {
      const element = document.getElementById(sectionId);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${sectionId}`);
    });
  };

  const handleInsightClick = (item: AdvancedAnalyticsInsightItem) => {
    if (item.targetSection === 'analytics-ranking') {
      setRankingTab('cost');
    }
    if (item.targetSection === 'analytics-growth') {
      setGrowthLimit(10);
    }
    if (item.targetUserId) {
      setHighlightedUserId(item.targetUserId);
      onSelectUser?.(item.targetUserId);
    }
    setHighlightedSection(item.targetSection);
    scrollToSection(sectionIds[item.targetSection]);
  };

  const handleSectionJump = (sectionId: AnalyticsSectionId) => {
    const targetSection = Object.entries(sectionIds).find(([, id]) => id === sectionId)?.[0] as
      | AdvancedAnalyticsSectionTarget
      | undefined;
    if (targetSection) {
      setHighlightedSection(targetSection);
    }
    scrollToSection(sectionId);
  };

  const handleKpiJump = (title: string) => {
    const targetSection = kpiSectionTargets[title];
    if (!targetSection) return;

    if (title === '总成本' || title === '总活跃用户') {
      setRankingTab('cost');
    }
    if (title === '总请求量') {
      setGrowthLimit(10);
    }

    const mappedTargetSection = Object.entries(sectionIds).find(([, id]) => id === targetSection)?.[0] as
      | AdvancedAnalyticsSectionTarget
      | undefined;
    if (mappedTargetSection) {
      setHighlightedSection(mappedTargetSection);
    }

    scrollToSection(targetSection);
  };

  const sectionClassName = (
    target: AdvancedAnalyticsSectionTarget | AnalyticsSectionId,
    baseClassName: string,
  ): string =>
    `${baseClassName}${
      highlightedSection === target || activeSectionId === target ? ' analytics-section-highlight' : ''
    }`;

  const focusUserProfile = (userId: string) => {
    setHighlightedUserId(userId);
    setActiveSectionId('analytics-user-profile');
    onSelectUser?.(userId);
    scrollToSection('analytics-user-profile');
  };

  const userRowClassName = (userId: string): string =>
    highlightedUserId === userId ? 'analytics-row-highlight' : '';

  const clearSelectedUserContext = () => {
    setHighlightedUserId(null);
    setActiveRiskSignal(null);
    setActiveModelFocus(null);
    setActiveAnomalyTypeFocus(null);
    onSelectUser?.(null);
    handleSectionJump('analytics-overview');
  };

  const focusTopCostUser = () => {
    const topUserId = data.rankingTabs.cost[0]?.userId;
    if (topUserId) {
      focusUserProfile(topUserId);
    }
  };

  const focusHighestRiskUser = () => {
    const riskUserId = data.anomalies[0]?.userId;
    if (riskUserId) {
      focusUserProfile(riskUserId);
      return;
    }
    handleSectionJump('analytics-anomalies');
  };

  const openGrowthLeaders = () => {
    setGrowthLimit(10);
    handleSectionJump('analytics-growth');
  };

  const openTopCostDrilldown = () => {
    setRankingTab('cost');
    handleSectionJump('analytics-ranking');
    const topUserId = data.rankingTabs.cost[0]?.userId;
    if (topUserId) {
      setHighlightedUserId(topUserId);
    }
  };

  const openHighestRiskSignal = () => {
    const highestRiskAnomaly =
      data.anomalies.find((item) => item.risk === 'high') ??
      data.anomalies[0];

    if (!highestRiskAnomaly) {
      handleSectionJump('analytics-anomalies');
      return;
    }

    setActiveAnomalyTypeFocus(highestRiskAnomaly.type);
    setHighlightedUserId(highestRiskAnomaly.userId);
    setActiveRiskSignal(
      buildRiskSignalDetail(`⚠ ${highestRiskAnomaly.type} · ${highestRiskAnomaly.detail}`, highestRiskAnomaly.score, {
        userId: highestRiskAnomaly.userId,
        userLabel: highestRiskAnomaly.user,
      }),
    );
    handleSectionJump('analytics-anomalies');
  };

  const openTopModelFocus = () => {
    const topModelName = data.modelPreference[0]?.name;
    if (!topModelName) {
      handleSectionJump('analytics-model-preference');
      return;
    }

    setActiveModelFocus(topModelName);
    handleSectionJump('analytics-model-preference');
  };

  const toggleWatchUser = (userId: string) => {
    setWatchedUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  };

  const openSimilarAnomalies = (anomalyType: string) => {
    setActiveAnomalyTypeFocus(anomalyType);
    handleSectionJump('analytics-anomalies');
  };

  const clearLinkedFilters = () => {
    setActiveModelFocus(null);
    setActiveAnomalyTypeFocus(null);
    setActiveHeatmapFocus(null);
  };

  const focusHeatmapCell = (
    cell: { weekday: string; hour: number; value: number },
    scope: HeatmapFocusDetail['scope'],
  ) => {
    setActiveHeatmapFocus({ ...cell, scope });
  };

  const jumpFromInsightMiniCard = (title: string) => {
    if (title === '成本洞察') {
      setRankingTab('cost');
      handleSectionJump('analytics-ranking');
      return;
    }
    if (title === '用户洞察') {
      setGrowthLimit(10);
      handleSectionJump('analytics-growth');
      return;
    }
    if (title === '风险洞察') {
      handleSectionJump('analytics-anomalies');
      return;
    }
    if (title === '优化建议') {
      handleSectionJump('analytics-efficiency');
      return;
    }
  };

  const selectRepresentativeUserBySegment = (segmentLabel: string) => {
    if (segmentLabel === 'Power User') {
      focusTopCostUser();
      return;
    }
    if (segmentLabel === 'Growing User') {
      const userId = data.growth.cost[0]?.userId;
      if (userId) {
        focusUserProfile(userId);
        return;
      }
      openGrowthLeaders();
      return;
    }
    if (segmentLabel === 'Cost Heavy User') {
      const userId = data.rankingTabs.cost.find((row) => row.sharePct >= 8)?.userId ?? data.rankingTabs.cost[0]?.userId;
      if (userId) {
        focusUserProfile(userId);
      }
      return;
    }
    if (segmentLabel === 'Risk User') {
      focusHighestRiskUser();
      return;
    }
    if (segmentLabel === 'Dormant User') {
      handleSectionJump('analytics-growth');
      return;
    }
    handleSectionJump('analytics-user-profile');
  };

  const handleModelChartClick = (event: ECElementEvent) => {
    const modelName =
      typeof event.name === 'string'
        ? event.name
        : typeof event.seriesName === 'string'
          ? event.seriesName
          : '';
    if (!modelName) return;

    setActiveModelFocus(modelName);

    if (selectedUserProfile?.modelPreference.some((item) => item.name === modelName)) {
      focusUserProfile(selectedUserProfile.userId);
      return;
    }

    const fallbackUserId = data.rankingTabs.cost[0]?.userId;
    if (fallbackUserId) {
      focusUserProfile(fallbackUserId);
      return;
    }

    handleSectionJump('analytics-user-profile');
  };

  const selectedUserProfile = data.selectedUserProfile;
  const selectedProfileRiskLevel = selectedUserProfile ? getProfileRiskLevel(selectedUserProfile.riskSignals) : null;
  const activeHeatmapLabel = activeHeatmapFocus
    ? `${activeHeatmapFocus.weekday} ${String(activeHeatmapFocus.hour).padStart(2, '0')}:00`
    : null;
  const selectedModelPreferenceValue = activeModelFocus
    ? selectedUserProfile?.modelPreference.find((item) => item.name === activeModelFocus)?.value ?? null
    : null;
  const activeModelWatchCount = data.anomalies.filter(
    (item) => activeModelFocus && item.detail.includes(activeModelFocus),
  ).length;
  const isSelectedUserWatched = selectedUserProfile ? watchedUserIdSet.has(selectedUserProfile.userId) : false;

  return (
    <>
      <div className="span-12 xl:hidden">
        {selectedUserProfile && selectedProfileRiskLevel ? (
          <div className="mb-3">
            <button
              type="button"
              className="panel-muted flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[rgba(173,198,255,0.22)] hover:bg-white/6"
              onClick={() => focusUserProfile(selectedUserProfile.userId)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                    Current User
                  </p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${profileRiskToneClassMap[selectedProfileRiskLevel]}`}
                  >
                    {profileRiskLabelMap[selectedProfileRiskLevel]}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{selectedUserProfile.user}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--text-dim)]">
                  <span>成本 {formatMoney(selectedUserProfile.totalCost)}</span>
                  <span>·</span>
                  <span>请求 {formatNumber(selectedUserProfile.totalRequests)}</span>
                </div>
              </div>
              <span className="shrink-0 pt-1 text-xs font-semibold text-[var(--primary)]">回到画像 ↗</span>
            </button>
            <button
              type="button"
              onClick={clearSelectedUserContext}
              className="mt-2 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-2.5 text-xs font-semibold text-[var(--text-dim)] transition hover:bg-white/8 hover:text-[var(--text)]"
            >
              清除选择 · 回到全局视角
            </button>
          </div>
        ) : null}
        <div className="analytics-mobile-toc custom-scrollbar">
          {analyticsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => handleSectionJump(section.id)}
              className={`analytics-chip ${activeSectionId === section.id ? 'analytics-chip-active' : ''}`}
              title={section.description}
            >
              {section.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className={`span-12 min-w-0 ${activeRiskSignal ? 'xl:pr-[24rem]' : ''}`}>
        <div className="space-y-4 xl:pr-[316px]">
          {selectedUserProfile && selectedProfileRiskLevel ? (
            <div className="sticky top-3 z-20 space-y-3">
              <div className="glass-panel flex flex-col gap-3 rounded-[22px] px-4 py-3 shadow-[0_10px_30px_rgba(3,7,18,0.28)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                      Active Analysis Context
                    </p>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${profileRiskToneClassMap[selectedProfileRiskLevel]}`}
                    >
                      {profileRiskLabelMap[selectedProfileRiskLevel]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="truncate text-sm font-semibold text-[var(--text)]">{selectedUserProfile.user}</span>
                    <span className="text-xs text-[var(--text-dim)]">成本 {formatMoney(selectedUserProfile.totalCost)}</span>
                    <span className="text-xs text-[var(--text-dim)]">请求 {formatNumber(selectedUserProfile.totalRequests)}</span>
                    <span className="text-xs text-[var(--text-dim)]">Token {formatNumber(selectedUserProfile.totalTokens)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="analytics-chip"
                    onClick={() => focusUserProfile(selectedUserProfile.userId)}
                  >
                    回到画像
                  </button>
                  <button
                    type="button"
                    className="analytics-chip"
                    onClick={() => {
                      setRankingTab('cost');
                      handleSectionJump('analytics-ranking');
                    }}
                  >
                    返回排行榜
                  </button>
                  <button
                    type="button"
                    className="analytics-chip"
                    onClick={() => handleSectionJump('analytics-anomalies')}
                  >
                    查看异常
                  </button>
                  <button
                    type="button"
                    className="analytics-chip"
                    onClick={clearSelectedUserContext}
                  >
                    清除选择
                  </button>
                </div>
              </div>

              {activeModelFocus ? (
                <div className="glass-panel flex flex-col gap-3 rounded-[20px] border border-[rgba(77,142,255,0.16)] px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[rgba(77,142,255,0.2)] bg-[rgba(77,142,255,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                        Model Focus
                      </span>
                      <span className="text-sm font-semibold text-[var(--text)]">{activeModelFocus}</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                      当前正在围绕 <span className="font-semibold text-[var(--text)]">{activeModelFocus}</span> 查看画像与风险。
                      {selectedModelPreferenceValue !== null ? (
                        <>
                          {' '}当前画像中该模型估算值约为{' '}
                          <span className="font-semibold text-[var(--primary)]">{formatNumber(selectedModelPreferenceValue)}</span>
                          。
                        </>
                      ) : (
                        <> 当前画像里还没有明确的该模型偏好数据，你也可以切换到其他用户继续对比。</>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="analytics-chip"
                      onClick={() => handleSectionJump('analytics-model-preference')}
                    >
                      返回模型分析
                    </button>
                    <button
                      type="button"
                      className="analytics-chip"
                      onClick={() => setActiveModelFocus(null)}
                    >
                      清除模型焦点
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : activeModelFocus ? (
            <div className="sticky top-3 z-20 mb-3">
              <div className="glass-panel flex flex-col gap-3 rounded-[20px] border border-[rgba(77,142,255,0.16)] px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[rgba(77,142,255,0.2)] bg-[rgba(77,142,255,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                      Model Focus
                    </span>
                    <span className="text-sm font-semibold text-[var(--text)]">{activeModelFocus}</span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                    你刚刚从模型图表点进来，当前分析焦点是 <span className="font-semibold text-[var(--text)]">{activeModelFocus}</span>。
                    继续选择一个用户后，我会把这个模型上下文保留下来，方便你对照看画像。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="analytics-chip"
                    onClick={focusTopCostUser}
                  >
                    选一个代表用户
                  </button>
                  <button
                    type="button"
                    className="analytics-chip"
                    onClick={() => setActiveModelFocus(null)}
                  >
                    清除模型焦点
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <section id="analytics-overview" className={sectionClassName('analytics-overview', '')}>
        <div className="glass-panel rounded-[28px] p-6 md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-dim)]">
                Advanced Analytics
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] md:text-[2.6rem]">
                深度分析用户 API 使用行为、成本结构、增长趋势与异常风险。
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-muted)]">
                面向运营、管理员和管理层的高级洞察视图，帮助你在 30 秒内看清钱花在哪、谁增长最快、谁存在风险，以及哪些模型最值得优化。
              </p>
            </div>

              <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
                <InsightMiniCard title="成本洞察" body={data.aiInsight.costInsight} onClick={() => jumpFromInsightMiniCard('成本洞察')} />
                <InsightMiniCard title="用户洞察" body={data.aiInsight.userInsight} onClick={() => jumpFromInsightMiniCard('用户洞察')} />
                <InsightMiniCard title="风险洞察" body={data.aiInsight.riskInsight} onClick={() => jumpFromInsightMiniCard('风险洞察')} />
                <InsightMiniCard title="优化建议" body={data.aiInsight.optimizationSuggestion} onClick={() => jumpFromInsightMiniCard('优化建议')} />
              </div>
          </div>

          <div className="analytics-divider mt-6" />

          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="panel-muted analytics-panel-accent rounded-[22px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                    AI Insight 自动分析
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">运营摘要</h2>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Live Summary
                </div>
              </div>
              <ul className="mt-4 space-y-3">
                {data.aiInsight.summary.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="analytics-bullet-button analytics-bullet-row"
                      onClick={() => handleInsightClick(item)}
                    >
                      <span className="analytics-bullet-index">0{index + 1}</span>
                      <span className="flex items-start justify-between gap-3">
                        <span className="text-left text-sm leading-7 text-[var(--text-muted)]">{item.text}</span>
                        <span className="analytics-bullet-cta">Jump</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel-muted rounded-[22px] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  Focus Metrics
                </p>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-dim)]">
                  Executive View
                </span>
              </div>
              <div className="mt-4 space-y-4">
                <MetricLine
                  label="Top 10 成本集中度"
                  value={`${data.rankingTabs.cost.slice(0, 10).reduce((sum, row) => sum + row.sharePct, 0).toFixed(1)}%`}
                  onClick={openTopCostDrilldown}
                  actionLabel={data.rankingTabs.cost[0] ? `查看 Top1 · ${data.rankingTabs.cost[0].user}` : '查看成本排行'}
                />
                <MetricLine
                  label="异常用户"
                  value={`${data.anomalies.length}`}
                  onClick={focusHighestRiskUser}
                  actionLabel={data.anomalies[0] ? `查看高风险用户 · ${data.anomalies[0].user}` : '去异常中心'}
                />
                <MetricLine
                  label="高风险信号"
                  value={`${data.anomalies.filter((item) => item.risk === 'high').length}`}
                  onClick={openHighestRiskSignal}
                  actionLabel="打开最值得关注的信号"
                />
                <MetricLine
                  label="重点模型"
                  value={data.modelPreference[0]?.name ?? '--'}
                  onClick={openTopModelFocus}
                  actionLabel={data.modelPreference[0]?.name ? `聚焦模型 · ${data.modelPreference[0].name}` : '查看模型分析'}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div id="analytics-kpis" className={sectionClassName('analytics-kpis', '')}>
        <div className="grid gap-4 md:grid-cols-5">
          {data.kpis.map((kpi) => (
            <DashboardSummaryCard
              key={kpi.title}
              className="min-h-[168px]"
              title={kpi.title}
              value={kpi.value}
              change={kpi.change}
              hint={kpi.hint}
              tone={kpi.tone}
              onClick={kpiSectionTargets[kpi.title] ? () => handleKpiJump(kpi.title) : undefined}
              actionLabel={kpiSectionTargets[kpi.title] ? '查看明细' : undefined}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
      <section
        id="analytics-ranking"
        className={sectionClassName('analytics-ranking', 'glass-panel xl:col-span-8 rounded-[26px] p-5 min-h-[560px]')}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">用户排行榜</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              切换不同维度，快速定位谁在消耗成本、谁请求最高、谁使用 Token 最多。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rankingTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRankingTab(tab.key)}
                className={`analytics-chip ${rankingTab === tab.key ? 'analytics-chip-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeModelFocus || activeAnomalyTypeFocus ? (
          <div className="analytics-context-strip mt-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {activeModelFocus ? <span className="analytics-context-badge">Model Focus</span> : null}
                {activeModelFocus ? <span className="text-sm font-semibold text-[var(--text)]">{activeModelFocus}</span> : null}
                {activeAnomalyTypeFocus ? <span className="analytics-context-badge">Anomaly Filter</span> : null}
                {activeAnomalyTypeFocus ? (
                  <span className="text-sm font-semibold text-[var(--text)]">{activeAnomalyTypeFocus}</span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                当前列表已按联动条件进行显式筛选：
                <span className="font-semibold text-[var(--text)]"> {linkedFilterSummary}</span>。
                排行只显示与当前分析上下文更相关的用户，方便你继续往下钻。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedUserProfile ? (
                <button type="button" className="analytics-chip" onClick={() => focusUserProfile(selectedUserProfile.userId)}>
                  查看当前画像
                </button>
              ) : null}
              <button type="button" className="analytics-chip" onClick={focusTopCostUser}>
                选择代表用户
              </button>
              <button type="button" className="analytics-chip" onClick={clearLinkedFilters}>
                清除联动筛选
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto custom-scrollbar">
          {rankingTab === 'cost' ? (
            <table className="analytics-table min-w-full">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>User</th>
                  <th>Cost</th>
                  <th>占总成本比例</th>
                  <th>环比变化</th>
                </tr>
              </thead>
              <tbody>
                {visibleRankingCostRows.map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>#{row.rank}</td>
                    <td>
                      <button
                      type="button"
                      className="analytics-link analytics-link-with-icon"
                      onClick={() => focusUserProfile(row.userId)}
                    >
                        {row.user}
                      </button>
                    </td>
                    <td>{formatMoney(row.cost)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span>{row.sharePct.toFixed(1)}%</span>
                        <div className="analytics-progress">
                          <span style={{ width: `${Math.min(100, row.sharePct)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={row.deltaPct >= 0 ? 'text-emerald-300' : 'text-amber-200'}>
                      {formatPercent(row.deltaPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {rankingTab === 'requests' ? (
            <table className="analytics-table min-w-full">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Requests</th>
                  <th>Growth</th>
                </tr>
              </thead>
              <tbody>
                {visibleRankingRequestRows.map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>
                      <button
                        type="button"
                        className="analytics-link analytics-link-with-icon"
                        onClick={() => focusUserProfile(row.userId)}
                      >
                        {row.user}
                      </button>
                    </td>
                    <td>{formatNumber(row.requests)}</td>
                    <td className="text-emerald-300">{formatPercent(row.growthPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {rankingTab === 'tokens' ? (
            <table className="analytics-table min-w-full">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Input Token</th>
                  <th>Output Token</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleRankingTokenRows.map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>
                      <button
                        type="button"
                        className="analytics-link analytics-link-with-icon"
                        onClick={() => focusUserProfile(row.userId)}
                      >
                        {row.user}
                      </button>
                    </td>
                    <td>{formatNumber(row.inputTokens)}</td>
                    <td>{formatNumber(row.outputTokens)}</td>
                    <td>{formatNumber(row.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>

      <section
        id="analytics-efficiency"
        className={sectionClassName('analytics-efficiency', 'glass-panel xl:col-span-4 rounded-[26px] p-5 min-h-[560px]')}
      >
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">成本效率分析</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">识别高成本低产出用户与高性价比用户。</p>
        </div>
          <div className="mt-5 space-y-3">
            {visibleEfficiencyRows.map((row) => (
              <button
                key={row.userId}
                type="button"
                className={`panel-muted analytics-row-card w-full rounded-2xl p-4 text-left transition hover:-translate-y-0.5 ${userRowClassName(row.userId)}`}
                onClick={() => focusUserProfile(row.userId)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="analytics-link analytics-link-with-icon text-left font-semibold">{row.user}</span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${efficiencyToneClass[row.status]}`}
                  >
                    {row.status === 'high' ? '高效' : row.status === 'normal' ? '正常' : '低效'}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MetricTile label="Cost / Request" value={formatMoney(row.costPerRequest)} />
                  <MetricTile label="Cost / 1K Token" value={formatMoney(row.costPer1kTokens)} />
                  <MetricTile label="Token / Dollar" value={formatNumber(row.tokensPerDollar)} />
                </div>
                <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
                  <span>查看画像</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </button>
            ))}
          </div>
      </section>

      <section
        id="analytics-growth"
        className={sectionClassName('analytics-growth', 'glass-panel xl:col-span-6 rounded-[26px] p-5 min-h-[632px]')}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">用户增长分析</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">关注本月较上月增长最快的用户与请求攀升账户。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {growthOptions.map((option) => (
              <button
                key={String(option)}
                type="button"
                onClick={() => setGrowthLimit(option)}
                className={`analytics-chip ${growthLimit === option ? 'analytics-chip-active' : ''}`}
              >
                {option === 'all' ? '全部用户' : `Top ${option}`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
              Cost Growth Ranking
            </p>
            <table className="analytics-table min-w-full">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Last Month Cost</th>
                  <th>Current Cost</th>
                  <th>Growth %</th>
                </tr>
              </thead>
              <tbody>
                {visibleGrowthCostRows.map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>
                      <button
                        type="button"
                        className="analytics-link analytics-link-with-icon"
                        onClick={() => focusUserProfile(row.userId)}
                      >
                        {row.user}
                      </button>
                    </td>
                    <td>{formatMoney(row.lastMonthCost)}</td>
                    <td>{formatMoney(row.currentCost)}</td>
                    <td className="text-emerald-300">{formatPercent(row.growthPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
              Request Growth Ranking
            </p>
            <table className="analytics-table min-w-full">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Growth %</th>
                </tr>
              </thead>
              <tbody>
                {visibleGrowthRequestRows.map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>
                      <button
                        type="button"
                        className="analytics-link analytics-link-with-icon"
                        onClick={() => focusUserProfile(row.userId)}
                      >
                        {row.user}
                      </button>
                    </td>
                    <td className="text-emerald-300">{formatPercent(row.growthPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        id="analytics-anomalies"
        className={sectionClassName('analytics-anomalies', 'glass-panel xl:col-span-6 rounded-[26px] p-5 min-h-[632px]')}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">异常检测中心</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              自动识别消费、请求、Token 和模型切换异常，帮助及时止损。
            </p>
          </div>
          <div className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
            Risk Radar
          </div>
        </div>

        {activeModelFocus || activeAnomalyTypeFocus ? (
          <div className="analytics-context-strip mt-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {activeModelFocus ? <span className="analytics-context-badge">Model Focus</span> : null}
                {activeModelFocus ? <span className="text-sm font-semibold text-[var(--text)]">{activeModelFocus}</span> : null}
                {activeAnomalyTypeFocus ? <span className="analytics-context-badge">Similar Anomalies</span> : null}
                {activeAnomalyTypeFocus ? (
                  <span className="text-sm font-semibold text-[var(--text)]">{activeAnomalyTypeFocus}</span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                {activeAnomalyTypeFocus ? (
                  <>
                    当前正在查看 <span className="font-semibold text-[var(--text)]">{activeAnomalyTypeFocus}</span> 同类异常，
                    {activeModelFocus ? (
                      <>
                        {' '}并保留 <span className="font-semibold text-[var(--text)]">{activeModelFocus}</span> 模型分析上下文。
                      </>
                    ) : null}
                    {' '}列表也会优先展示已关注和更相关的用户。
                  </>
                ) : (
                  <>
                    当前保留 <span className="font-semibold text-[var(--text)]">{activeModelFocus}</span> 模型焦点，
                    已命中的相关异常约 <span className="font-semibold text-[var(--primary)]">{activeModelWatchCount}</span> 条，
                    并已按相关性智能前排。
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeAnomalyTypeFocus ? (
                <button type="button" className="analytics-chip" onClick={() => setActiveAnomalyTypeFocus(null)}>
                  清除同类筛选
                </button>
              ) : null}
              {activeModelFocus ? (
                <button type="button" className="analytics-chip" onClick={() => handleSectionJump('analytics-model-preference')}>
                  返回模型分析
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

          <div className="mt-5 space-y-3">
          {visibleAnomalies.map((item) => (
            <div key={item.id} className="panel-muted analytics-risk-card rounded-[22px] px-5 py-4">
              <div className="analytics-risk-layout">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      className="analytics-link analytics-link-with-icon text-[0.95rem] font-semibold"
                      onClick={() => focusUserProfile(item.userId)}
                    >
                      {item.user}
                    </button>
                    <button
                      type="button"
                      className={`analytics-risk-type-pill transition hover:-translate-y-0.5 ${
                        activeAnomalyTypeFocus === item.type ? 'ring-1 ring-[rgba(77,142,255,0.32)]' : ''
                      }`}
                      onClick={() => openSimilarAnomalies(item.type)}
                    >
                      {item.type}
                    </button>
                    <span className={`rounded-full border px-2 py-[5px] text-[11px] font-semibold ${riskToneClass[item.risk]}`}>
                      {item.risk === 'high' ? 'High Risk' : item.risk === 'medium' ? 'Medium Risk' : 'Low Risk'}
                    </span>
                  </div>
                  <p className="mt-2.5 max-w-[52ch] text-[12.5px] leading-[1.75] text-[var(--text-muted)]">{item.detail}</p>
                  <button
                    type="button"
                    className="mt-3.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.05em] text-[var(--primary)] transition hover:translate-x-0.5"
                    onClick={() =>
                      setActiveRiskSignal(
                        buildRiskSignalDetail(`⚠ ${item.type} · ${item.detail}`, item.score, {
                          userId: item.userId,
                          userLabel: item.user,
                        }),
                      )
                    }
                  >
                    <span>查看信号详情</span>
                    <span aria-hidden="true">→</span>
                  </button>

                  <div className="analytics-risk-actions mt-3.5">
                    <button
                      type="button"
                      className="analytics-secondary-action"
                      onClick={() => focusUserProfile(item.userId)}
                    >
                      查看画像
                    </button>
                    <button
                      type="button"
                      className={`analytics-secondary-action ${activeAnomalyTypeFocus === item.type ? 'analytics-secondary-action-active' : ''}`}
                      onClick={() => openSimilarAnomalies(item.type)}
                    >
                      {activeAnomalyTypeFocus === item.type ? '已筛选同类异常' : '查看同类异常'}
                    </button>
                    <button
                      type="button"
                      className="analytics-chip"
                      onClick={clearLinkedFilters}
                    >
                      清除联动筛选
                    </button>
                  </div>
                </div>

                <div className="analytics-risk-stats">
                  <div className="analytics-risk-stat">
                    <p className="analytics-risk-stat-label">异常分数</p>
                    <p className="analytics-risk-stat-value">{item.score}</p>
                  </div>
                  <div className="analytics-risk-stat">
                    <p className="analytics-risk-stat-label">时间</p>
                    <p className="analytics-risk-stat-value analytics-risk-stat-time">{item.time}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <section
          id="analytics-heatmap"
          className={sectionClassName('analytics-heatmap', 'glass-panel xl:col-span-6 rounded-[26px] p-5 min-h-[420px]')}
        >
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">用户活跃热力图</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              按周一至周日、24 小时分布展示请求密度，用于识别深夜异常与自动化脚本行为。
              <span className="ml-2 text-[var(--primary)]">· 点击格子可锁定时段</span>
            </p>
          </div>
          {activeHeatmapFocus ? (
            <div className="analytics-context-strip mt-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="analytics-context-badge">
                    {activeHeatmapFocus.scope === 'platform' ? 'Platform Slot' : 'User Slot'}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text)]">{activeHeatmapLabel}</span>
                </div>
                <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                  当前时段命中约 <span className="font-semibold text-[var(--primary)]">{formatNumber(activeHeatmapFocus.value)}</span> 次请求，
                  {activeHeatmapFocus.hour <= 4
                    ? '属于深夜高敏感时段，建议结合异常中心继续复核。'
                    : '可继续结合增长、异常与当前画像判断是否存在集中调用。'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="analytics-chip" onClick={() => handleSectionJump('analytics-anomalies')}>
                  去异常中心
                </button>
                {selectedUserProfile ? (
                  <button type="button" className="analytics-chip" onClick={() => focusUserProfile(selectedUserProfile.userId)}>
                    查看当前画像
                  </button>
                ) : null}
                <button type="button" className="analytics-chip" onClick={() => setActiveHeatmapFocus(null)}>
                  清除时段焦点
                </button>
              </div>
            </div>
          ) : null}
          <HeatmapGrid cells={data.heatmap} onCellClick={(cell) => focusHeatmapCell(cell, 'platform')} />
        </section>

        <div
          id="analytics-model-preference"
          className={sectionClassName('analytics-model-preference', 'xl:col-span-6 grid gap-4 md:grid-cols-2')}
        >
          <EChartCard
            className="md:col-span-1"
            title="模型使用占比"
            subtitle={
              <span>
                支持全平台与单用户偏好对比
                <span className="ml-2 text-[var(--primary)]">· 点击扇区可跳到用户画像</span>
              </span>
            }
            option={platformModelOption}
            loading={loading}
            empty={data.modelPreference.length === 0}
            height={320}
            onChartClick={handleModelChartClick}
          />
          <EChartCard
            className="md:col-span-1"
            title="模型偏好对比"
            subtitle="Stacked Bar · 点击图表可聚焦当前分析用户"
            option={stackedPreferenceOption}
            loading={loading}
            empty={data.modelPreference.length === 0}
            height={320}
            onChartClick={handleModelChartClick}
          />
        </div>

        <section
          id="analytics-segments"
          className={sectionClassName('analytics-segments', 'glass-panel xl:col-span-6 rounded-[26px] p-5 min-h-[420px]')}
        >
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">用户分群分析</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              自动识别 Power User、Growing User、Risk User 等核心人群。
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.segments.map((segment) => (
              <button
                key={segment.label}
                type="button"
                className="panel-muted analytics-segment-card analytics-clickable-card rounded-2xl p-4 text-left"
                onClick={() => selectRepresentativeUserBySegment(segment.label)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">{segment.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">{segment.description}</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-300">{segment.trend}</span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">用户数量</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{segment.count}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">占比</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--primary)]">{segment.sharePct}%</p>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
                  <span>查看代表用户 / 相关模块</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section
        id="analytics-user-profile"
        className={sectionClassName(
          'analytics-user-profile',
          `glass-panel rounded-[26px] p-5 ${
            highlightedUserId && data.selectedUserProfile?.userId === highlightedUserId ? 'analytics-profile-focus' : ''
          }`,
        )}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">用户画像分析</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              点击排行榜中的任意用户查看基础指标、趋势变化、模型偏好与风险信号。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {data.selectedUserProfile ? (
              <>
                <button
                  type="button"
                  className="analytics-chip"
                  onClick={() => {
                    setRankingTab('cost');
                    handleSectionJump('analytics-ranking');
                  }}
                >
                  返回用户排行榜
                </button>
                  <button
                    type="button"
                    className="analytics-chip"
                    onClick={clearLinkedFilters}
                  >
                    清除联动筛选
                  </button>
                <button
                  type="button"
                  className={`analytics-chip ${isSelectedUserWatched ? 'analytics-chip-active' : ''}`}
                  onClick={() => {
                    if (!selectedUserProfile) return;
                    toggleWatchUser(selectedUserProfile.userId);
                  }}
                >
                  {isSelectedUserWatched ? '移出观察名单' : '加入观察名单'}
                </button>
                <button
                  type="button"
                  className="analytics-chip"
                  onClick={clearSelectedUserContext}
                >
                  清除选择
                </button>
              </>
            ) : null}
            {activeModelFocus ? (
              <div className="rounded-full border border-[rgba(77,142,255,0.18)] bg-[rgba(77,142,255,0.1)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                Model · {activeModelFocus}
              </div>
            ) : null}
            {isSelectedUserWatched ? (
              <div className="rounded-full border border-amber-300/18 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                Watchlist
              </div>
            ) : null}
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[var(--text-dim)]">
              {data.selectedUserProfile ? `Selected · ${data.selectedUserProfile.user}` : 'No User Selected'}
            </div>
          </div>
        </div>

        {selectedUserProfile ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-4">
              <div className="panel-muted analytics-panel-accent rounded-[22px] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                      Selected User
                    </p>
                    <button
                      type="button"
                      onClick={() => focusUserProfile(selectedUserProfile.userId)}
                      className="mt-2 inline-flex items-center gap-2 text-left text-2xl font-semibold tracking-[-0.03em] text-[var(--text)] transition hover:text-[var(--primary)]"
                    >
                      <span>{selectedUserProfile.user}</span>
                      <span className="text-sm font-semibold text-[var(--primary)]">回到画像 ↗</span>
                    </button>
                  </div>
                  <span className="rounded-full border border-[rgba(173,198,255,0.18)] bg-[rgba(77,142,255,0.1)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                    Live Profile
                  </span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <MetricTile label="总成本" value={formatMoney(selectedUserProfile.totalCost)} />
                  <MetricTile label="总请求数" value={formatNumber(selectedUserProfile.totalRequests)} />
                  <MetricTile label="总 Token" value={formatNumber(selectedUserProfile.totalTokens)} />
                  <MetricTile label="活跃天数" value={`${selectedUserProfile.activeDays}`} />
                </div>

                {activeModelFocus ? (
                  <div className="analytics-context-strip mt-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="analytics-context-badge">Model Focus</span>
                        <span className="text-sm font-semibold text-[var(--text)]">{activeModelFocus}</span>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                        当前画像正在围绕 <span className="font-semibold text-[var(--text)]">{activeModelFocus}</span> 做对照。
                        {selectedModelPreferenceValue !== null ? (
                          <>
                            {' '}该用户对该模型的估算值约为{' '}
                            <span className="font-semibold text-[var(--primary)]">{formatNumber(selectedModelPreferenceValue)}</span>。
                          </>
                        ) : (
                          <> 当前画像未明显命中该模型偏好，可切换其他用户继续比较。</>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="analytics-chip" onClick={() => handleSectionJump('analytics-model-preference')}>
                        返回模型分析
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="panel-muted rounded-[22px] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">风险信号</p>
                  <span className="rounded-full border border-amber-300/15 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                    Watchlist
                  </span>
                </div>
                <ul className="mt-4 space-y-3">
                  {selectedUserProfile.riskSignals.map((signal, index) => {
                    const anomalyTypeFromSignal = data.anomalies.find(
                      (item) =>
                        item.userId === selectedUserProfile.userId &&
                        (signal.includes(item.type) ||
                          signal.includes('成本增长') ||
                          signal.includes('请求量增长') ||
                          signal.includes('深夜')),
                    )?.type;
                    const detail = buildRiskSignalDetail(signal, index, {
                      userId: selectedUserProfile.userId,
                      userLabel: selectedUserProfile.user,
                    });
                    return (
                      <li
                        key={detail.id}
                        className={`analytics-clickable-card rounded-2xl border px-4 py-3 ${
                          activeModelFocus && signal.includes(activeModelFocus)
                            ? 'border-[rgba(77,142,255,0.24)] bg-[rgba(77,142,255,0.12)]'
                            : 'border-amber-300/15 bg-amber-500/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveRiskSignal(detail)}
                          className="w-full text-left text-sm text-amber-100 transition hover:-translate-y-0.5"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span>{signal}</span>
                            <span className="analytics-subtle-cta shrink-0">查看详情</span>
                          </span>
                        </button>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          {anomalyTypeFromSignal ? (
                            <button
                              type="button"
                              onClick={() => openSimilarAnomalies(anomalyTypeFromSignal)}
                              className="text-xs font-semibold text-[var(--primary)] transition hover:text-white"
                            >
                              查看同类异常
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleSectionJump('analytics-anomalies')}
                            className="text-xs font-semibold text-amber-200/90 transition hover:text-amber-100"
                          >
                            去异常中心查看同类问题 →
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="panel-muted rounded-[22px] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">活跃时间分布</p>
                <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                  点击某个时段后，我会保留这个时间焦点，方便你回到异常中心继续核查。
                </p>
                <HeatmapGrid
                  cells={selectedUserProfile.activityHeatmap}
                  compact
                  onCellClick={(cell) => focusHeatmapCell(cell, 'selected-user')}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <EChartCard
                title="成本趋势图"
                subtitle="最近 30 天"
                option={userSpendTrendOption}
                loading={loading}
                empty={!userSpendTrendOption}
                height={280}
              />
              <EChartCard
                title="请求趋势图"
                subtitle="最近 30 天"
                option={userRequestTrendOption}
                loading={loading}
                empty={!userRequestTrendOption}
                height={280}
              />
              <EChartCard
                className="md:col-span-2"
                title="模型偏好"
                subtitle="Donut Chart · 点击扇区继续聚焦模型上下文"
                option={{
                  tooltip: { trigger: 'item' },
                  legend: { bottom: 0, textStyle: { color: '#8c909f' } },
                  series: [
                    {
                      type: 'pie',
                      radius: ['48%', '70%'],
                      itemStyle: { borderColor: '#111827', borderWidth: 2 },
                      data: selectedUserProfile.modelPreference.map((item, index) => ({
                        name: item.name,
                        value: item.value,
                        itemStyle: {
                          color: ['#4d8eff', '#00c2ff', '#8b5cf6', '#00a572', '#64748b'][index] ?? '#64748b',
                        },
                      })),
                    },
                  ],
                }}
                loading={loading}
                empty={selectedUserProfile.modelPreference.length === 0}
                height={320}
                onChartClick={handleModelChartClick}
              />
            </div>
          </div>
        ) : (
          <div className="panel-muted analytics-panel-accent mt-5 rounded-[24px] px-5 py-8 md:px-7 md:py-10">
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <div className="rounded-full border border-[rgba(77,142,255,0.24)] bg-[rgba(77,142,255,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                Global View
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                当前处于全局视角，还没有锁定具体用户
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
                {activeModelFocus ? (
                  <>
                    你当前正从 <span className="font-semibold text-[var(--text)]">{activeModelFocus}</span> 模型视角往下钻取，
                    建议先选一个代表用户，我会保留这个模型焦点方便你继续对照查看。
                  </>
                ) : (
                  <>
                    你可以从排行榜、异常中心或增长模块中选择一个用户开始深挖；如果只是想先看全局，也可以继续浏览上面的平台级洞察。
                  </>
                )}
              </p>

              <div className="mt-6 grid w-full gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={focusTopCostUser}
                  className="panel-muted analytics-row-card rounded-2xl px-4 py-4 text-left transition hover:-translate-y-0.5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                    Quick Start
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text)]">查看成本最高用户</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">
                    从 Top Cost 用户切入，快速定位主要费用来源。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={focusHighestRiskUser}
                  className="panel-muted analytics-row-card rounded-2xl px-4 py-4 text-left transition hover:-translate-y-0.5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                    Risk First
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text)]">查看高风险用户</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">
                    优先检查异常分数最高或最新命中异常的账号。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={openGrowthLeaders}
                  className="panel-muted analytics-row-card rounded-2xl px-4 py-4 text-left transition hover:-translate-y-0.5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                    Growth Scan
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text)]">查看增长最快用户</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">
                    先跳到增长模块，筛出本月变化最大的账户。
                  </p>
                </button>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  className="analytics-chip"
                  onClick={() => {
                    setRankingTab('cost');
                    handleSectionJump('analytics-ranking');
                  }}
                >
                  去用户排行榜
                </button>
                <button
                  type="button"
                  className="analytics-chip"
                  onClick={() => handleSectionJump('analytics-anomalies')}
                >
                  去异常中心
                </button>
                <button
                  type="button"
                  className="analytics-chip"
                  onClick={openGrowthLeaders}
                >
                  去增长分析
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {activeRiskSignal ? (
          <RiskSignalDetailDrawer
            detail={activeRiskSignal}
            onClose={() => setActiveRiskSignal(null)}
            onViewProfile={
              activeRiskSignal.userId
                ? () => {
                    setActiveRiskSignal(null);
                    focusUserProfile(activeRiskSignal.userId!);
                  }
                : undefined
            }
          />
        ) : null}

        <aside className="analytics-floating-toc hidden xl:block" aria-label="Advanced analytics section navigation">
          <div className="analytics-toc">
            <div className="analytics-toc-card glass-panel rounded-[24px] p-4">
              <div className="px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  On this page
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  快速跳转核心分析模块，减少长页面滚动负担。
                </p>
              </div>

              {selectedUserProfile && selectedProfileRiskLevel ? (
                <>
                  <button
                    type="button"
                    onClick={() => focusUserProfile(selectedUserProfile.userId)}
                    className="panel-muted mt-4 flex w-full items-start justify-between gap-3 rounded-[20px] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[rgba(173,198,255,0.22)] hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(77,142,255,0.32)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                          Current User
                        </p>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${profileRiskToneClassMap[selectedProfileRiskLevel]}`}
                        >
                          {profileRiskLabelMap[selectedProfileRiskLevel]}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{selectedUserProfile.user}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[var(--text-dim)]">
                        <span>成本 {formatMoney(selectedUserProfile.totalCost)}</span>
                        <span>请求 {formatNumber(selectedUserProfile.totalRequests)}</span>
                      </div>
                    </div>
                    <span className="shrink-0 pt-1 text-xs font-semibold text-[var(--primary)]">回到画像 ↗</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedUserContext}
                    className="mt-2 w-full rounded-[18px] border border-white/8 bg-white/4 px-4 py-2.5 text-xs font-semibold text-[var(--text-dim)] transition hover:bg-white/8 hover:text-[var(--text)]"
                  >
                    清除选择 · 回到全局视角
                  </button>
                </>
              ) : null}

              <div className="mt-4 space-y-1.5">
                {analyticsSections.map((section, index) => {
                  const active = activeSectionId === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => handleSectionJump(section.id)}
                      className={`analytics-toc-item ${active ? 'analytics-toc-item-active' : ''}`}
                      title={section.description}
                    >
                      <span className="analytics-toc-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-left text-sm font-semibold text-[var(--text)]">
                          {section.label}
                        </span>
                        <span className="mt-1 block text-left text-[11px] leading-5 text-[var(--text-dim)]">
                          {section.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </>
  );
}

function RiskSignalDetailDrawer({
  detail,
  onClose,
  onViewProfile,
}: {
  detail: RiskSignalDetail;
  onClose: () => void;
  onViewProfile?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭风险信号详情"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="glass-panel custom-scrollbar absolute right-0 top-0 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--border-soft)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">Risk Signal Detail</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">{detail.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{detail.summary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel-muted rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">风险等级</p>
              <div className="mt-3">
                <span className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${signalDetailToneClass[detail.severity]}`}>
                  {detail.severity === 'high' ? '高风险' : detail.severity === 'medium' ? '中风险' : '低风险'}
                </span>
              </div>
            </div>
            <div className="panel-muted rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">处理建议</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{detail.recommendation}</p>
            </div>
          </div>

          <div className="panel-muted rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">信号说明</p>
            <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{detail.description}</p>
          </div>

          <div className="panel-muted rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">建议下一步</p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--text-muted)]">
              <li>• 对照当前用户画像中的成本趋势、请求趋势和模型偏好，确认风险是否持续。</li>
              <li>• 如果该信号近期重复出现，建议加入重点观察名单并提高预算告警灵敏度。</li>
              <li>• 如存在异常放量迹象，可进一步核查调用来源、密钥权限和定时任务配置。</li>
            </ul>
            {onViewProfile ? (
              <button type="button" onClick={onViewProfile} className="app-button-primary mt-5 w-full">
                查看该用户画像
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function InsightMiniCard({
  title,
  body,
  onClick,
}: {
  title: string;
  body: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="panel-muted analytics-soft-card w-full rounded-[20px] p-4 text-left transition hover:-translate-y-0.5 hover:border-[rgba(173,198,255,0.22)] hover:bg-white/6"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">{title}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
        <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
          <span>查看相关模块</span>
          <span aria-hidden="true">↗</span>
        </div>
      </button>
    );
  }

  return (
    <div className="panel-muted analytics-soft-card rounded-[20px] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
    </div>
  );
}

function MetricLine({
  label,
  value,
  onClick,
  actionLabel,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const content = (
    <>
      <div className="min-w-0">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        {actionLabel ? <p className="mt-1 text-[11px] font-semibold text-[var(--primary)]">{actionLabel}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)]">{value}</span>
        {onClick ? <span className="analytics-subtle-cta">查看</span> : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="analytics-inline-metric analytics-clickable-card flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-left"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="analytics-inline-metric flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-3">
      {content}
    </div>
  );
}

function MetricTile({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
      <div className={`analytics-metric-tile rounded-2xl border border-white/8 bg-white/4 ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">{label}</p>
      <p className={`mt-2 font-semibold text-[var(--text)] ${compact ? 'text-sm' : 'text-lg'}`}>{value}</p>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function HeatmapGrid({
  cells,
  compact = false,
  onCellClick,
}: {
  cells: Array<{ weekday: string; hour: number; value: number }>;
  compact?: boolean;
  onCellClick?: (cell: { weekday: string; hour: number; value: number }) => void;
}) {
  const max = Math.max(...cells.map((cell) => cell.value), 1);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, index) => index);

  return (
    <div className="mt-5 overflow-x-auto custom-scrollbar">
      <div className={`min-w-[720px] ${compact ? 'scale-[0.98] origin-top-left' : ''}`}>
        <div className="grid gap-2" style={{ gridTemplateColumns: '72px repeat(24, minmax(0, 1fr))' }}>
          <div />
          {hours.map((hour) => (
            <div key={hour} className="text-center text-[10px] font-semibold text-[var(--text-dim)]">
              {hour}
            </div>
          ))}
          {weekdays.map((weekday) => (
            <FragmentRow key={weekday} weekday={weekday} hours={hours} cells={cells} max={max} onCellClick={onCellClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  weekday,
  hours,
  cells,
  max,
  onCellClick,
}: {
  weekday: string;
  hours: number[];
  cells: Array<{ weekday: string; hour: number; value: number }>;
  max: number;
  onCellClick?: (cell: { weekday: string; hour: number; value: number }) => void;
}) {
  return (
    <>
      <div className="flex items-center text-[11px] font-semibold text-[var(--text-dim)]">{weekday}</div>
      {hours.map((hour) => {
        const cell = cells.find((item) => item.weekday === weekday && item.hour === hour) ?? {
          weekday,
          hour,
          value: 0,
        };
        const intensity = cell.value / max;
        const bg =
          intensity > 0.75
            ? 'rgba(0,194,255,0.95)'
            : intensity > 0.55
              ? 'rgba(77,142,255,0.82)'
              : intensity > 0.35
                ? 'rgba(0,165,114,0.72)'
                : intensity > 0.15
                  ? 'rgba(100,116,139,0.48)'
                  : 'rgba(30,41,59,0.55)';
        return (
          <button
            key={`${weekday}-${hour}`}
            type="button"
            title={`${weekday} ${hour}:00 · ${cell.value} requests`}
            className="analytics-heatmap-cell h-6 rounded-md border border-white/6 transition hover:scale-[1.04] hover:border-[rgba(173,198,255,0.4)]"
            style={{ background: bg }}
            onClick={() => onCellClick?.(cell)}
          />
        );
      })}
    </>
  );
}
