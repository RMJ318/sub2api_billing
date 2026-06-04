import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react';
import type { EChartsOption } from 'echarts';
import { useQueryClient } from '@tanstack/react-query';
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
import { importCsvFile } from './lib/api.js';
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

/**
 * Application root. Wraps page content in the AppShell which provides
 * navigation, theme toggle (dark-mode-first, persisted to localStorage),
 * Bell icon with unread badge, and responsive card-grid layout.
 *
 * Analytical pages and the Signal Center drawer are implemented by later tasks.
 */
export function App(): JSX.Element {
  const queryClient = useQueryClient();
  const [activePath, setActivePath] = useState('/');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [keySearchTerm, setKeySearchTerm] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const supportedImportFiles = useMemo(
    () => [
      'monthly_user_summary.csv',
      'daily_user_usage.csv',
      'model_user_usage.csv',
      'api_key_usage.csv',
      'request_detail.csv',
    ],
    [],
  );
  const monthsQuery = useMonths();
  const months = useMemo(
    () => monthsQuery.data?.months ?? ['2026-05', '2026-04'],
    [monthsQuery.data],
  );
  const [billingMonth, setBillingMonth] = useState('');
  const healthQuery = useHealth();
  const dashboardQuery = useDashboard(billingMonth || null);
  const usersQuery = useUsers(billingMonth || null);
  const userTrendQuery = useUserTrend(billingMonth || null, selectedUserId);
  const keysQuery = useKeys(billingMonth || null);
  const keyTrendQuery = useKeyTrend(billingMonth || null, selectedKeyId);
  const modelsQuery = useModels(billingMonth || null);
  const costQuery = useCost(billingMonth || null);
  const signalsQuery = useSignals(billingMonth || null);
  const dashboardData = dashboardQuery.data;
  const usersData = usersQuery.data;
  const userTrendData = userTrendQuery.data;
  const keysData = keysQuery.data;
  const keyTrendData = keyTrendQuery.data;
  const modelsData = modelsQuery.data;
  const costData = costQuery.data;
  const signalsData = signalsQuery.data;
  const hasDashboardData = dashboardData !== undefined;
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
      allKeysDailyTrend: keysData?.allKeysDailyTrend ?? { spend: [], requests: [] },
    }),
    [keysData],
  );
  const safeModelsData = useMemo(
    () => ({
      spendRanking: modelsData?.spendRanking ?? [],
      requestRanking: modelsData?.requestRanking ?? [],
      tokenStacks: modelsData?.tokenStacks ?? [],
      efficiencyScatter: modelsData?.efficiencyScatter ?? [],
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
          reason: 'No forecast data available.',
        },
      treemap: costData?.treemap ?? [],
    }),
    [costData],
  );
  const safeUserTrendData = useMemo(
    () => ({
      spend: userTrendData?.spend ?? [],
      requests: userTrendData?.requests ?? [],
      tokens: userTrendData?.tokens ?? [],
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
  const dateRangeValidationMessage = useMemo(() => {
    if (dateStart && dateEnd && dateStart > dateEnd) {
      return 'dateStart must not be after dateEnd.';
    }
    return null;
  }, [dateEnd, dateStart]);

  const filterTrendPoints = (
    points: Array<{ bucket: string; value: string }>,
  ): Array<{ bucket: string; value: string }> => {
    if (dateRangeValidationMessage) {
      return [];
    }
    return points.filter((point) => {
      if (dateStart && point.bucket < dateStart) {
        return false;
      }
      if (dateEnd && point.bucket > dateEnd) {
        return false;
      }
      return true;
    });
  };
  const filteredUserRankings = useMemo(() => {
    const rows = safeUsersData.rankings;
    const needle = userSearchTerm.trim().toLowerCase();
    if (needle.length === 0) {
      return rows;
    }
    return rows.filter((row) =>
      row.label.toLowerCase().includes(needle),
    );
  }, [safeUsersData.rankings, userSearchTerm]);
  const filteredKeyRankings = useMemo(() => {
    const rows = safeKeysData.rankings;
    const needle = keySearchTerm.trim().toLowerCase();
    if (needle.length === 0) {
      return rows;
    }
    return rows.filter((row) =>
      `${row.apiKeyName ?? ''} ${row.ownerLabel}`.toLowerCase().includes(needle),
    );
  }, [keySearchTerm, safeKeysData.rankings]);
  const userScatterOption = useMemo<EChartsOption | undefined>(() => {
    if (!usersData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: 'Requests' },
      yAxis: { type: 'value', name: 'Spend (USD)' },
      series: [
        {
          type: 'scatter',
          data: safeUsersData.activityScatter.map((point) => [
            point.x,
            point.y,
            point.size,
            point.label,
          ]),
          symbolSize: (value: number[]) => {
            const size = value[2] ?? 0;
            return Math.max(10, Math.min(36, size / 20000));
          },
        },
      ],
    };
  }, [safeUsersData.activityScatter, usersData]);

  const userTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!userTrendData) {
      return undefined;
    }
    const spendPoints = filterTrendPoints(safeUserTrendData.spend);
    const requestPoints = filterTrendPoints(safeUserTrendData.requests);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 20, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: spendPoints.map((item) => item.bucket),
      },
      yAxis: [
        {
          type: 'value',
          splitLine: { lineStyle: { color: '#e5e7eb' } },
        },
        {
          type: 'value',
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Spend',
          type: 'line',
          smooth: true,
          data: spendPoints.map((item) => Number(item.value)),
          lineStyle: { width: 3, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
        },
        {
          name: 'Requests',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: requestPoints.map((item) => Number(item.value)),
          lineStyle: { width: 2, color: '#1d4ed8' },
          itemStyle: { color: '#1d4ed8' },
        },
      ],
    };
  }, [dateEnd, dateRangeValidationMessage, dateStart, safeUserTrendData.requests, safeUserTrendData.spend, userTrendData]);

  const keyTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!keyTrendData) {
      return undefined;
    }
    const spendPoints = filterTrendPoints(safeKeyTrendData.spend);
    const requestPoints = filterTrendPoints(safeKeyTrendData.requests);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 20, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: spendPoints.map((item) => item.bucket),
      },
      yAxis: [
        {
          type: 'value',
          splitLine: { lineStyle: { color: '#e5e7eb' } },
        },
        {
          type: 'value',
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Spend',
          type: 'line',
          smooth: true,
          data: spendPoints.map((item) => Number(item.value)),
          lineStyle: { width: 3, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
        },
        {
          name: 'Requests',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: requestPoints.map((item) => Number(item.value)),
          lineStyle: { width: 2, color: '#1d4ed8' },
          itemStyle: { color: '#1d4ed8' },
        },
      ],
    };
  }, [dateEnd, dateRangeValidationMessage, dateStart, keyTrendData, safeKeyTrendData.requests, safeKeyTrendData.spend]);

  const spendTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) {
      return undefined;
    }
    const spendPoints = filterTrendPoints(dashboardData.dailyTrends.spend);
    const requestPoints = filterTrendPoints(dashboardData.dailyTrends.requests);
    return {
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['Spend', 'Requests'],
        textStyle: { color: '#64748b' },
      },
      grid: { left: 36, right: 20, top: 42, bottom: 30 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: spendPoints.map((point) => point.bucket),
        axisLine: { lineStyle: { color: '#94a3b8' } },
      },
      yAxis: [
        {
          type: 'value',
          splitLine: { lineStyle: { color: '#e5e7eb' } },
        },
        {
          type: 'value',
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Spend',
          type: 'line',
          smooth: true,
          data: spendPoints.map((point) => Number(point.value)),
          lineStyle: { width: 3, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
          areaStyle: { color: 'rgba(15, 118, 110, 0.12)' },
        },
        {
          name: 'Requests',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: requestPoints.map((point) => Number(point.value)),
          lineStyle: { width: 2, color: '#1d4ed8' },
          itemStyle: { color: '#1d4ed8' },
        },
      ],
    };
  }, [dashboardData, dateEnd, dateRangeValidationMessage, dateStart]);

  const modelSpendOption = useMemo<EChartsOption | undefined>(() => {
    if (!modelsData) {
      return undefined;
    }
    const topModels = safeModelsData.spendRanking.slice(0, 8);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 48, right: 20, top: 16, bottom: 36 },
      xAxis: {
        type: 'category',
        data: topModels.map((item) => item.model),
        axisLabel: { rotate: 20 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e5e7eb' } },
      },
      series: [
        {
          type: 'bar',
          data: topModels.map((item) => Number(item.spend)),
          itemStyle: { color: '#2563eb', borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [modelsData, safeModelsData.spendRanking]);

  const modelTokensOption = useMemo<EChartsOption | undefined>(() => {
    if (!modelsData) {
      return undefined;
    }
    const rows = safeModelsData.tokenStacks.slice(0, 6);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      grid: { left: 48, right: 20, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        data: rows.map((item) => item.model),
        axisLabel: { rotate: 20 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e5e7eb' } },
      },
      series: [
        {
          name: 'Input',
          type: 'bar',
          stack: 'tokens',
          data: rows.map((item) => item.inputTokens),
        },
        {
          name: 'Output',
          type: 'bar',
          stack: 'tokens',
          data: rows.map((item) => item.outputTokens),
        },
        {
          name: 'Cache Read',
          type: 'bar',
          stack: 'tokens',
          data: rows.map((item) => item.cacheReadTokens),
        },
      ],
    };
  }, [modelsData, safeModelsData.tokenStacks]);

  const costTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!costData) {
      return undefined;
    }
    const spendPoints = filterTrendPoints(safeCostData.trend.daily);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 20, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: spendPoints.map((item) => item.bucket),
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e5e7eb' } },
      },
      series: [
        {
          name: 'Daily Spend',
          type: 'line',
          smooth: true,
          data: spendPoints.map((item) => Number(item.value)),
          lineStyle: { width: 3, color: '#7c3aed' },
          itemStyle: { color: '#7c3aed' },
        },
      ],
    };
  }, [costData, dateEnd, dateRangeValidationMessage, dateStart, safeCostData.trend.daily]);

  const paretoOption = useMemo<EChartsOption | undefined>(() => {
    if (!costData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 36, right: 16, top: 16, bottom: 30 },
      xAxis: {
        type: 'category',
        data: ['Top 10%', 'Top 20%', 'Top 30%'],
      },
      yAxis: {
        type: 'value',
        max: 100,
        splitLine: { lineStyle: { color: '#e5e7eb' } },
      },
      series: [
        {
          type: 'bar',
          data: [safeCostData.pareto.top10, safeCostData.pareto.top20, safeCostData.pareto.top30],
          itemStyle: { color: '#0f766e', borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [costData, safeCostData.pareto.top10, safeCostData.pareto.top20, safeCostData.pareto.top30]);

  const costTreemapOption = useMemo<EChartsOption | undefined>(() => {
    if (!costData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: { show: true, formatter: '{b}' },
          upperLabel: { show: true, height: 20 },
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

  const topUsersOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) {
      return undefined;
    }
    const topUsers = [...dashboardData.topUserSpend].slice(0, 8).reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 120, right: 24, top: 16, bottom: 16 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: {
        type: 'category',
        data: topUsers.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: topUsers.map((item) => Number(item.spend)),
          itemStyle: {
            color: '#ea580c',
            borderRadius: [0, 6, 6, 0],
          },
        },
      ],
    };
  }, [dashboardData]);

  const modelShareOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        textStyle: { color: '#64748b' },
      },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          avoidLabelOverlap: false,
          label: { show: false },
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
    if (!dashboardData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        bottom: 0,
        textStyle: { color: '#64748b' },
      },
      grid: { left: 28, right: 16, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        data: ['Cost Mix'],
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e5e7eb' } },
      },
      series: [
        {
          name: 'Input',
          type: 'bar',
          stack: 'cost',
          data: [Number(dashboardData.costComposition.input)],
        },
        {
          name: 'Output',
          type: 'bar',
          stack: 'cost',
          data: [Number(dashboardData.costComposition.output)],
        },
        {
          name: 'Cache Create',
          type: 'bar',
          stack: 'cost',
          data: [Number(dashboardData.costComposition.cacheCreation)],
        },
        {
          name: 'Cache Read',
          type: 'bar',
          stack: 'cost',
          data: [Number(dashboardData.costComposition.cacheRead)],
        },
        {
          name: 'Image',
          type: 'bar',
          stack: 'cost',
          data: [Number(dashboardData.costComposition.imageOutput)],
        },
      ],
    };
  }, [dashboardData]);

  useEffect(() => {
    if ((!billingMonth || !months.includes(billingMonth)) && months.length > 0) {
      setBillingMonth(months[0]!);
    }
  }, [billingMonth, months]);

  useEffect(() => {
    if (filteredUserRankings.length && !selectedUserId) {
      setSelectedUserId(filteredUserRankings[0]!.userId);
    }
    if (
      selectedUserId &&
      filteredUserRankings.length > 0 &&
      !filteredUserRankings.some((row) => row.userId === selectedUserId)
    ) {
      setSelectedUserId(filteredUserRankings[0]!.userId);
    }
  }, [filteredUserRankings, selectedUserId]);

  useEffect(() => {
    if (filteredKeyRankings.length && !selectedKeyId) {
      setSelectedKeyId(filteredKeyRankings[0]!.apiKeyId);
    }
    if (
      selectedKeyId &&
      filteredKeyRankings.length > 0 &&
      !filteredKeyRankings.some((row) => row.apiKeyId === selectedKeyId)
    ) {
      setSelectedKeyId(filteredKeyRankings[0]!.apiKeyId);
    }
  }, [filteredKeyRankings, selectedKeyId]);

  const exportPageName =
    activePath === '/'
      ? 'dashboard'
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
    '/': {
      eyebrow: 'Executive cockpit',
      title: 'AI Usage Analytics',
      description:
        'Convert monthly sub2api billing exports into a dark-mode management dashboard for spend, usage trends, model mix, API key health, and operational signals.',
    },
    '/users': {
      eyebrow: 'User analysis',
      title: 'User Spend Intelligence',
      description:
        'Review top consumers, budget pressure, and per-user activity trends for the selected billing month.',
    },
    '/keys': {
      eyebrow: 'API key analysis',
      title: 'Key Health and Ownership',
      description:
        'Inspect ranking, ownership, lifecycle status, and trend changes for each API key in the active billing window.',
    },
    '/models': {
      eyebrow: 'Model analysis',
      title: 'Model Mix and Efficiency',
      description:
        'Compare spend concentration and token distribution across model families and individual model endpoints.',
    },
    '/cost': {
      eyebrow: 'Cost analysis',
      title: 'Cost Trend and Forecast',
      description:
        'Track concentration, forecast risk, and hierarchical cost composition across users, models, and keys.',
    },
  };
  const pageMeta = pageMetaByPath[activePath] ?? pageMetaByPath['/'];

  const clearFilters = () => {
    setBillingMonth(months[0] ?? '');
    setDateStart('');
    setDateEnd('');
    setUserSearchTerm('');
    setKeySearchTerm('');
  };

  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0 || !billingMonth) {
      return;
    }

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
        `Imported ${loaded} records from ${results.length} file${results.length > 1 ? 's' : ''}${rejected > 0 ? `, ${rejected} row${rejected > 1 ? 's were' : ' was'} rejected.` : '.'}`,
      );
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : 'CSV import failed.',
      );
    } finally {
      event.target.value = '';
      setImporting(false);
    }
  };

  return (
    <AppShell
      activePath={activePath}
      onNavigate={setActivePath}
      unreadCount={signalsData?.unreadCount ?? 0}
      onBellClick={() => setDrawerOpen((prev) => !prev)}
    >
      <section className="glass-panel span-12 rounded-[28px] p-6 md:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-dim)]">
              {pageMeta.eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] md:text-4xl">
              {pageMeta.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-muted)] md:text-[15px]">
              {pageMeta.description}
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-xl">
            <div className="panel-muted rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                Current page
              </p>
              <p className="data-mono mt-2 text-sm text-[var(--text)]">{activePath}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {drawerOpen ? 'Signal Center open' : 'Signal Center closed'}
              </p>
            </div>
            <div className="panel-muted rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                API state
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--secondary)]">
                {healthQuery.data?.status === 'ok' ? 'Connected' : 'Unavailable'}
              </p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {healthQuery.isError
                  ? 'Could not reach the health endpoint.'
                  : 'Shared API query layer is active.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="panel-muted rounded-3xl p-4 md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  Filters
                </p>
                <div className="mt-4 flex flex-col gap-4">
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
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    multiple
                    onChange={handleImportCsv}
                    disabled={!billingMonth || importing}
                  />
                  {importing ? 'Importing...' : 'Import CSVs'}
                </label>
                <ExportButton
                  pageName={exportPageName}
                  billingMonth={billingMonth}
                  disabled={!billingMonth}
                />
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 py-3 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                >
                  Clear Filters
                </button>
              </div>
            </div>
            {importMessage ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">{importMessage}</p>
            ) : null}
            <p className="mt-2 text-xs leading-6 text-[var(--text-dim)]">
              Supported files: {supportedImportFiles.join(', ')}. You can select one or many CSVs for the active billing month.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DashboardSummaryCard
              className="span-12 sm:span-6"
              title="Selected Month"
              value={billingMonth || 'Not selected'}
              hint="Latest available billing month applied across all pages."
            />
            <DashboardSummaryCard
              className="span-12 sm:span-6"
              title="API Status"
              value={healthQuery.data?.status === 'ok' ? 'Connected' : 'Unavailable'}
              hint="Signal and analytics queries are backed by the shared API layer."
            />
          </div>
        </div>
      </section>

      {activePath === '/' ? (
        <>
          <DashboardSummaryCard
            title="Total Spend"
            value={
              dashboardQuery.data?.kpis.totalSpendUsd !== undefined
                ? `$${dashboardQuery.data.kpis.totalSpendUsd}`
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint={
              dashboardQuery.isError
                ? 'Dashboard request failed.'
                : 'KPI sourced from /api/dashboard for the selected month.'
            }
          />

          <DashboardSummaryCard
            title="Active Users"
            value={
              dashboardQuery.data?.kpis.activeUserCount !== undefined
                ? dashboardQuery.data.kpis.activeUserCount
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Distinct active users in the selected month."
          />

          <DashboardSummaryCard
            title="Total Requests"
            value={
              dashboardData?.kpis.totalRequestCount !== undefined
                ? dashboardData.kpis.totalRequestCount.toLocaleString()
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Month-scoped request volume."
          />

          <DashboardSummaryCard
            title="Total Tokens"
            value={
              dashboardData?.kpis.totalTokenCount !== undefined
                ? dashboardData.kpis.totalTokenCount.toLocaleString()
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Combined input, output, cache, and image tokens."
          />

          <DashboardSummaryCard
            className="span-6 xl:span-3"
            title="Budget Usage"
            value={
              dashboardData?.kpis.budgetUsageRatePct !== undefined
                ? `${dashboardData.kpis.budgetUsageRatePct.toFixed(1)}%`
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Overall monthly budget utilization."
          />

          <DashboardSummaryCard
            className="span-6 xl:span-3"
            title="Forecast"
            value={
              'projectedMonthEndSpendUsd' in safeCostData.forecast
                ? `$${safeCostData.forecast.projectedMonthEndSpendUsd}`
                : 'Unavailable'
            }
            hint={
              'projectedMonthEndSpendUsd' in safeCostData.forecast
                ? `Projected days to budget: ${safeCostData.forecast.projectedDaysToBudget ?? 'N/A'}`
                : safeCostData.forecast.reason
            }
          />

          <EChartCard
            className="span-8"
            title="Daily Spend vs Requests"
            subtitle="Trend view for the selected billing month."
            option={spendTrendOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData || dashboardData.dailyTrends.spend.length === 0}
            height={340}
          />

          <EChartCard
            className="span-4"
            title="Top Spending Users"
            subtitle="Highest spend users in the selected month."
            option={topUsersOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData || dashboardData.topUserSpend.length === 0}
            height={340}
          />

          <EChartCard
            className="span-4"
            title="Model Family Share"
            subtitle="Spend split across GPT, Claude, Gemini, and Other."
            option={modelShareOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData}
            height={320}
          />

          <EChartCard
            className="span-8"
            title="Cost Composition"
            subtitle="Input, output, cache, and image cost mix."
            option={costCompositionOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData}
            height={320}
          />
        </>
      ) : null}

      {activePath === '/users' && usersData ? (
        <>
          <DashboardSummaryCard
            className="span-4"
            title="Active Users"
            value={
              dashboardQuery.data?.kpis.activeUserCount !== undefined
                ? dashboardQuery.data.kpis.activeUserCount
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Distinct active users in the selected month."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Budget Usage"
            value={
              dashboardData?.kpis.budgetUsageRatePct !== undefined
                ? `${dashboardData.kpis.budgetUsageRatePct.toFixed(1)}%`
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Overall monthly budget utilization."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Total Spend"
            value={
              dashboardQuery.data?.kpis.totalSpendUsd !== undefined
                ? `$${dashboardQuery.data.kpis.totalSpendUsd}`
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Current month net spend."
          />
          <div className="span-7">
            <UserRankingTable
              rows={filteredUserRankings}
              selectedUserId={selectedUserId}
              onSelectUser={setSelectedUserId}
              searchTerm={userSearchTerm}
              onSearchTermChange={setUserSearchTerm}
            />
          </div>
          <div className="span-5">
            <BudgetMonitorCard rows={safeUsersData.budgetMonitor} />
          </div>
          <EChartCard
            className="span-7"
            title="Selected User Trend"
            subtitle={
              selectedUserId
                ? `Daily spend and request trend for user ${selectedUserId}.`
                : 'Select a user to inspect daily trends.'
            }
            option={userTrendOption}
            loading={userTrendQuery.isLoading}
            empty={!userTrendData || safeUserTrendData.spend.length === 0}
          />
          <EChartCard
            className="span-5"
            title="User Activity Scatter"
            subtitle="Requests vs spend, sized by token volume."
            option={userScatterOption}
            loading={usersQuery.isLoading}
            empty={safeUsersData.activityScatter.length === 0}
          />
        </>
      ) : null}

      {activePath === '/keys' && keysData ? (
        <>
          <DashboardSummaryCard
            className="span-4"
            title="API Status"
            value={healthQuery.data?.status === 'ok' ? 'Connected' : 'Unavailable'}
            hint="Signal and analytics queries are backed by the shared API layer."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Selected Month"
            value={billingMonth || 'Not selected'}
            hint="Current month applied to key ranking and trend views."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Total Requests"
            value={
              dashboardData?.kpis.totalRequestCount !== undefined
                ? dashboardData.kpis.totalRequestCount.toLocaleString()
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Month-scoped request volume."
          />
          <div className="span-7">
            <KeyRankingTable
              rows={filteredKeyRankings}
              selectedKeyId={selectedKeyId}
              onSelectKey={setSelectedKeyId}
              searchTerm={keySearchTerm}
              onSearchTermChange={setKeySearchTerm}
            />
          </div>
          <div className="span-5">
            <KeyHealthCard
              longUnused={safeKeysData.keyHealth.longUnused.length}
              highFrequency={safeKeysData.keyHealth.highFrequency.length}
              abnormalGrowth={safeKeysData.keyHealth.abnormalGrowth.length}
            />
          </div>
          <EChartCard
            className="span-12"
            title="Selected Key Daily Trend"
            subtitle={
              selectedKeyId
                ? `Daily spend trend for API key ${selectedKeyId}.`
                : 'Select an API key to inspect its trend.'
            }
            option={keyTrendOption}
            loading={keysQuery.isLoading || keyTrendQuery.isLoading}
            empty={!keyTrendData || safeKeyTrendData.spend.length === 0}
          />
        </>
      ) : null}

      {activePath === '/models' && modelsData ? (
        <>
          <DashboardSummaryCard
            className="span-4"
            title="Total Spend"
            value={
              dashboardQuery.data?.kpis.totalSpendUsd !== undefined
                ? `$${dashboardQuery.data.kpis.totalSpendUsd}`
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Spend base for current model comparison."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Total Tokens"
            value={
              dashboardData?.kpis.totalTokenCount !== undefined
                ? dashboardData.kpis.totalTokenCount.toLocaleString()
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Combined input, output, cache, and image tokens."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Selected Month"
            value={billingMonth || 'Not selected'}
            hint="Current model mix scope."
          />
          <EChartCard
            className="span-6"
            title="Model Spend Ranking"
            subtitle="Top models by spend in the selected month."
            option={modelSpendOption}
            loading={modelsQuery.isLoading}
            empty={safeModelsData.spendRanking.length === 0}
          />
          <EChartCard
            className="span-6"
            title="Model Token Mix"
            subtitle="Input, output, and cache-read tokens by model."
            option={modelTokensOption}
            loading={modelsQuery.isLoading}
            empty={safeModelsData.tokenStacks.length === 0}
          />
        </>
      ) : null}

      {activePath === '/cost' && costData ? (
        <>
          <DashboardSummaryCard
            className="span-4"
            title="Total Spend"
            value={
              dashboardQuery.data?.kpis.totalSpendUsd !== undefined
                ? `$${dashboardQuery.data.kpis.totalSpendUsd}`
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Current month total cost."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Budget Usage"
            value={
              dashboardData?.kpis.budgetUsageRatePct !== undefined
                ? `${dashboardData.kpis.budgetUsageRatePct.toFixed(1)}%`
                : dashboardQuery.isLoading
                  ? 'Loading...'
                  : 'Unavailable'
            }
            hint="Overall monthly budget utilization."
          />
          <DashboardSummaryCard
            className="span-4"
            title="Forecast"
            value={
              'projectedMonthEndSpendUsd' in safeCostData.forecast
                ? `$${safeCostData.forecast.projectedMonthEndSpendUsd}`
                : 'Unavailable'
            }
            hint={
              'projectedMonthEndSpendUsd' in safeCostData.forecast
                ? `Projected days to budget: ${safeCostData.forecast.projectedDaysToBudget ?? 'N/A'}`
                : safeCostData.forecast.reason
            }
          />
          <EChartCard
            className="span-7"
            title="Cost Trend"
            subtitle="Daily spend for the selected month."
            option={costTrendOption}
            loading={costQuery.isLoading}
            empty={safeCostData.trend.daily.length === 0}
          />
          <EChartCard
            className="span-5"
            title="Pareto Concentration"
            subtitle="How much spend is concentrated in the top cohorts."
            option={paretoOption}
            loading={costQuery.isLoading}
            empty={false}
          />
          <EChartCard
            className="span-12"
            title="Cost Treemap"
            subtitle="Spend grouped by user, then model, then API key."
            option={costTreemapOption}
            loading={costQuery.isLoading}
            empty={safeCostData.treemap.length === 0}
            height={360}
          />
        </>
      ) : null}

      <SignalDrawer
        open={drawerOpen}
        signals={signalsData?.signals ?? []}
        onClose={() => setDrawerOpen(false)}
        onNavigate={setActivePath}
      />
    </AppShell>
  );
}
