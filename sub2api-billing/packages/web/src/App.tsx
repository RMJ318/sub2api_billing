import { useEffect, useMemo, useState, type ChangeEvent, type JSX, type ReactNode } from 'react';
import type { EChartsOption } from 'echarts';
import { useQueryClient } from '@tanstack/react-query';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell.js';
import { BillingMonthSelector } from './components/BillingMonthSelector.js';
import { BudgetMonitorCard } from './components/BudgetMonitorCard.js';
import { DateRangeFilter } from './components/DateRangeFilter.js';
import { DashboardSummaryCard } from './components/DashboardSummaryCard.js';
import { EChartCard } from './components/EChartCard.js';
import { ExportButton } from './components/ExportButton.js';
import { KeyHealthCard } from './components/KeyHealthCard.js';
import { KeyRankingTable } from './components/KeyRankingTable.js';
import { SignalDrawer } from './components/SignalDrawer.js';
import { UserRankingTable } from './components/UserRankingTable.js';
import { useI18n } from './i18n.js';
import { importCsvFile } from './lib/api.js';
import { buildAdvancedAnalyticsData } from './lib/advancedAnalytics.js';
import { AdvancedAnalyticsPage } from './pages/AdvancedAnalyticsPage.js';
import { UserProfilePage } from './pages/UserProfilePage.js';
import {
  useCost,
  useDashboard,
  useHealth,
  useKeys,
  useKeyTrend,
  useMonths,
  useModels,
  useSignals,
  useUserTrend,
  useUsers,
} from './hooks/useBillingDashboard.js';

type WorkbenchTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface WorkbenchQueueItem {
  id: string;
  label: string;
  badge: string;
  tone: WorkbenchTone;
  detail: string;
  onClick: () => void;
}

interface WorkbenchActionItem {
  title: string;
  detail: string;
  onClick: () => void;
}

export function App(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [advancedAnalyticsGlobalView, setAdvancedAnalyticsGlobalView] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [keySearchTerm, setKeySearchTerm] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const userProfileMatch = matchPath('/advanced-analytics/users/:userId', location.pathname);
  const selectedRouteUserId = userProfileMatch?.params.userId ?? null;
  const isUserProfileRoute = Boolean(userProfileMatch);
  const activePath = isUserProfileRoute ? '/advanced-analytics' : location.pathname;

  const monthsQuery = useMonths();
  const months = useMemo(() => monthsQuery.data?.months ?? ['2026-05', '2026-04'], [monthsQuery.data]);
  const [billingMonth, setBillingMonth] = useState('');

  const previousBillingMonth = useMemo(() => {
    const currentIndex = months.indexOf(billingMonth);
    if (currentIndex < 0) return null;
    return months[currentIndex + 1] ?? null;
  }, [billingMonth, months]);

  const dashboardQuery = useDashboard(billingMonth || null);
  const previousDashboardQuery = useDashboard(previousBillingMonth);
  const usersQuery = useUsers(billingMonth || null);
  const previousUsersQuery = useUsers(previousBillingMonth);
  const userTrendQuery = useUserTrend(billingMonth || null, selectedUserId);
  const previousUserTrendQuery = useUserTrend(previousBillingMonth, selectedUserId);
  const keysQuery = useKeys(billingMonth || null);
  const keyTrendQuery = useKeyTrend(billingMonth || null, selectedKeyId);
  const modelsQuery = useModels(billingMonth || null);
  const previousModelsQuery = useModels(previousBillingMonth);
  const costQuery = useCost(billingMonth || null);
  const previousCostQuery = useCost(previousBillingMonth);
  const signalsQuery = useSignals(billingMonth || null);

  const dashboardData = dashboardQuery.data;
  const previousDashboardData = previousDashboardQuery.data;
  const usersData = usersQuery.data;
  const previousUsersData = previousUsersQuery.data;
  const userTrendData = userTrendQuery.data;
  const previousUserTrendData = previousUserTrendQuery.data;
  const keysData = keysQuery.data;
  const keyTrendData = keyTrendQuery.data;
  const modelsData = modelsQuery.data;
  const previousModelsData = previousModelsQuery.data;
  const costData = costQuery.data;
  const previousCostData = previousCostQuery.data;
  const signalsData = signalsQuery.data;
  const hasDashboardData = dashboardData !== undefined;

  const formatMoney = (value: string | number | undefined): string => {
    if (value === undefined) return t('status.unavailable');
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return t('status.unavailable');
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  };
  const formatCompactNumber = (value: number): string =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  const safeUsersData = useMemo(
    () => ({
      rankings: usersData?.rankings ?? [],
      budgetMonitor: usersData?.budgetMonitor ?? [],
      activityScatter: usersData?.activityScatter ?? [],
    }),
    [usersData],
  );
  const safeKeysData = useMemo(
    () => ({
      rankings: keysData?.rankings ?? [],
      keyHealth: keysData?.keyHealth ?? {
        longUnused: [],
        highFrequency: [],
        abnormalGrowth: [],
      },
    }),
    [keysData],
  );
  const safeModelsData = useMemo(
    () => ({
      spendRanking: modelsData?.spendRanking ?? [],
      tokenStacks: modelsData?.tokenStacks ?? [],
    }),
    [modelsData],
  );
  const safeCostData = useMemo(
    () => ({
      trend: costData?.trend ?? { daily: [], weekly: [], monthly: [] },
      pareto: costData?.pareto ?? { top10: 0, top20: 0, top30: 0 },
      forecast:
        costData?.forecast ?? {
          kind: 'insufficient_data',
          reason: t('misc.noData'),
        },
      treemap: costData?.treemap ?? [],
    }),
    [costData, t],
  );
  const safeUserTrendData = useMemo(
    () => ({
      spend: userTrendData?.spend ?? [],
      requests: userTrendData?.requests ?? [],
    }),
    [userTrendData],
  );
  const safeKeyTrendData = useMemo(
    () => ({
      spend: keyTrendData?.spend ?? [],
      requests: keyTrendData?.requests ?? [],
    }),
    [keyTrendData],
  );
  const overviewAnalytics = useMemo(
    () =>
      buildAdvancedAnalyticsData({
        billingMonth: billingMonth || months[0] || 'current',
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
      months,
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
  const overviewKpis = overviewAnalytics.kpis.slice(0, 4);
  const overviewInsightItems = overviewAnalytics.aiInsight.summary.slice(0, 3);
  const overviewInsightStripItems = useMemo(
    () =>
      overviewInsightItems.map((item, index) => ({
        ...item,
        tone:
          item.targetSection === 'analytics-anomalies'
            ? ('danger' as const)
            : item.targetSection === 'analytics-growth'
              ? ('warning' as const)
              : index === 0
                ? ('primary' as const)
                : ('success' as const),
      })),
    [overviewInsightItems],
  );
  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const openUserProfilePage = (userId: string) => {
    setAdvancedAnalyticsGlobalView(false);
    setSelectedUserId(userId);
    navigate(`/advanced-analytics/users/${encodeURIComponent(userId)}`);
  };

  const openAdvancedAnalyticsOverview = () => {
    setAdvancedAnalyticsGlobalView(true);
    setSelectedUserId(null);
    navigate('/advanced-analytics');
  };

  const openDashboardOverview = () => {
    navigate('/');
  };

  const openAdvancedAnalyticsSection = (
    sectionId:
      | 'analytics-overview'
      | 'analytics-kpis'
      | 'analytics-ranking'
      | 'analytics-efficiency'
      | 'analytics-growth'
      | 'analytics-anomalies'
      | 'analytics-heatmap'
      | 'analytics-model-preference'
      | 'analytics-segments'
      | 'analytics-user-profile',
  ) => {
    setAdvancedAnalyticsGlobalView(true);
    setSelectedUserId(null);
    navigate(`/advanced-analytics#${sectionId}`);
  };

  const openUserWorkbench = (userId: string) => {
    setSelectedUserId(userId);
    navigate('/users');
  };

  const openKeyWorkbench = (apiKeyId: string) => {
    setSelectedKeyId(apiKeyId);
    navigate('/keys');
  };

  const openModelWorkbench = (modelName: string) => {
    setSelectedModelName(modelName);
    navigate('/models');
  };

  const handleAdvancedAnalyticsSelectUser = (userId: string | null) => {
    if (userId) {
      setAdvancedAnalyticsGlobalView(false);
      setSelectedUserId(userId);
      return;
    }

    setAdvancedAnalyticsGlobalView(true);
    setSelectedUserId(null);
  };

  const topRiskAnomaly = overviewAnalytics.anomalies[0] ?? null;
  const topGrowthUser = overviewAnalytics.growth.cost[0] ?? null;
  const topSpendUser = overviewAnalytics.rankingTabs.cost[0] ?? null;
  const leadingModelPreference = [...overviewAnalytics.modelPreference].sort((a, b) => b.value - a.value)[0] ?? null;
  const overviewAlertChips = useMemo(
    () => [
      {
        id: 'risk-users',
        label: '高风险用户',
        value: `${overviewAnalytics.anomalies.length} 位`,
        tone: 'danger' as const,
        onClick: () => openAdvancedAnalyticsSection('analytics-anomalies'),
      },
      {
        id: 'growth-users',
        label: '增长异常',
        value: `${overviewAnalytics.growth.cost.length} 位`,
        tone: 'warning' as const,
        onClick: () => openAdvancedAnalyticsSection('analytics-growth'),
      },
      {
        id: 'model-focus',
        label: '模型集中度',
        value: leadingModelPreference ? `${leadingModelPreference.name} ${leadingModelPreference.value.toFixed(1)}%` : '待观察',
        tone: 'primary' as const,
        onClick: () => openAdvancedAnalyticsSection('analytics-model-preference'),
      },
      {
        id: 'signal-unread',
        label: '未读信号',
        value: `${signalsData?.unreadCount ?? 0} 条`,
        tone: 'neutral' as const,
        onClick: () => setDrawerOpen(true),
      },
    ],
    [
      leadingModelPreference,
      overviewAnalytics.anomalies.length,
      overviewAnalytics.growth.cost.length,
      signalsData?.unreadCount,
    ],
  );
  const overviewPrimaryTitle = topRiskAnomaly
    ? `${topRiskAnomaly.user} 需要优先关注`
    : topGrowthUser
      ? `${topGrowthUser.user} 是本月增长焦点`
      : '本月总览重点';
  const overviewPrimaryDescription = topRiskAnomaly
    ? `${topRiskAnomaly.detail} 当前风险评分 ${topRiskAnomaly.score}，建议优先确认是否由异常增长、深夜活跃或模型切换引起。`
    : topGrowthUser
      ? `${topGrowthUser.user} 的成本环比 ${topGrowthUser.growthPct >= 0 ? '+' : ''}${topGrowthUser.growthPct.toFixed(1)}%，适合先确认是否属于预期业务扩张。`
      : '首页会优先汇总最值得关注的成本变化、增长信号和结构性风险，帮助你快速决定下一步要排查什么。';
  const overviewActionItems = useMemo(
    () => [
      {
        id: 'action-risk',
        title: topRiskAnomaly ? `优先排查 ${topRiskAnomaly.user}` : '查看风险用户',
        detail: topRiskAnomaly
          ? `${topRiskAnomaly.type} · 评分 ${topRiskAnomaly.score} · 建议先进入用户画像定位异常原因`
          : '进入高级分析查看本月最高优先级风险用户与异常信号',
        onClick: topRiskAnomaly
          ? () => openUserProfilePage(topRiskAnomaly.userId)
          : () => openAdvancedAnalyticsSection('analytics-anomalies'),
      },
      {
        id: 'action-signal',
        title: '检查未读信号',
        detail: `${signalsData?.unreadCount ?? 0} 条待处理信号，适合快速扫读预算、异常增长和模型波动`,
        onClick: () => setDrawerOpen(true),
      },
      {
        id: 'action-growth',
        title: topGrowthUser ? `复核 ${topGrowthUser.user} 的增长来源` : '查看增长驱动',
        detail: topGrowthUser
          ? `成本环比 ${topGrowthUser.growthPct >= 0 ? '+' : ''}${topGrowthUser.growthPct.toFixed(1)}%，确认是否为健康增长或异常放量`
          : '进入高级分析查看增长最快用户以及请求 / Token 放量原因',
        onClick: topGrowthUser
          ? () => openUserProfilePage(topGrowthUser.userId)
          : () => openAdvancedAnalyticsSection('analytics-growth'),
      },
    ],
    [signalsData?.unreadCount, topGrowthUser, topRiskAnomaly],
  );
  const priorityUserGroups = useMemo(
    () => [
      {
        id: 'risk',
        title: '高风险用户',
        emptyText: '当前没有需要优先处理的高风险用户。',
        items: topRiskAnomaly
          ? [
              {
                id: `risk-${topRiskAnomaly.id}`,
                userId: topRiskAnomaly.userId,
                user: topRiskAnomaly.user,
                badge: '风险',
                tone: 'danger' as const,
                summary: `${topRiskAnomaly.type} · 风险评分 ${topRiskAnomaly.score}`,
                detail: topRiskAnomaly.detail,
              },
            ]
          : [],
      },
      {
        id: 'growth',
        title: '增长最快用户',
        emptyText: '当前没有明显增长异常用户。',
        items: topGrowthUser
          ? [
              {
                id: `growth-${topGrowthUser.userId}`,
                userId: topGrowthUser.userId,
                user: topGrowthUser.user,
                badge: '增长',
                tone: 'warning' as const,
                summary: `成本环比 ${topGrowthUser.growthPct >= 0 ? '+' : ''}${topGrowthUser.growthPct.toFixed(1)}%`,
                detail: `本月成本 ${formatMoney(topGrowthUser.currentCost)}，建议确认增长是否符合业务预期。`,
              },
            ]
          : [],
      },
      {
        id: 'spend',
        title: '高消耗用户',
        emptyText: '当前没有需要重点关注的高消耗用户。',
        items: topSpendUser
          ? [
              {
                id: `spend-${topSpendUser.userId}`,
                userId: topSpendUser.userId,
                user: topSpendUser.user,
                badge: '成本',
                tone: 'primary' as const,
                summary: `成本占比 ${topSpendUser.sharePct.toFixed(1)}%`,
                detail: `本月累计成本 ${formatMoney(topSpendUser.cost)}，适合优先审查模型与预算配置。`,
              },
            ]
          : [],
      },
    ],
    [formatMoney, topGrowthUser, topRiskAnomaly, topSpendUser],
  );
  const priorityUserCount = priorityUserGroups.reduce((sum, group) => sum + group.items.length, 0);

  const dateRangeValidationMessage = useMemo(() => {
    if (dateStart && dateEnd && dateStart > dateEnd) {
      return '开始日期不能晚于结束日期。';
    }
    return null;
  }, [dateEnd, dateStart]);

  const filterTrendPoints = (
    points: Array<{ bucket: string; value: string }>,
  ): Array<{ bucket: string; value: string }> => {
    if (dateRangeValidationMessage) return [];
    return points.filter((point) => {
      if (dateStart && point.bucket < dateStart) return false;
      if (dateEnd && point.bucket > dateEnd) return false;
      return true;
    });
  };

  const filteredUserRankings = useMemo(() => {
    const needle = userSearchTerm.trim().toLowerCase();
    if (!needle) return safeUsersData.rankings;
    return safeUsersData.rankings.filter((row) => row.label.toLowerCase().includes(needle));
  }, [safeUsersData.rankings, userSearchTerm]);

  const filteredKeyRankings = useMemo(() => {
    const needle = keySearchTerm.trim().toLowerCase();
    if (!needle) return safeKeysData.rankings;
    return safeKeysData.rankings.filter((row) =>
      `${row.apiKeyName ?? ''} ${row.ownerLabel}`.toLowerCase().includes(needle),
    );
  }, [keySearchTerm, safeKeysData.rankings]);

  const selectedUserRanking = useMemo(
    () => filteredUserRankings.find((row) => row.userId === selectedUserId) ?? filteredUserRankings[0] ?? null,
    [filteredUserRankings, selectedUserId],
  );
  const selectedUserBudgetRow = useMemo(
    () => safeUsersData.budgetMonitor.find((row) => row.userId === selectedUserRanking?.userId) ?? null,
    [safeUsersData.budgetMonitor, selectedUserRanking?.userId],
  );
  const selectedUserGrowthRow = useMemo(
    () => overviewAnalytics.growth.cost.find((row) => row.userId === selectedUserRanking?.userId) ?? null,
    [overviewAnalytics.growth.cost, selectedUserRanking?.userId],
  );
  const selectedUserAnomalies = useMemo(
    () => overviewAnalytics.anomalies.filter((row) => row.userId === selectedUserRanking?.userId),
    [overviewAnalytics.anomalies, selectedUserRanking?.userId],
  );
  const budgetPriorityUsers = useMemo(
    () => safeUsersData.budgetMonitor.filter((row) => row.style !== 'normal').slice(0, 4),
    [safeUsersData.budgetMonitor],
  );

  const selectedKeyRow = useMemo(
    () => filteredKeyRankings.find((row) => row.apiKeyId === selectedKeyId) ?? filteredKeyRankings[0] ?? null,
    [filteredKeyRankings, selectedKeyId],
  );
  const selectedKeyOwnerUser = useMemo(
    () => safeUsersData.rankings.find((row) => row.label === selectedKeyRow?.ownerLabel) ?? null,
    [safeUsersData.rankings, selectedKeyRow?.ownerLabel],
  );
  const governanceKeyQueue = useMemo(
    () =>
      filteredKeyRankings.slice(0, 6).map((row, index) => ({
        id: row.apiKeyId,
        label: row.apiKeyName || row.apiKeyId,
        badge: row.deleted ? '已删除' : index < 2 ? '高成本' : row.requestCount > 800 ? '高频' : '待核验',
        tone: (row.deleted ? 'danger' : index < 2 ? 'warning' : 'primary') as WorkbenchTone,
        detail: `归属 ${row.ownerLabel} · ${formatMoney(row.spend)} · ${row.requestCount.toLocaleString()} 次请求`,
        onClick: () => openKeyWorkbench(row.apiKeyId),
      })),
    [filteredKeyRankings, formatMoney],
  );

  const totalModelSpend = useMemo(
    () => safeModelsData.spendRanking.reduce((sum, row) => sum + Number(row.spend || 0), 0),
    [safeModelsData.spendRanking],
  );
  const selectedModelSpendRow = useMemo(
    () =>
      safeModelsData.spendRanking.find((row) => row.model === selectedModelName) ??
      safeModelsData.spendRanking[0] ??
      null,
    [safeModelsData.spendRanking, selectedModelName],
  );
  const selectedModelTokenRow = useMemo(
    () => safeModelsData.tokenStacks.find((row) => row.model === selectedModelSpendRow?.model) ?? null,
    [safeModelsData.tokenStacks, selectedModelSpendRow?.model],
  );
  const selectedModelRequestRow = useMemo(
    () => modelsData?.requestRanking.find((row) => row.model === selectedModelSpendRow?.model) ?? null,
    [modelsData?.requestRanking, selectedModelSpendRow?.model],
  );
  const selectedModelSharePct = selectedModelSpendRow
    ? (Number(selectedModelSpendRow.spend || 0) / Math.max(totalModelSpend, 1)) * 100
    : 0;
  const selectedModelTokenTotal = selectedModelTokenRow
    ? selectedModelTokenRow.inputTokens + selectedModelTokenRow.outputTokens + selectedModelTokenRow.cacheReadTokens
    : 0;
  const selectedModelAnomalyCount = useMemo(() => {
    if (!selectedModelSpendRow) return 0;
    return overviewAnalytics.anomalies.filter(
      (row) => row.type === '模型切换异常' || row.detail.toLowerCase().includes(selectedModelSpendRow.model.toLowerCase()),
    ).length;
  }, [overviewAnalytics.anomalies, selectedModelSpendRow]);
  const modelStrategyQueue = useMemo(
    () =>
      safeModelsData.spendRanking.slice(0, 6).map((row, index) => {
        const tokenRow = safeModelsData.tokenStacks.find((item) => item.model === row.model);
        const requestRow = modelsData?.requestRanking.find((item) => item.model === row.model);
        const tokenTotal = tokenRow
          ? tokenRow.inputTokens + tokenRow.outputTokens + tokenRow.cacheReadTokens
          : 0;
        const sharePct = (Number(row.spend || 0) / Math.max(totalModelSpend, 1)) * 100;
        return {
          id: row.model,
          label: row.model,
          badge: index === 0 ? '主力模型' : sharePct >= 18 ? '高集中度' : '观察中',
          tone: (index === 0 ? 'primary' : sharePct >= 18 ? 'warning' : 'neutral') as WorkbenchTone,
          detail: `${formatMoney(row.spend)} · ${requestRow?.requestCount.toLocaleString() ?? 0} 次请求 · ${tokenTotal > 0 ? `${formatCompactNumber(tokenTotal)} Tokens` : 'Token 数据待补充'}`,
          onClick: () => openModelWorkbench(row.model),
        };
      }),
    [formatCompactNumber, formatMoney, modelsData?.requestRanking, safeModelsData.spendRanking, safeModelsData.tokenStacks, totalModelSpend],
  );

  const costPriorityQueue = useMemo(
    () =>
      [
        topSpendUser
          ? {
              id: `cost-${topSpendUser.userId}`,
              label: topSpendUser.user,
              badge: '高成本',
              tone: 'warning' as WorkbenchTone,
              detail: `${formatMoney(topSpendUser.cost)} · 成本占比 ${topSpendUser.sharePct.toFixed(1)}%`,
              onClick: () => openUserWorkbench(topSpendUser.userId),
            }
          : null,
        topGrowthUser
          ? {
              id: `growth-${topGrowthUser.userId}`,
              label: topGrowthUser.user,
              badge: '增长异常',
              tone: 'danger' as WorkbenchTone,
              detail: `成本环比 ${topGrowthUser.growthPct >= 0 ? '+' : ''}${topGrowthUser.growthPct.toFixed(1)}%`,
              onClick: () => openAdvancedAnalyticsSection('analytics-growth'),
            }
          : null,
        leadingModelPreference
          ? {
              id: `model-${leadingModelPreference.name}`,
              label: leadingModelPreference.name,
              badge: '模型集中',
              tone: 'primary' as WorkbenchTone,
              detail: `模型占比 ${leadingModelPreference.value.toFixed(1)}%`,
              onClick: () => openAdvancedAnalyticsSection('analytics-model-preference'),
            }
          : null,
        topRiskAnomaly
          ? {
              id: `risk-${topRiskAnomaly.id}`,
              label: topRiskAnomaly.user,
              badge: '高风险',
              tone: 'danger' as WorkbenchTone,
              detail: `${topRiskAnomaly.type} · 评分 ${topRiskAnomaly.score}`,
              onClick: () => openUserWorkbench(topRiskAnomaly.userId),
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null),
    [formatMoney, leadingModelPreference, topGrowthUser, topRiskAnomaly, topSpendUser],
  );

  const exportPageName =
    activePath === '/'
      ? 'dashboard'
      : activePath === '/advanced-analytics'
        ? 'advanced-analytics'
        : activePath === '/users'
          ? 'users'
          : activePath === '/models'
            ? 'models'
            : activePath === '/keys'
              ? 'keys'
              : activePath === '/cost'
                ? 'cost'
                : 'dashboard';

  const pageMetaByPath: Record<string, { eyebrow: string; title: string; description: string }> = {
    '/': { eyebrow: t('page.usageAnalytics'), title: t('page.usageAnalytics'), description: t('page.description') },
    '/advanced-analytics': {
      eyebrow: '高级分析',
      title: '高级分析',
      description: '深度分析用户 API 使用行为、成本结构、增长趋势与异常风险。',
    },
    '/advanced-analytics/users/:userId': {
      eyebrow: '用户画像',
      title: '用户画像',
      description: '聚焦单个用户的成本、请求、模型偏好和风险信号。',
    },
    '/users': {
      eyebrow: '专项工作台',
      title: '用户工作台',
      description: '围绕高风险、增长异常与预算压力，快速决定先处理哪个用户。',
    },
    '/keys': {
      eyebrow: '专项工作台',
      title: '密钥治理台',
      description: '把异常增长、高频调用和长期未用 Key 收敛到同一个治理入口。',
    },
    '/models': {
      eyebrow: '专项工作台',
      title: '模型策略台',
      description: '聚焦模型集中度、成本结构和异常切换，支撑策略判断与迁移动作。',
    },
    '/cost': {
      eyebrow: '专项工作台',
      title: '成本处置台',
      description: '围绕预算压力、结构热点和优先处置对象，帮助你更快决定先从哪里降本。',
    },
  };
  const pageMeta = pageMetaByPath[isUserProfileRoute ? '/advanced-analytics/users/:userId' : activePath] ?? pageMetaByPath['/']!;
  const pageHeadingTitle =
    activePath === '/' && !isUserProfileRoute
      ? billingMonth
        ? t('page.billingOverview', { month: billingMonth })
        : pageMeta.title
      : pageMeta.title;

  const formatKpiDelta = (deltaPct: number): string => {
    const arrow = deltaPct >= 0 ? '↑' : '↓';
    return `${arrow} ${Math.abs(deltaPct).toFixed(1)}% ${t('kpi.comparedLastMonth')}`;
  };

  const clearFilters = () => {
    setBillingMonth(months[0] ?? '');
    setDateStart('');
    setDateEnd('');
    setUserSearchTerm('');
    setKeySearchTerm('');
  };

  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0 || !billingMonth) return;

    setImporting(true);
    setImportMessage(null);
    try {
      const results = [];
      for (const file of files) {
        const csvText = await file.text();
        const result = await importCsvFile({
          billingMonth,
          fileName: file.name,
          csvText,
        });
        results.push(result);
      }
      await queryClient.invalidateQueries();
      const loaded = results.reduce((sum, result) => sum + result.recordsLoaded, 0);
      const rejected = results.reduce((sum, result) => sum + result.rowsRejected, 0);
      setImportMessage(
        rejected > 0
          ? `${t('import.success', { count: results.length, records: loaded })} ${rejected} 行被拒绝。`
          : t('import.success', { count: results.length, records: loaded }),
      );
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : t('import.error'));
    } finally {
      event.target.value = '';
      setImporting(false);
    }
  };

  useEffect(() => {
    if ((!billingMonth || !months.includes(billingMonth)) && months.length > 0) {
      setBillingMonth(months[0]!);
    }
  }, [billingMonth, months]);

  useEffect(() => {
    if (selectedRouteUserId) {
      setSelectedUserId(selectedRouteUserId);
      return;
    }

    if (filteredUserRankings.length && !selectedUserId && (activePath !== '/advanced-analytics' || !advancedAnalyticsGlobalView)) {
      setSelectedUserId(filteredUserRankings[0]!.userId);
    }
  }, [activePath, advancedAnalyticsGlobalView, filteredUserRankings, selectedRouteUserId, selectedUserId]);

  useEffect(() => {
    if (filteredKeyRankings.length && !selectedKeyId) {
      setSelectedKeyId(filteredKeyRankings[0]!.apiKeyId);
    }
  }, [filteredKeyRankings, selectedKeyId]);

  const spendTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) return undefined;
    const spendPoints = filterTrendPoints(dashboardData.dailyTrends.spend);
    const requestPoints = filterTrendPoints(dashboardData.dailyTrends.requests);
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: [t('kpi.totalSpend'), t('kpi.totalRequests')], textStyle: { color: '#64748b' } },
      grid: { left: 36, right: 20, top: 42, bottom: 30 },
      xAxis: { type: 'category', boundaryGap: false, data: spendPoints.map((point) => point.bucket) },
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [
        { name: t('kpi.totalSpend'), type: 'line', smooth: true, data: spendPoints.map((point) => Number(point.value)) },
        { name: t('kpi.totalRequests'), type: 'line', yAxisIndex: 1, smooth: true, data: requestPoints.map((point) => Number(point.value)) },
      ],
    };
  }, [dashboardData, dateEnd, dateRangeValidationMessage, dateStart, t]);

  const topUsersOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) return undefined;
    const topUsers = [...dashboardData.topUserSpend].slice(0, 8).reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 120, right: 24, top: 16, bottom: 16 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: topUsers.map((item) => item.label) },
      series: [{ type: 'bar', data: topUsers.map((item) => Number(item.spend)) }],
    };
  }, [dashboardData]);

  const modelShareOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) return undefined;
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#64748b' } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          label: { color: '#8c909f', fontSize: 12 },
          labelLine: { lineStyle: { color: '#64748b', opacity: 0.8 } },
          itemStyle: { borderColor: '#1e293b', borderWidth: 2 },
          data: [
            { name: 'GPT', value: Number(dashboardData.modelFamilyShare.GPT) },
            { name: 'Claude', value: Number(dashboardData.modelFamilyShare.Claude) },
            { name: 'Gemini', value: Number(dashboardData.modelFamilyShare.Gemini) },
            { name: 'Other', value: Number(dashboardData.modelFamilyShare.Other) },
          ],
        },
      ],
    };
  }, [dashboardData]);

  const costCompositionOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) return undefined;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, textStyle: { color: '#64748b' } },
      xAxis: { type: 'category', data: ['Cost Mix'] },
      yAxis: { type: 'value' },
      series: [
        { name: t('cost.input'), type: 'bar', stack: 'cost', data: [Number(dashboardData.costComposition.input)] },
        { name: t('cost.output'), type: 'bar', stack: 'cost', data: [Number(dashboardData.costComposition.output)] },
        { name: t('cost.cacheCreate'), type: 'bar', stack: 'cost', data: [Number(dashboardData.costComposition.cacheCreation)] },
        { name: t('cost.cacheRead'), type: 'bar', stack: 'cost', data: [Number(dashboardData.costComposition.cacheRead)] },
        { name: t('cost.image'), type: 'bar', stack: 'cost', data: [Number(dashboardData.costComposition.imageOutput)] },
      ],
    };
  }, [dashboardData, t]);

  const userScatterOption = useMemo<EChartsOption | undefined>(() => {
    if (!usersData) return undefined;
    return {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: t('kpi.totalRequests') },
      yAxis: { type: 'value', name: t('kpi.totalSpend') },
      series: [{ type: 'scatter', data: safeUsersData.activityScatter.map((point) => [point.x, point.y, point.size, point.label]) }],
    };
  }, [safeUsersData.activityScatter, t, usersData]);

  const userTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!userTrendData) return undefined;
    const spendPoints = filterTrendPoints(safeUserTrendData.spend);
    const requestPoints = filterTrendPoints(safeUserTrendData.requests);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      xAxis: { type: 'category', boundaryGap: false, data: spendPoints.map((item) => item.bucket) },
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [
        { name: t('kpi.totalSpend'), type: 'line', smooth: true, data: spendPoints.map((item) => Number(item.value)) },
        { name: t('kpi.totalRequests'), type: 'line', yAxisIndex: 1, smooth: true, data: requestPoints.map((item) => Number(item.value)) },
      ],
    };
  }, [dateEnd, dateRangeValidationMessage, dateStart, safeUserTrendData.requests, safeUserTrendData.spend, t, userTrendData]);

  const keyTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!keyTrendData) return undefined;
    const spendPoints = filterTrendPoints(safeKeyTrendData.spend);
    const requestPoints = filterTrendPoints(safeKeyTrendData.requests);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      xAxis: { type: 'category', boundaryGap: false, data: spendPoints.map((item) => item.bucket) },
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [
        { name: t('kpi.totalSpend'), type: 'line', smooth: true, data: spendPoints.map((item) => Number(item.value)) },
        { name: t('kpi.totalRequests'), type: 'line', yAxisIndex: 1, smooth: true, data: requestPoints.map((item) => Number(item.value)) },
      ],
    };
  }, [dateEnd, dateRangeValidationMessage, dateStart, keyTrendData, safeKeyTrendData.requests, safeKeyTrendData.spend, t]);

  const modelSpendOption = useMemo<EChartsOption | undefined>(() => {
    if (!modelsData) return undefined;
    const topModels = safeModelsData.spendRanking.slice(0, 8);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: topModels.map((item) => item.model), axisLabel: { rotate: 20 } },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: topModels.map((item) => Number(item.spend)) }],
    };
  }, [modelsData, safeModelsData.spendRanking]);

  const modelTokensOption = useMemo<EChartsOption | undefined>(() => {
    if (!modelsData) return undefined;
    const rows = safeModelsData.tokenStacks.slice(0, 6);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      xAxis: { type: 'category', data: rows.map((item) => item.model), axisLabel: { rotate: 20 } },
      yAxis: { type: 'value' },
      series: [
        { name: t('cost.input'), type: 'bar', stack: 'tokens', data: rows.map((item) => item.inputTokens) },
        { name: t('cost.output'), type: 'bar', stack: 'tokens', data: rows.map((item) => item.outputTokens) },
        { name: t('cost.cacheRead'), type: 'bar', stack: 'tokens', data: rows.map((item) => item.cacheReadTokens) },
      ],
    };
  }, [modelsData, safeModelsData.tokenStacks, t]);

  const costTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!costData) return undefined;
    const spendPoints = filterTrendPoints(safeCostData.trend.daily);
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', boundaryGap: false, data: spendPoints.map((item) => item.bucket) },
      yAxis: { type: 'value' },
      series: [{ name: t('chart.costTrend'), type: 'line', smooth: true, data: spendPoints.map((item) => Number(item.value)) }],
    };
  }, [costData, dateEnd, dateRangeValidationMessage, dateStart, safeCostData.trend.daily, t]);

  const paretoOption = useMemo<EChartsOption | undefined>(() => {
    if (!costData) return undefined;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: ['Top 10%', 'Top 20%', 'Top 30%'] },
      yAxis: { type: 'value', max: 100 },
      series: [{ type: 'bar', data: [safeCostData.pareto.top10, safeCostData.pareto.top20, safeCostData.pareto.top30] }],
    };
  }, [costData, safeCostData.pareto.top10, safeCostData.pareto.top20, safeCostData.pareto.top30]);

  const costTreemapOption = useMemo<EChartsOption | undefined>(() => {
    if (!costData) return undefined;
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'treemap',
          roam: true,
          nodeClick: 'zoomToNode',
          breadcrumb: { show: true },
          data: safeCostData.treemap.map((userNode) => ({
            ...userNode,
            value: Number(userNode.value ?? '0'),
            children: userNode.children?.map((modelNode) => ({
              ...modelNode,
              value: Number(modelNode.value ?? '0'),
              children: modelNode.children?.map((keyNode) => ({
                ...keyNode,
                value: Number(keyNode.value ?? '0'),
              })),
            })),
          })),
        },
      ],
    };
  }, [costData, safeCostData.treemap]);

  const workbenchContextMap: Record<
    '/users' | '/keys' | '/models' | '/cost',
    { source: string; context: string; targetSection: Parameters<typeof openAdvancedAnalyticsSection>[0]; actionLabel: string }
  > = {
    '/users': {
      source: '建议联动：高级分析 / 增长与异常',
      context: selectedUserRanking
        ? `当前聚焦 ${selectedUserRanking.label}${selectedUserAnomalies.length > 0 ? `，命中 ${selectedUserAnomalies.length} 条异常信号。` : '，建议先确认增长是否符合预期。'}`
        : '当前没有选中用户，将优先展示待处理队列中的对象。',
      targetSection: selectedUserAnomalies.length > 0 ? 'analytics-anomalies' : 'analytics-growth',
      actionLabel: selectedUserAnomalies.length > 0 ? '回到异常中心' : '回到增长分析',
    },
    '/keys': {
      source: '建议联动：高级分析 / 异常中心',
      context: selectedKeyRow
        ? `当前 Key ${selectedKeyRow.apiKeyName || selectedKeyRow.apiKeyId} 归属 ${selectedKeyRow.ownerLabel}，适合继续确认风险类型与关联用户。`
        : '当前没有选中 Key，将优先展示最值得处理的治理对象。',
      targetSection: 'analytics-anomalies',
      actionLabel: '回到异常中心',
    },
    '/models': {
      source: '建议联动：高级分析 / 模型偏好',
      context: selectedModelSpendRow
        ? `当前聚焦 ${selectedModelSpendRow.model}，建议结合成本占比、请求量与异常切换一起判断。`
        : '当前没有选中模型，将优先展示成本占比最高的模型。',
      targetSection: 'analytics-model-preference',
      actionLabel: '回到模型偏好',
    },
    '/cost': {
      source: '建议联动：总览 / 高级分析',
      context:
        costPriorityQueue[0] ? `当前优先处置项：${costPriorityQueue[0].detail}` : '当前没有高优先级处置项，将继续展示预算与结构视图。',
      targetSection: topGrowthUser ? 'analytics-growth' : 'analytics-ranking',
      actionLabel: topGrowthUser ? '回到增长分析' : '回到用户排行',
    },
  };

  const workbenchContext =
    activePath === '/users' || activePath === '/keys' || activePath === '/models' || activePath === '/cost'
      ? workbenchContextMap[activePath]
      : null;

  return (
    <AppShell
      activePath={activePath}
      onNavigate={handleNavigate}
      unreadCount={signalsData?.unreadCount ?? 0}
      onBellClick={() => setDrawerOpen((prev) => !prev)}
      headerActions={
        <>
          <BillingMonthSelector
            months={months}
            value={billingMonth}
            onChange={setBillingMonth}
            disabled={dashboardQuery.isLoading || monthsQuery.isLoading}
          />
          <DateRangeFilter
            start={dateStart}
            end={dateEnd}
            onStartChange={setDateStart}
            onEndChange={setDateEnd}
            validationMessage={dateRangeValidationMessage}
          />
        </>
      }
    >
      {activePath !== '/advanced-analytics' || isUserProfileRoute ? (
        <section className="span-12">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-dim)]">
                  {pageMeta.eyebrow}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] md:text-4xl">
                  {pageHeadingTitle}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{pageMeta.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    multiple
                    onChange={handleImportCsv}
                    disabled={!billingMonth || importing}
                  />
                  {importing ? t('toolbar.importing') : t('toolbar.import')}
                </label>
                <ExportButton pageName={exportPageName} billingMonth={billingMonth} disabled={!billingMonth} />
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  {t('toolbar.clear')}
                </button>
              </div>
            </div>

            {importMessage ? <p className="text-sm text-[var(--text-muted)]">{importMessage}</p> : null}

            {workbenchContext ? (
              <div className="rounded-[24px] border border-[rgba(77,142,255,0.16)] bg-[linear-gradient(135deg,rgba(77,142,255,0.12),rgba(10,15,28,0.06))] px-4 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                      {workbenchContext.source}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{workbenchContext.context}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openDashboardOverview}
                      className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                    >
                      回到总览
                    </button>
                    <button
                      type="button"
                      onClick={() => openAdvancedAnalyticsSection(workbenchContext.targetSection)}
                      className="inline-flex h-10 items-center rounded-2xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.12)] px-4 text-sm font-medium text-[var(--text)] transition hover:bg-[rgba(77,142,255,0.18)]"
                    >
                      {workbenchContext.actionLabel}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activePath === '/' ? (
        <>
          {overviewKpis.map((kpi, index) => (
            <DashboardSummaryCard
              key={`${kpi.title}-${index}`}
              title={kpi.title}
              value={dashboardQuery.isLoading ? t('status.loading') : kpi.value}
              change={dashboardQuery.isLoading ? undefined : kpi.change}
              hint={kpi.hint}
              tone={kpi.tone}
              onClick={openAdvancedAnalyticsOverview}
              actionLabel="查看分析"
            />
          ))}

          <section className="glass-panel span-8 rounded-[26px] px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  本月重点结论
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {overviewPrimaryTitle}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{overviewPrimaryDescription}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAdvancedAnalyticsSection('analytics-overview')}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  进入高级分析
                </button>
                <button
                  type="button"
                  onClick={topRiskAnomaly ? () => openUserProfilePage(topRiskAnomaly.userId) : () => setDrawerOpen(true)}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  {topRiskAnomaly ? '查看最高风险用户' : '查看未读信号'}
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {overviewAlertChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={chip.onClick}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition hover:opacity-90 ${
                    chip.tone === 'danger'
                      ? 'border-rose-400/20 bg-rose-500/10 text-rose-100'
                      : chip.tone === 'warning'
                        ? 'border-amber-300/20 bg-amber-500/10 text-amber-100'
                        : chip.tone === 'primary'
                          ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
                          : 'border-white/10 bg-white/6 text-[var(--text-muted)]'
                  }`}
                >
                  <span>{chip.label}</span>
                  <span className="text-xs font-semibold opacity-90">{chip.value}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              {overviewInsightStripItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                   onClick={() =>
                     openAdvancedAnalyticsSection(
                       item.targetSection === 'analytics-anomalies'
                         ? 'analytics-anomalies'
                         : item.targetSection === 'analytics-growth'
                           ? 'analytics-growth'
                           : item.targetSection === 'analytics-model-preference'
                             ? 'analytics-model-preference'
                             : item.targetSection === 'analytics-ranking'
                               ? 'analytics-ranking'
                               : 'analytics-overview',
                     )
                   }
                   className="rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                 >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        item.tone === 'danger'
                          ? 'bg-rose-500/15 text-rose-200'
                          : item.tone === 'warning'
                            ? 'bg-amber-500/15 text-amber-200'
                            : item.tone === 'success'
                              ? 'bg-emerald-500/15 text-emerald-200'
                              : 'bg-cyan-500/15 text-cyan-200'
                      }`}
                    >
                      {item.targetSection === 'analytics-anomalies'
                        ? '风险'
                        : item.targetSection === 'analytics-growth'
                          ? '增长'
                          : item.targetSection === 'analytics-model-preference'
                            ? '模型'
                            : '总览'}
                    </span>
                    <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-dim)]">
                      {item.targetSection === 'analytics-anomalies'
                        ? '异常关注'
                        : item.targetSection === 'analytics-growth'
                          ? '增长变化'
                          : item.targetSection === 'analytics-model-preference'
                            ? '模型结构'
                            : '总览摘要'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{item.text}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="glass-panel span-4 rounded-[26px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  行动中心
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {topRiskAnomaly
                    ? `${topRiskAnomaly.user} 需要先处理`
                    : topGrowthUser
                      ? `${topGrowthUser.user} 值得先复核`
                      : `${signalsData?.unreadCount ?? 0} 条事项待处理`}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              这里集中放置最适合马上执行的检查动作，让首页直接承担“先判断、再进入排查”的入口角色。
            </p>
            <div className="mt-4 space-y-3">
              {overviewActionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-center justify-between rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">{item.detail}</p>
                  </div>
                  <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-dim)]">进入</span>
                </button>
              ))}
            </div>
          </section>

          <EChartCard className="span-8" title={t('chart.dailySpendTrend')} subtitle={t('chart.dailySpendSubtitle')} option={spendTrendOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData || dashboardData.dailyTrends.spend.length === 0} height={360} />
          <section className="glass-panel span-4 rounded-[26px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  重点用户分组
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {priorityUserCount > 0 ? `${priorityUserCount} 个优先处理对象` : '当前暂无重点用户'}
                </p>
              </div>
              <button
                type="button"
                 onClick={() => openAdvancedAnalyticsSection('analytics-anomalies')}
                 className="inline-flex h-11 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
               >
                查看分析
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {priorityUserGroups.map((group) => (
                <div key={group.id} className="rounded-2xl border border-[var(--border-soft)] bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text)]">{group.title}</p>
                    <span className="text-xs text-[var(--text-dim)]">{group.items.length} 位</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.items.length > 0 ? (
                      group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openUserProfilePage(item.userId)}
                          className="w-full rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-left transition hover:bg-white/10"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    item.tone === 'danger'
                                      ? 'bg-rose-500/15 text-rose-200'
                                      : item.tone === 'warning'
                                        ? 'bg-amber-500/15 text-amber-200'
                                        : 'bg-cyan-500/15 text-cyan-200'
                                  }`}
                                >
                                  {item.badge}
                                </span>
                                <span className="text-sm font-medium text-[var(--text)]">{item.user}</span>
                              </div>
                              <p className="mt-2 text-sm text-[var(--text-muted)]">{item.summary}</p>
                              <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">{item.detail}</p>
                            </div>
                            <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-dim)]">打开</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-sm text-[var(--text-muted)]">
                        {group.emptyText}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <EChartCard
            className="span-4"
            title={t('chart.modelDistribution')}
            subtitle={
              leadingModelPreference
                ? `${leadingModelPreference.name} 为本月主力模型`
                : t('chart.modelDistributionSubtitle')
            }
            option={modelShareOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData}
            height={320}
          />
          <EChartCard
            className="span-4"
            title={t('chart.topUsers')}
            subtitle={
              topGrowthUser
                ? `${topGrowthUser.user} 增长 ${topGrowthUser.growthPct >= 0 ? '+' : ''}${topGrowthUser.growthPct.toFixed(1)}%`
                : t('chart.topUsersSubtitle')
            }
            option={topUsersOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData || dashboardData.topUserSpend.length === 0}
            height={320}
          />
          <EChartCard className="span-8" title={t('chart.costBreakdown')} subtitle={t('chart.costBreakdownSubtitle')} option={costCompositionOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData} height={320} />
        </>
      ) : null}

      {activePath === '/advanced-analytics' && !isUserProfileRoute ? (
        <AdvancedAnalyticsPage
          billingMonth={billingMonth}
          dashboardData={dashboardData}
          previousDashboardData={previousDashboardData}
          usersData={usersData}
          previousUsersData={previousUsersData}
          modelsData={modelsData}
          previousModelsData={previousModelsData}
          costData={costData}
          previousCostData={previousCostData}
          signalsData={signalsData}
          userTrendData={userTrendData}
          loading={
            dashboardQuery.isLoading ||
            previousDashboardQuery.isLoading ||
            usersQuery.isLoading ||
            previousUsersQuery.isLoading ||
            modelsQuery.isLoading ||
            previousModelsQuery.isLoading ||
            costQuery.isLoading ||
            previousCostQuery.isLoading ||
            signalsQuery.isLoading ||
            userTrendQuery.isLoading
          }
          selectedUserId={selectedUserId}
          onSelectUser={handleAdvancedAnalyticsSelectUser}
          onOpenUserProfile={openUserProfilePage}
        />
      ) : null}

      {isUserProfileRoute ? (
        <UserProfilePage
          billingMonth={billingMonth}
          previousBillingMonth={previousBillingMonth}
          dashboardData={dashboardData}
          previousDashboardData={previousDashboardData}
          usersData={usersData}
          previousUsersData={previousUsersData}
          modelsData={modelsData}
          previousModelsData={previousModelsData}
          costData={costData}
          previousCostData={previousCostData}
          signalsData={signalsData}
          userTrendData={userTrendData}
          previousUserTrendData={previousUserTrendData}
          loading={
            dashboardQuery.isLoading ||
            previousDashboardQuery.isLoading ||
            usersQuery.isLoading ||
            previousUsersQuery.isLoading ||
            modelsQuery.isLoading ||
            previousModelsQuery.isLoading ||
            costQuery.isLoading ||
            previousCostQuery.isLoading ||
            signalsQuery.isLoading ||
            userTrendQuery.isLoading ||
            previousUserTrendQuery.isLoading
          }
          selectedUserId={selectedRouteUserId}
          onBackToAnalytics={() => navigate('/advanced-analytics')}
        />
      ) : null}

      {activePath === '/users' && usersData ? (
        <>
          <section className="glass-panel span-5 rounded-[26px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">待处理用户队列</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">先定位最值得处理的用户</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              先把高风险、增长异常和预算逼近用户收进一个入口，再决定是否深入到用户画像。
            </p>
            <div className="mt-5 space-y-3">
              {priorityUserGroups.flatMap((group) =>
                group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openUserProfilePage(item.userId)}
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={queueBadgeClassName(item.tone)}>{item.badge}</span>
                          <span className="text-sm font-medium text-[var(--text)]">{item.user}</span>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-muted)]">{item.summary}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">{item.detail}</p>
                      </div>
                      <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-dim)]">查看画像</span>
                    </div>
                  </button>
                )),
              )}
              {priorityUserCount === 0 ? (
                <div className="rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-4 text-sm text-[var(--text-muted)]">
                  当前没有高优先级用户，将继续展示排行与预算监控帮助你主动筛查。
                </div>
              ) : null}
            </div>
          </section>
          <section className="glass-panel span-7 rounded-[26px] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">当前用户快照</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {selectedUserRanking?.label ?? '暂无选中用户'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  只保留最关键的四个判断指标，帮助你更快决定是继续深挖，还是回到高级分析横向比对。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => (selectedUserRanking ? openUserProfilePage(selectedUserRanking.userId) : openAdvancedAnalyticsSection('analytics-user-profile'))}
                  className="inline-flex h-10 items-center rounded-2xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.12)] px-4 text-sm font-medium text-[var(--text)] transition hover:bg-[rgba(77,142,255,0.18)]"
                >
                  查看用户画像
                </button>
                <button
                  type="button"
                  onClick={() => openAdvancedAnalyticsSection(selectedUserAnomalies.length > 0 ? 'analytics-anomalies' : 'analytics-growth')}
                  className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  {selectedUserAnomalies.length > 0 ? '查看异常原因' : '查看增长分析'}
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DashboardSummaryCard className="span-1" title="本月成本" value={selectedUserRanking ? formatMoney(selectedUserRanking.spend) : t('status.unavailable')} hint="当前用户累计花费" tone="primary" />
              <DashboardSummaryCard className="span-1" title="请求量" value={selectedUserRanking?.requestCount.toLocaleString() ?? t('status.unavailable')} hint="当前用户总请求" tone="success" />
              <DashboardSummaryCard className="span-1" title="增长率" value={selectedUserGrowthRow ? `${selectedUserGrowthRow.growthPct >= 0 ? '+' : ''}${selectedUserGrowthRow.growthPct.toFixed(1)}%` : '待观察'} hint="相较上月成本变化" tone={selectedUserGrowthRow && selectedUserGrowthRow.growthPct > 20 ? 'warning' : 'primary'} />
              <DashboardSummaryCard className="span-1" title="风险等级" value={selectedUserAnomalies[0]?.risk === 'high' ? '高风险' : selectedUserAnomalies[0]?.risk === 'medium' ? '中风险' : '低风险'} hint={selectedUserAnomalies[0]?.type ?? '当前无明显异常'} tone={selectedUserAnomalies[0]?.risk === 'high' ? 'danger' : selectedUserAnomalies[0]?.risk === 'medium' ? 'warning' : 'success'} />
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              <ActionCard
                title="查看异常原因"
                detail={selectedUserAnomalies[0]?.detail ?? '当前没有直接命中的异常，适合回到增长分析复核放量来源。'}
                onClick={() => openAdvancedAnalyticsSection(selectedUserAnomalies.length > 0 ? 'analytics-anomalies' : 'analytics-growth')}
              />
              <ActionCard
                title="查看同类增长用户"
                detail={topGrowthUser ? `可与 ${topGrowthUser.user} 的增长路径做横向对比，判断当前用户是否属于同类放量。` : '当前没有明显增长异常用户。'}
                onClick={() => openAdvancedAnalyticsSection('analytics-growth')}
              />
              <ActionCard
                title="预算监控"
                detail={selectedUserBudgetRow ? `预算使用 ${selectedUserBudgetRow.usagePct.toFixed(1)}%，剩余 ${formatMoney(selectedUserBudgetRow.remainingUsd)}。` : '当前用户没有预算监控记录。'}
                onClick={() => openAdvancedAnalyticsSection('analytics-ranking')}
              />
            </div>
          </section>
          <div className="span-7"><UserRankingTable rows={filteredUserRankings} selectedUserId={selectedUserRanking?.userId ?? null} onSelectUser={openUserProfilePage} searchTerm={userSearchTerm} onSearchTermChange={setUserSearchTerm} /></div>
          <section className="span-5 space-y-4">
            <BudgetMonitorCard rows={safeUsersData.budgetMonitor} />
            <section className="glass-panel rounded-3xl p-5">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">预算逼近队列</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">把预算压力用户单独拎出来，方便优先做预算侧排查。</p>
              <div className="mt-4 space-y-3">
                {budgetPriorityUsers.map((row) => (
                  <button
                    key={row.userId}
                    type="button"
                    onClick={() => openUserProfilePage(row.userId)}
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">{row.label}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">
                          已用 {formatMoney(row.usedUsd)} / 预算 {formatMoney(row.limitUsd)}
                        </p>
                      </div>
                      <span className={queueBadgeClassName(row.style === 'critical' ? 'danger' : 'warning')}>{row.usagePct.toFixed(1)}%</span>
                    </div>
                  </button>
                ))}
                {budgetPriorityUsers.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">当前没有预算逼近用户。</p>
                ) : null}
              </div>
            </section>
          </section>
          <EChartCard className="span-7" title="单用户趋势" subtitle={selectedUserRanking ? `${selectedUserRanking.label} 的成本与请求变化` : t('chart.userTrendEmpty')} option={userTrendOption} loading={userTrendQuery.isLoading} empty={!userTrendData || safeUserTrendData.spend.length === 0} />
          <EChartCard className="span-5" title="用户分布与相似人群" subtitle="用散点图快速确认异常簇和相似用户。" option={userScatterOption} loading={usersQuery.isLoading} empty={safeUsersData.activityScatter.length === 0} />
        </>
      ) : null}

      {activePath === '/keys' && keysData ? (
        <>
          <section className="glass-panel span-5 rounded-[26px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">风险 Key 队列</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">把治理对象集中在第一页</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">优先核验高成本、高频和仍需追溯归属的 Key，减少在表格里来回找对象。</p>
            <div className="mt-5 space-y-3">
              {governanceKeyQueue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={queueBadgeClassName(item.tone)}>{item.badge}</span>
                        <span className="truncate text-sm font-medium text-[var(--text)]">{item.label}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-dim)]">{item.detail}</p>
                    </div>
                    <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-dim)]">处理</span>
                  </div>
                </button>
              ))}
              {governanceKeyQueue.length === 0 ? (
                <div className="rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-4 text-sm text-[var(--text-muted)]">
                  当前没有需要优先处理的 Key，将继续展示排行与健康状态帮助你主动筛查。
                </div>
              ) : null}
            </div>
          </section>
          <section className="glass-panel span-7 rounded-[26px] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">当前 Key 快照</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {selectedKeyRow?.apiKeyName || selectedKeyRow?.apiKeyId || '暂无选中 Key'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  当前页更强调治理动作，重点是尽快确认这个 Key 要不要继续处理、该跟谁联动。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAdvancedAnalyticsSection('analytics-anomalies')}
                  className="inline-flex h-10 items-center rounded-2xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.12)] px-4 text-sm font-medium text-[var(--text)] transition hover:bg-[rgba(77,142,255,0.18)]"
                >
                  回到异常中心
                </button>
                <button
                  type="button"
                  onClick={() => (selectedKeyOwnerUser ? openUserWorkbench(selectedKeyOwnerUser.userId) : navigate('/users'))}
                  className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  查看关联用户
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DashboardSummaryCard className="span-1" title="本月成本" value={selectedKeyRow ? formatMoney(selectedKeyRow.spend) : t('status.unavailable')} hint="当前 Key 花费" tone="primary" />
              <DashboardSummaryCard className="span-1" title="请求量" value={selectedKeyRow?.requestCount.toLocaleString() ?? t('status.unavailable')} hint="当前 Key 请求数" tone="success" />
              <DashboardSummaryCard className="span-1" title="关联用户" value={selectedKeyRow?.ownerLabel ?? '待确认'} hint="用于继续追溯归属" tone="warning" />
              <DashboardSummaryCard className="span-1" title="治理状态" value={selectedKeyRow?.deleted ? '待确认影响' : '可继续核验'} hint={selectedKeyRow?.deleted ? 'Key 已删除但可能仍需追溯' : '结合异常中心继续判断'} tone={selectedKeyRow?.deleted ? 'danger' : 'primary'} />
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              <ActionCard title="查看同类异常" detail="回到异常中心继续按同类信号聚焦，避免在 Key 页反复切换上下文。" onClick={() => openAdvancedAnalyticsSection('analytics-anomalies')} />
              <ActionCard title="查看关联用户" detail={selectedKeyOwnerUser ? `当前归属 ${selectedKeyOwnerUser.label}，适合转到用户工作台继续排查。` : '当前没有命中用户归属，建议先核验 owner。'} onClick={() => (selectedKeyOwnerUser ? openUserWorkbench(selectedKeyOwnerUser.userId) : navigate('/users'))} />
              <ActionCard title="治理建议" detail={`当前有 ${safeKeysData.keyHealth.longUnused.length} 个长期未用、${safeKeysData.keyHealth.highFrequency.length} 个高频、${safeKeysData.keyHealth.abnormalGrowth.length} 个异常增长对象。`} onClick={() => openAdvancedAnalyticsSection('analytics-anomalies')} />
            </div>
          </section>
          <div className="span-7"><KeyRankingTable rows={filteredKeyRankings} selectedKeyId={selectedKeyRow?.apiKeyId ?? null} onSelectKey={setSelectedKeyId} searchTerm={keySearchTerm} onSearchTermChange={setKeySearchTerm} /></div>
          <div className="span-5"><KeyHealthCard longUnused={safeKeysData.keyHealth.longUnused.length} highFrequency={safeKeysData.keyHealth.highFrequency.length} abnormalGrowth={safeKeysData.keyHealth.abnormalGrowth.length} /></div>
          <EChartCard className="span-12" title="Key 调用趋势" subtitle={selectedKeyRow ? `${selectedKeyRow.apiKeyName || selectedKeyRow.apiKeyId} 的成本与请求变化` : t('chart.keyTrendEmpty')} option={keyTrendOption} loading={keysQuery.isLoading || keyTrendQuery.isLoading} empty={!keyTrendData || safeKeyTrendData.spend.length === 0} />
        </>
      ) : null}

      {activePath === '/models' && modelsData ? (
        <>
          <section className="glass-panel span-5 rounded-[26px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">模型策略列表</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">先看哪个模型值得优化</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">把高成本、高集中度和异常切换相关模型放到一个入口里，方便快速做策略判断。</p>
            <div className="mt-5 space-y-3">
              {modelStrategyQueue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={queueBadgeClassName(item.tone)}>{item.badge}</span>
                        <span className="truncate text-sm font-medium text-[var(--text)]">{item.label}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-dim)]">{item.detail}</p>
                    </div>
                    <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-dim)]">分析</span>
                  </div>
                </button>
              ))}
              {modelStrategyQueue.length === 0 ? (
                <div className="rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-4 text-sm text-[var(--text-muted)]">
                  当前没有明显的模型热点，将继续展示成本分布和 Token 结构。
                </div>
              ) : null}
            </div>
          </section>
          <section className="glass-panel span-7 rounded-[26px] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">当前模型快照</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {selectedModelSpendRow?.model ?? '暂无选中模型'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  这里不只是展示结构，而是帮助你判断这个模型是否值得继续迁移、压缩或分流。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAdvancedAnalyticsSection('analytics-model-preference')}
                  className="inline-flex h-10 items-center rounded-2xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.12)] px-4 text-sm font-medium text-[var(--text)] transition hover:bg-[rgba(77,142,255,0.18)]"
                >
                  回到模型偏好
                </button>
                <button
                  type="button"
                  onClick={() => openAdvancedAnalyticsSection('analytics-anomalies')}
                  className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  查看异常切换
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DashboardSummaryCard className="span-1" title="本月成本" value={selectedModelSpendRow ? formatMoney(selectedModelSpendRow.spend) : t('status.unavailable')} hint="当前模型花费" tone="primary" />
              <DashboardSummaryCard className="span-1" title="Token 总量" value={selectedModelTokenTotal ? formatCompactNumber(selectedModelTokenTotal) : t('status.unavailable')} hint="输入 / 输出 / Cache Read 合计" tone="warning" />
              <DashboardSummaryCard className="span-1" title="成本占比" value={`${selectedModelSharePct.toFixed(1)}%`} hint="当前模型在总花费中的份额" tone={selectedModelSharePct >= 18 ? 'warning' : 'success'} />
              <DashboardSummaryCard className="span-1" title="异常关联数" value={`${selectedModelAnomalyCount}`} hint="模型切换或相关异常命中数" tone={selectedModelAnomalyCount > 0 ? 'danger' : 'success'} />
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              <ActionCard title="查看受影响用户" detail={topSpendUser ? `高成本用户 ${topSpendUser.user} 可作为优先核验对象。` : '优先回到高级分析查看模型偏好影响到的用户。'} onClick={() => openAdvancedAnalyticsSection('analytics-model-preference')} />
              <ActionCard title="查看异常切换用户" detail={selectedModelAnomalyCount > 0 ? `当前模型关联 ${selectedModelAnomalyCount} 个异常切换信号。` : '当前没有明显的异常切换信号。'} onClick={() => openAdvancedAnalyticsSection('analytics-anomalies')} />
              <ActionCard title="策略判断" detail={selectedModelRequestRow ? `当前有 ${selectedModelRequestRow.requestCount.toLocaleString()} 次请求，可作为迁移或限流判断的基础。` : '当前模型请求量不足，建议先看成本和占比。'} onClick={() => openAdvancedAnalyticsSection('analytics-ranking')} />
            </div>
          </section>
          <EChartCard className="span-6" title="模型成本分布" subtitle="先确认钱主要集中在哪些模型。" option={modelSpendOption} loading={modelsQuery.isLoading} empty={safeModelsData.spendRanking.length === 0} />
          <EChartCard className="span-6" title="Token 结构" subtitle="结合输入 / 输出 / Cache Read 判断模型是否存在效率问题。" option={modelTokensOption} loading={modelsQuery.isLoading} empty={safeModelsData.tokenStacks.length === 0} />
        </>
      ) : null}

      {activePath === '/cost' && costData ? (
        <>
          <section className="glass-panel span-5 rounded-[26px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">优先处置项</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">先从哪里动手最有效</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">把高成本用户、增长异常和模型集中点收成一条行动队列，先看最能带来效果的动作。</p>
            <div className="mt-5 space-y-3">
              {costPriorityQueue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={queueBadgeClassName(item.tone)}>{item.badge}</span>
                        <span className="text-sm font-medium text-[var(--text)]">{item.label}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-dim)]">{item.detail}</p>
                    </div>
                    <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-dim)]">处理</span>
                  </div>
                </button>
              ))}
              {costPriorityQueue.length === 0 ? (
                <div className="rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-4 text-sm text-[var(--text-muted)]">
                  当前没有明显的优先处置项，将继续展示预算趋势和结构热点。
                </div>
              ) : null}
            </div>
          </section>
          <section className="glass-panel span-7 rounded-[26px] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">预算态势</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">当前预算压力与处置建议</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  成本页现在更像处置台，重点是先识别哪里最值得行动，再决定要不要回到高级分析追原因。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAdvancedAnalyticsSection(topGrowthUser ? 'analytics-growth' : 'analytics-ranking')}
                  className="inline-flex h-10 items-center rounded-2xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.12)] px-4 text-sm font-medium text-[var(--text)] transition hover:bg-[rgba(77,142,255,0.18)]"
                >
                  {topGrowthUser ? '回到增长分析' : '回到用户排行'}
                </button>
                <button
                  type="button"
                  onClick={() => openAdvancedAnalyticsSection('analytics-model-preference')}
                  className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  查看模型成本来源
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DashboardSummaryCard className="span-1" title="本月已花费" value={dashboardQuery.data?.kpis.totalSpendUsd !== undefined ? formatMoney(dashboardQuery.data.kpis.totalSpendUsd) : t('status.unavailable')} hint="当前累计花费" tone="primary" />
              <DashboardSummaryCard className="span-1" title="预算使用率" value={dashboardData?.kpis.budgetUsageRatePct !== undefined ? `${dashboardData.kpis.budgetUsageRatePct.toFixed(1)}%` : t('status.unavailable')} hint="预算消耗进度" tone={dashboardData?.kpis.budgetUsageRatePct && dashboardData.kpis.budgetUsageRatePct >= 80 ? 'warning' : 'success'} />
              <DashboardSummaryCard className="span-1" title="预计月末" value={'projectedMonthEndSpendUsd' in safeCostData.forecast ? formatMoney(safeCostData.forecast.projectedMonthEndSpendUsd) : t('status.unavailable')} hint="按当前趋势估算" tone={'projectedMonthEndSpendUsd' in safeCostData.forecast && safeCostData.forecast.isOverBudget ? 'danger' : 'warning'} />
              <DashboardSummaryCard className="span-1" title="距预算天数" value={'projectedMonthEndSpendUsd' in safeCostData.forecast ? String(safeCostData.forecast.projectedDaysToBudget ?? 'N/A') : 'N/A'} hint={'projectedMonthEndSpendUsd' in safeCostData.forecast ? '剩余预算缓冲天数' : safeCostData.forecast.reason} tone="warning" />
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              <ActionCard title="查看高成本用户" detail={topSpendUser ? `${topSpendUser.user} 当前成本占比 ${topSpendUser.sharePct.toFixed(1)}%。` : '当前没有明显的高成本集中用户。'} onClick={() => (topSpendUser ? openUserWorkbench(topSpendUser.userId) : openAdvancedAnalyticsSection('analytics-ranking'))} />
              <ActionCard title="查看增长异常" detail={topGrowthUser ? `${topGrowthUser.user} 成本环比 ${topGrowthUser.growthPct >= 0 ? '+' : ''}${topGrowthUser.growthPct.toFixed(1)}%。` : '当前没有明显的增长异常用户。'} onClick={() => openAdvancedAnalyticsSection('analytics-growth')} />
              <ActionCard title="查看模型集中点" detail={leadingModelPreference ? `${leadingModelPreference.name} 占比 ${leadingModelPreference.value.toFixed(1)}%，适合优先确认是否可分流。` : '当前没有显著模型集中度信号。'} onClick={() => openAdvancedAnalyticsSection('analytics-model-preference')} />
            </div>
          </section>
          <EChartCard className="span-7" title="成本趋势" subtitle="先确认本月成本抬升发生在什么时间段。" option={costTrendOption} loading={costQuery.isLoading} empty={safeCostData.trend.daily.length === 0} />
          <EChartCard className="span-5" title="Pareto" subtitle="确认少数对象是否贡献了大部分成本。" option={paretoOption} loading={costQuery.isLoading} empty={false} />
          <EChartCard className="span-12" title="先从哪里动手最有效" subtitle="Treemap 现在承接处置判断，而不是单纯展示结构。" option={costTreemapOption} loading={costQuery.isLoading} empty={safeCostData.treemap.length === 0} height={360} />
        </>
      ) : null}

      <SignalDrawer open={drawerOpen} signals={signalsData?.signals ?? []} onClose={() => setDrawerOpen(false)} onNavigate={handleNavigate} />
    </AppShell>
  );
}

function ActionCard({ title, detail, onClick }: WorkbenchActionItem): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">建议动作</p>
          <p className="text-sm font-medium text-[var(--text)]">{title}</p>
          <p className="mt-2 text-xs leading-6 text-[var(--text-dim)]">{detail}</p>
        </div>
        <span className="pt-5 text-sm text-[var(--text-dim)]" aria-hidden="true">→</span>
      </div>
    </button>
  );
}

function queueBadgeClassName(tone: WorkbenchTone): string {
  if (tone === 'danger') {
    return 'inline-flex rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200';
  }
  if (tone === 'warning') {
    return 'inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200';
  }
  if (tone === 'success') {
    return 'inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200';
  }
  if (tone === 'primary') {
    return 'inline-flex rounded-full bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-200';
  }
  return 'inline-flex rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]';
}
