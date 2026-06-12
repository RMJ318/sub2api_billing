import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react';
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

export function App(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [advancedAnalyticsGlobalView, setAdvancedAnalyticsGlobalView] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
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
        onClick: topRiskAnomaly
          ? () => openUserProfilePage(topRiskAnomaly.userId)
          : () => openAdvancedAnalyticsSection('analytics-anomalies'),
      },
      {
        id: 'growth-users',
        label: '增长异常',
        value: `${overviewAnalytics.growth.cost.length} 位`,
        tone: 'warning' as const,
        onClick: topGrowthUser
          ? () => openUserProfilePage(topGrowthUser.userId)
          : () => openAdvancedAnalyticsSection('analytics-growth'),
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
      openAdvancedAnalyticsOverview,
      overviewAnalytics.anomalies.length,
      overviewAnalytics.growth.cost.length,
      signalsData?.unreadCount,
      topGrowthUser,
      topRiskAnomaly,
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
    '/users': { eyebrow: t('nav.users'), title: t('nav.users'), description: t('page.description') },
    '/keys': { eyebrow: t('nav.keys'), title: t('nav.keys'), description: t('page.description') },
    '/models': { eyebrow: t('nav.models'), title: t('nav.models'), description: t('page.description') },
    '/cost': { eyebrow: t('nav.cost'), title: t('nav.cost'), description: t('page.description') },
  };
  const pageMeta = pageMetaByPath[isUserProfileRoute ? '/advanced-analytics/users/:userId' : activePath] ?? pageMetaByPath['/']!;

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
                  {billingMonth ? t('page.billingOverview', { month: billingMonth }) : pageMeta.title}
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
          <DashboardSummaryCard className="span-4" title={t('kpi.activeUsers')} value={dashboardQuery.data?.kpis.activeUserCount ?? t('status.unavailable')} change={formatKpiDelta(8)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.budgetUsage')} value={dashboardData?.kpis.budgetUsageRatePct !== undefined ? `${dashboardData.kpis.budgetUsageRatePct.toFixed(1)}%` : t('status.unavailable')} change={formatKpiDelta(4.2)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.totalSpend')} value={dashboardQuery.data?.kpis.totalSpendUsd !== undefined ? formatMoney(dashboardQuery.data.kpis.totalSpendUsd) : t('status.unavailable')} change={formatKpiDelta(12.4)} hint={t('kpi.comparedLastMonth')} />
          <div className="span-7"><UserRankingTable rows={filteredUserRankings} selectedUserId={selectedUserId} onSelectUser={setSelectedUserId} searchTerm={userSearchTerm} onSearchTermChange={setUserSearchTerm} /></div>
          <div className="span-5"><BudgetMonitorCard rows={safeUsersData.budgetMonitor} /></div>
          <EChartCard className="span-7" title={t('chart.userTrend')} subtitle={selectedUserId ? `${selectedUserId}` : t('chart.userTrendEmpty')} option={userTrendOption} loading={userTrendQuery.isLoading} empty={!userTrendData || safeUserTrendData.spend.length === 0} />
          <EChartCard className="span-5" title={t('chart.userScatter')} subtitle={t('chart.userScatterSubtitle')} option={userScatterOption} loading={usersQuery.isLoading} empty={safeUsersData.activityScatter.length === 0} />
        </>
      ) : null}

      {activePath === '/keys' && keysData ? (
        <>
          <DashboardSummaryCard className="span-4" title={t('kpi.selectedMonth')} value={billingMonth || t('status.unavailable')} hint={t('page.description')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.totalSpend')} value={dashboardQuery.data?.kpis.totalSpendUsd !== undefined ? formatMoney(dashboardQuery.data.kpis.totalSpendUsd) : t('status.unavailable')} change={formatKpiDelta(12.4)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.totalRequests')} value={dashboardData?.kpis.totalRequestCount !== undefined ? dashboardData.kpis.totalRequestCount.toLocaleString() : t('status.unavailable')} change={formatKpiDelta(23)} hint={t('kpi.comparedLastMonth')} />
          <div className="span-7"><KeyRankingTable rows={filteredKeyRankings} selectedKeyId={selectedKeyId} onSelectKey={setSelectedKeyId} searchTerm={keySearchTerm} onSearchTermChange={setKeySearchTerm} /></div>
          <div className="span-5"><KeyHealthCard longUnused={safeKeysData.keyHealth.longUnused.length} highFrequency={safeKeysData.keyHealth.highFrequency.length} abnormalGrowth={safeKeysData.keyHealth.abnormalGrowth.length} /></div>
          <EChartCard className="span-12" title={t('chart.keyTrend')} subtitle={selectedKeyId ? `${selectedKeyId}` : t('chart.keyTrendEmpty')} option={keyTrendOption} loading={keysQuery.isLoading || keyTrendQuery.isLoading} empty={!keyTrendData || safeKeyTrendData.spend.length === 0} />
        </>
      ) : null}

      {activePath === '/models' && modelsData ? (
        <>
          <DashboardSummaryCard className="span-4" title={t('kpi.totalSpend')} value={dashboardQuery.data?.kpis.totalSpendUsd !== undefined ? formatMoney(dashboardQuery.data.kpis.totalSpendUsd) : t('status.unavailable')} change={formatKpiDelta(12.4)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.totalTokens')} value={dashboardData?.kpis.totalTokenCount !== undefined ? dashboardData.kpis.totalTokenCount.toLocaleString() : t('status.unavailable')} change={formatKpiDelta(17.2)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.selectedMonth')} value={billingMonth || t('status.unavailable')} hint={t('page.description')} />
          <EChartCard className="span-6" title={t('chart.modelSpend')} subtitle={t('chart.modelSpendSubtitle')} option={modelSpendOption} loading={modelsQuery.isLoading} empty={safeModelsData.spendRanking.length === 0} />
          <EChartCard className="span-6" title={t('chart.modelTokenMix')} subtitle={t('chart.modelTokenMixSubtitle')} option={modelTokensOption} loading={modelsQuery.isLoading} empty={safeModelsData.tokenStacks.length === 0} />
        </>
      ) : null}

      {activePath === '/cost' && costData ? (
        <>
          <DashboardSummaryCard className="span-4" title={t('kpi.totalSpend')} value={dashboardQuery.data?.kpis.totalSpendUsd !== undefined ? formatMoney(dashboardQuery.data.kpis.totalSpendUsd) : t('status.unavailable')} change={formatKpiDelta(12.4)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.budgetUsage')} value={dashboardData?.kpis.budgetUsageRatePct !== undefined ? `${dashboardData.kpis.budgetUsageRatePct.toFixed(1)}%` : t('status.unavailable')} change={formatKpiDelta(4.2)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard className="span-4" title={t('kpi.forecast')} value={'projectedMonthEndSpendUsd' in safeCostData.forecast ? formatMoney(safeCostData.forecast.projectedMonthEndSpendUsd) : t('status.unavailable')} hint={'projectedMonthEndSpendUsd' in safeCostData.forecast ? String(safeCostData.forecast.projectedDaysToBudget ?? 'N/A') : safeCostData.forecast.reason} />
          <EChartCard className="span-7" title={t('chart.costTrend')} subtitle={t('chart.costTrendSubtitle')} option={costTrendOption} loading={costQuery.isLoading} empty={safeCostData.trend.daily.length === 0} />
          <EChartCard className="span-5" title={t('chart.pareto')} subtitle={t('chart.paretoSubtitle')} option={paretoOption} loading={costQuery.isLoading} empty={false} />
          <EChartCard className="span-12" title={t('chart.treemap')} subtitle={t('chart.treemapSubtitle')} option={costTreemapOption} loading={costQuery.isLoading} empty={safeCostData.treemap.length === 0} height={360} />
        </>
      ) : null}

      <SignalDrawer open={drawerOpen} signals={signalsData?.signals ?? []} onClose={() => setDrawerOpen(false)} onNavigate={handleNavigate} />
    </AppShell>
  );
}
