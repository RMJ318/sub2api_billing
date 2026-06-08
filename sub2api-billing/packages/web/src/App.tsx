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
import { useI18n } from './i18n.js';
import { importCsvFile } from './lib/api.js';
import { AdvancedAnalyticsPage } from './pages/AdvancedAnalyticsPage.js';
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
  const { t } = useI18n();

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
  const keysData = keysQuery.data;
  const keyTrendData = keyTrendQuery.data;
  const modelsData = modelsQuery.data;
  const previousModelsData = previousModelsQuery.data;
  const costData = costQuery.data;
  const previousCostData = previousCostQuery.data;
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
      eyebrow: 'Advanced Analytics',
      title: 'Advanced Analytics',
      description: '深度分析用户 API 使用行为、成本结构、增长趋势与异常风险。',
    },
    '/users': { eyebrow: t('nav.users'), title: t('nav.users'), description: t('page.description') },
    '/keys': { eyebrow: t('nav.keys'), title: t('nav.keys'), description: t('page.description') },
    '/models': { eyebrow: t('nav.models'), title: t('nav.models'), description: t('page.description') },
    '/cost': { eyebrow: t('nav.cost'), title: t('nav.cost'), description: t('page.description') },
  };
  const pageMeta = pageMetaByPath[activePath] ?? pageMetaByPath['/']!;

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
    if (filteredUserRankings.length && !selectedUserId) {
      setSelectedUserId(filteredUserRankings[0]!.userId);
    }
  }, [filteredUserRankings, selectedUserId]);

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
      onNavigate={setActivePath}
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
      {activePath !== '/advanced-analytics' ? (
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
          <DashboardSummaryCard title={t('kpi.totalSpend')} value={dashboardQuery.data?.kpis.totalSpendUsd !== undefined ? formatMoney(dashboardQuery.data.kpis.totalSpendUsd) : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')} change={formatKpiDelta(12.4)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard title={t('kpi.activeUsers')} value={dashboardQuery.data?.kpis.activeUserCount !== undefined ? dashboardQuery.data.kpis.activeUserCount : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')} change={formatKpiDelta(8)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard title={t('kpi.totalRequests')} value={dashboardData?.kpis.totalRequestCount !== undefined ? dashboardData.kpis.totalRequestCount.toLocaleString() : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')} change={formatKpiDelta(23)} hint={t('kpi.comparedLastMonth')} />
          <DashboardSummaryCard title={t('kpi.totalTokens')} value={dashboardData?.kpis.totalTokenCount !== undefined ? dashboardData.kpis.totalTokenCount.toLocaleString() : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')} change={formatKpiDelta(17.2)} hint={t('kpi.comparedLastMonth')} />

          <EChartCard className="span-8" title={t('chart.dailySpendTrend')} subtitle={t('chart.dailySpendSubtitle')} option={spendTrendOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData || dashboardData.dailyTrends.spend.length === 0} height={360} />
          <section className="glass-panel span-4 rounded-[26px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">{t('signal.center')}</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[var(--text)]">{signalsData?.unreadCount ?? 0}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex h-11 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
              >
                {t('misc.open')}
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{t('signal.summary')}</p>
          </section>
          <EChartCard className="span-4" title={t('chart.modelDistribution')} subtitle={t('chart.modelDistributionSubtitle')} option={modelShareOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData} height={320} />
          <EChartCard className="span-4" title={t('chart.topUsers')} subtitle={t('chart.topUsersSubtitle')} option={topUsersOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData || dashboardData.topUserSpend.length === 0} height={320} />
          <EChartCard className="span-8" title={t('chart.costBreakdown')} subtitle={t('chart.costBreakdownSubtitle')} option={costCompositionOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData} height={320} />
        </>
      ) : null}

      {activePath === '/advanced-analytics' ? (
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
          onSelectUser={setSelectedUserId}
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

      <SignalDrawer open={drawerOpen} signals={signalsData?.signals ?? []} onClose={() => setDrawerOpen(false)} onNavigate={setActivePath} />
    </AppShell>
  );
}
