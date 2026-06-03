import { useEffect, useMemo, useState, type JSX } from 'react';
import type { EChartsOption } from 'echarts';
import { AppShell } from './components/AppShell.js';
import { BillingMonthSelector } from './components/BillingMonthSelector.js';
import { BudgetMonitorCard } from './components/BudgetMonitorCard.js';
import { DashboardSummaryCard } from './components/DashboardSummaryCard.js';
import { EChartCard } from './components/EChartCard.js';
import { ExportButton } from './components/ExportButton.js';
import { KeyHealthCard } from './components/KeyHealthCard.js';
import { KeyRankingTable } from './components/KeyRankingTable.js';
import { SignalDrawer } from './components/SignalDrawer.js';
import { UserRankingTable } from './components/UserRankingTable.js';
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
  const [activePath, setActivePath] = useState('/');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const monthsQuery = useMonths();
  const months = useMemo(
    () => monthsQuery.data?.months ?? ['2026-05', '2026-04'],
    [monthsQuery.data],
  );
  const [billingMonth, setBillingMonth] = useState(months[0] ?? '');
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
          data: usersData.activityScatter.map((point) => [
            point.x,
            point.y,
            point.size,
            point.label,
          ]),
          symbolSize: (value: number[]) => Math.max(10, Math.min(36, value[2] / 20000)),
        },
      ],
    };
  }, [usersData]);

  const userTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!userTrendData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 20, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: userTrendData.spend.map((item) => item.bucket),
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
          data: userTrendData.spend.map((item) => Number(item.value)),
          lineStyle: { width: 3, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
        },
        {
          name: 'Requests',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: userTrendData.requests.map((item) => Number(item.value)),
          lineStyle: { width: 2, color: '#1d4ed8' },
          itemStyle: { color: '#1d4ed8' },
        },
      ],
    };
  }, [userTrendData]);

  const keyTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!keyTrendData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 20, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: keyTrendData.spend.map((item) => item.bucket),
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
          data: keyTrendData.spend.map((item) => Number(item.value)),
          lineStyle: { width: 3, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
        },
        {
          name: 'Requests',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: keyTrendData.requests.map((item) => Number(item.value)),
          lineStyle: { width: 2, color: '#1d4ed8' },
          itemStyle: { color: '#1d4ed8' },
        },
      ],
    };
  }, [keyTrendData]);

  const spendTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!dashboardData) {
      return undefined;
    }
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
        data: dashboardData.dailyTrends.spend.map((point) => point.bucket),
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
          data: dashboardData.dailyTrends.spend.map((point) => Number(point.value)),
          lineStyle: { width: 3, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
          areaStyle: { color: 'rgba(15, 118, 110, 0.12)' },
        },
        {
          name: 'Requests',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: dashboardData.dailyTrends.requests.map((point) => Number(point.value)),
          lineStyle: { width: 2, color: '#1d4ed8' },
          itemStyle: { color: '#1d4ed8' },
        },
      ],
    };
  }, [dashboardData]);

  const modelSpendOption = useMemo<EChartsOption | undefined>(() => {
    if (!modelsData) {
      return undefined;
    }
    const topModels = modelsData.spendRanking.slice(0, 8);
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
  }, [modelsData]);

  const modelTokensOption = useMemo<EChartsOption | undefined>(() => {
    if (!modelsData) {
      return undefined;
    }
    const rows = modelsData.tokenStacks.slice(0, 6);
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
  }, [modelsData]);

  const costTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!costData) {
      return undefined;
    }
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 20, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: costData.trend.daily.map((item) => item.bucket),
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
          data: costData.trend.daily.map((item) => Number(item.value)),
          lineStyle: { width: 3, color: '#7c3aed' },
          itemStyle: { color: '#7c3aed' },
        },
      ],
    };
  }, [costData]);

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
          data: [costData.pareto.top10, costData.pareto.top20, costData.pareto.top30],
          itemStyle: { color: '#0f766e', borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [costData]);

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
    if (usersData?.rankings.length && !selectedUserId) {
      setSelectedUserId(usersData.rankings[0]!.userId);
    }
  }, [usersData, selectedUserId]);

  useEffect(() => {
    if (keysData?.rankings.length && !selectedKeyId) {
      setSelectedKeyId(keysData.rankings[0]!.apiKeyId);
    }
  }, [keysData, selectedKeyId]);

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

  return (
    <AppShell
      activePath={activePath}
      onNavigate={setActivePath}
      unreadCount={signalsData?.unreadCount ?? 0}
      onBellClick={() => setDrawerOpen((prev) => !prev)}
    >
      <section className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">AI Usage Analytics</h1>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">
              Shared data layer is now connected. Dashboard detail views will be
              implemented in subsequent tasks.
            </p>
          </div>
          <BillingMonthSelector
            months={months}
            value={billingMonth}
            onChange={setBillingMonth}
            disabled={dashboardQuery.isLoading || monthsQuery.isLoading}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <ExportButton
            pageName={exportPageName}
            billingMonth={billingMonth}
            disabled={!billingMonth}
          />
        </div>
        <p className="mt-4 text-sm text-neutral-400 dark:text-neutral-500">
          Current page: <code>{activePath}</code>
          {drawerOpen && ' | Signal Center open'}
        </p>
      </section>

      <DashboardSummaryCard
        title="API Status"
        value={healthQuery.data?.status === 'ok' ? 'Connected' : 'Unavailable'}
        hint={
          healthQuery.isError
            ? 'Could not reach the API health endpoint.'
            : 'Using the shared API query layer.'
        }
      />

      <DashboardSummaryCard
        title="Selected Month"
        value={billingMonth || 'Not selected'}
        hint="Shared month state is ready for all analytical pages."
      />

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
        hint="This minimal summary confirms the front-end data layer is wired."
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

      {activePath === '/' ? (
        <>
          <EChartCard
            title="Daily Spend vs Requests"
            subtitle="Trend view for the selected billing month."
            option={spendTrendOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData || dashboardData.dailyTrends.spend.length === 0}
          />

          <EChartCard
            title="Top Spending Users"
            subtitle="Highest spend users in the selected month."
            option={topUsersOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData || dashboardData.topUserSpend.length === 0}
          />

          <EChartCard
            title="Model Family Share"
            subtitle="Spend split across GPT, Claude, Gemini, and Other."
            option={modelShareOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData}
          />

          <EChartCard
            title="Cost Composition"
            subtitle="Input, output, cache, and image cost mix."
            option={costCompositionOption}
            loading={dashboardQuery.isLoading}
            empty={!hasDashboardData}
          />
        </>
      ) : null}

      {activePath === '/users' && usersData ? (
        <>
          <UserRankingTable
            rows={usersData.rankings}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
          />
          <BudgetMonitorCard rows={usersData.budgetMonitor} />
          <EChartCard
            title="User Activity Scatter"
            subtitle="Requests vs spend, sized by token volume."
            option={userScatterOption}
            loading={usersQuery.isLoading}
            empty={usersData.activityScatter.length === 0}
          />
          <EChartCard
            title="Selected User Trend"
            subtitle={
              selectedUserId
                ? `Daily spend and request trend for user ${selectedUserId}.`
                : 'Select a user to inspect daily trends.'
            }
            option={userTrendOption}
            loading={userTrendQuery.isLoading}
            empty={!userTrendData || userTrendData.spend.length === 0}
          />
        </>
      ) : null}

      {activePath === '/keys' && keysData ? (
        <>
          <KeyRankingTable
            rows={keysData.rankings}
            selectedKeyId={selectedKeyId}
            onSelectKey={setSelectedKeyId}
          />
          <KeyHealthCard
            longUnused={keysData.keyHealth.longUnused.length}
            highFrequency={keysData.keyHealth.highFrequency.length}
            abnormalGrowth={keysData.keyHealth.abnormalGrowth.length}
          />
          <EChartCard
            title="Selected Key Daily Trend"
            subtitle={
              selectedKeyId
                ? `Daily spend trend for API key ${selectedKeyId}.`
                : 'Select an API key to inspect its trend.'
            }
            option={keyTrendOption}
            loading={keysQuery.isLoading || keyTrendQuery.isLoading}
            empty={!keyTrendData || keyTrendData.spend.length === 0}
          />
        </>
      ) : null}

      {activePath === '/models' && modelsData ? (
        <>
          <EChartCard
            title="Model Spend Ranking"
            subtitle="Top models by spend in the selected month."
            option={modelSpendOption}
            loading={modelsQuery.isLoading}
            empty={modelsData.spendRanking.length === 0}
          />
          <EChartCard
            title="Model Token Mix"
            subtitle="Input, output, and cache-read tokens by model."
            option={modelTokensOption}
            loading={modelsQuery.isLoading}
            empty={modelsData.tokenStacks.length === 0}
          />
        </>
      ) : null}

      {activePath === '/cost' && costData ? (
        <>
          <EChartCard
            title="Cost Trend"
            subtitle="Daily spend for the selected month."
            option={costTrendOption}
            loading={costQuery.isLoading}
            empty={costData.trend.daily.length === 0}
          />
          <EChartCard
            title="Pareto Concentration"
            subtitle="How much spend is concentrated in the top cohorts."
            option={paretoOption}
            loading={costQuery.isLoading}
            empty={false}
          />
          <DashboardSummaryCard
            title="Forecast"
            value={
              'projectedMonthEndSpendUsd' in costData.forecast
                ? `$${costData.forecast.projectedMonthEndSpendUsd}`
                : 'Unavailable'
            }
            hint={
              'projectedMonthEndSpendUsd' in costData.forecast
                ? `Projected days to budget: ${costData.forecast.projectedDaysToBudget ?? 'N/A'}`
                : costData.forecast.reason
            }
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
