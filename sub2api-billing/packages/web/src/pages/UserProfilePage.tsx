import { useMemo, type JSX } from 'react';
import type { EChartsOption } from 'echarts';
import { EChartCard } from '../components/EChartCard.js';
import type {
  CostAggregatesResponse,
  DashboardApiResponse,
  ModelAggregatesResponse,
  SignalAggregatesResponse,
  UserAggregatesResponse,
  UserTrendResponse,
} from '../lib/api.js';
import { buildAdvancedAnalyticsData } from '../lib/advancedAnalytics.js';

interface UserProfilePageProps {
  billingMonth: string;
  previousBillingMonth?: string | null;
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
  previousUserTrendData?: UserTrendResponse;
  loading?: boolean;
  selectedUserId?: string | null;
  onBackToAnalytics?: () => void;
}

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatMoney = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);

const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const formatShare = (value: number, total: number): string => {
  if (total <= 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
};

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function UserProfilePage({
  billingMonth,
  previousBillingMonth,
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
  previousUserTrendData,
  loading = false,
  selectedUserId,
  onBackToAnalytics,
}: UserProfilePageProps): JSX.Element {
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

  const profile = data.selectedUserProfile;

  const spendTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!profile) return undefined;
    const currentBuckets = profile.trendSpend.map((item) => item.bucket);
    const previousSpendSeries = previousUserTrendData?.spend ?? [];

    return {
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0,
        textStyle: { color: '#8c909f' },
        data: previousBillingMonth ? [billingMonth, previousBillingMonth] : [billingMonth],
      },
      grid: { left: 24, right: 16, top: 52, bottom: 28 },
      xAxis: { type: 'category', boundaryGap: false, data: currentBuckets },
      yAxis: { type: 'value' },
      series: [
        {
          name: billingMonth,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 3, color: '#4d8eff' },
          areaStyle: { color: 'rgba(77,142,255,0.14)' },
          data: profile.trendSpend.map((item) => Number(item.value)),
        },
        ...(previousBillingMonth && previousSpendSeries.length > 0
          ? [
              {
                name: previousBillingMonth,
                type: 'line' as const,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: '#94a3b8', type: 'dashed' as const },
                data: currentBuckets.map((_, index) => Number(previousSpendSeries[index]?.value ?? 0)),
              },
            ]
          : []),
      ],
    };
  }, [billingMonth, previousBillingMonth, previousUserTrendData, profile]);

  const requestTrendOption = useMemo<EChartsOption | undefined>(() => {
    if (!profile) return undefined;
    const currentBuckets = profile.trendRequests.map((item) => item.bucket);
    const previousRequestSeries = previousUserTrendData?.requests ?? [];

    return {
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0,
        textStyle: { color: '#8c909f' },
        data: previousBillingMonth ? [billingMonth, previousBillingMonth] : [billingMonth],
      },
      grid: { left: 24, right: 16, top: 52, bottom: 28 },
      xAxis: { type: 'category', boundaryGap: false, data: currentBuckets },
      yAxis: { type: 'value' },
      series: [
        {
          name: billingMonth,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 3, color: '#00c2ff' },
          areaStyle: { color: 'rgba(0,194,255,0.14)' },
          data: profile.trendRequests.map((item) => Number(item.value)),
        },
        ...(previousBillingMonth && previousRequestSeries.length > 0
          ? [
              {
                name: previousBillingMonth,
                type: 'line' as const,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: '#67e8f9', type: 'dashed' as const },
                data: currentBuckets.map((_, index) => Number(previousRequestSeries[index]?.value ?? 0)),
              },
            ]
          : []),
      ],
    };
  }, [billingMonth, previousBillingMonth, previousUserTrendData, profile]);

  const modelPreferenceOption = useMemo<EChartsOption | undefined>(() => {
    if (!profile) return undefined;
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#8c909f' } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          itemStyle: { borderColor: '#111827', borderWidth: 2 },
          label: { color: '#cbd5e1' },
          data: profile.modelPreference.map((item, index) => ({
            name: item.name,
            value: item.value,
            itemStyle: {
              color: ['#4d8eff', '#00c2ff', '#8b5cf6', '#00a572', '#64748b'][index] ?? '#64748b',
            },
          })),
        },
      ],
    };
  }, [profile]);

  const profileInsights = useMemo(() => {
    if (!profile) return null;

    const totalPlatformCost = data.rankingTabs.cost.reduce((sum, row) => sum + row.cost, 0);
    const totalPlatformRequests = data.rankingTabs.requests.reduce((sum, row) => sum + row.requests, 0);
    const totalPlatformTokens = data.rankingTabs.tokens.reduce((sum, row) => sum + row.totalTokens, 0);

    const costRank = data.rankingTabs.cost.findIndex((row) => row.userId === profile.userId) + 1;
    const requestRank = data.rankingTabs.requests.findIndex((row) => row.userId === profile.userId) + 1;
    const tokenRank = data.rankingTabs.tokens.findIndex((row) => row.userId === profile.userId) + 1;

    const topModel = [...profile.modelPreference].sort((a, b) => b.value - a.value)[0] ?? null;
    const totalModelValue = profile.modelPreference.reduce((sum, item) => sum + item.value, 0);
    const topModelShare = topModel ? (topModel.value / Math.max(totalModelValue, 1)) * 100 : 0;

    const costSeries = profile.trendSpend.map((item) => Number(item.value));
    const requestSeries = profile.trendRequests.map((item) => Number(item.value));
    const recentCost = costSeries.slice(-7).reduce((sum, value) => sum + value, 0);
    const previousCostWindow = costSeries.slice(-14, -7).reduce((sum, value) => sum + value, 0);
    const recentRequest = requestSeries.slice(-7).reduce((sum, value) => sum + value, 0);
    const previousRequestWindow = requestSeries.slice(-14, -7).reduce((sum, value) => sum + value, 0);

    const costTrendDelta =
      previousCostWindow > 0 ? ((recentCost - previousCostWindow) / previousCostWindow) * 100 : recentCost > 0 ? 100 : 0;
    const requestTrendDelta =
      previousRequestWindow > 0
        ? ((recentRequest - previousRequestWindow) / previousRequestWindow) * 100
        : recentRequest > 0
          ? 100
          : 0;

    const lateNightRequests = profile.activityHeatmap
      .filter((cell) => cell.hour <= 4)
      .reduce((sum, cell) => sum + cell.value, 0);
    const officeHourRequests = profile.activityHeatmap
      .filter((cell) => cell.hour >= 9 && cell.hour <= 18)
      .reduce((sum, cell) => sum + cell.value, 0);
    const peakSlot = [...profile.activityHeatmap].sort((a, b) => b.value - a.value)[0] ?? null;
    const peakWeekday = weekdayLabels.find((label) => label === peakSlot?.weekday) ?? peakSlot?.weekday ?? '--';

    const riskLevel: 'high' | 'medium' | 'low' =
      profile.riskSignals.length >= 3 || topModelShare >= 60 || lateNightRequests > officeHourRequests * 0.55
        ? 'high'
        : profile.riskSignals.length >= 1 || topModelShare >= 40
          ? 'medium'
          : 'low';

    const riskToneClass =
      riskLevel === 'high'
        ? 'border-red-400/20 bg-red-500/10 text-red-100'
        : riskLevel === 'medium'
          ? 'border-amber-300/20 bg-amber-500/10 text-amber-100'
          : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';

    const riskLabel = riskLevel === 'high' ? '高风险关注' : riskLevel === 'medium' ? '中风险观察' : '低风险稳定';

    const recommendations = [
      profile.totalCost > totalPlatformCost * 0.08
        ? '该用户成本占比较高，建议设置专属预算提醒并按周复盘。'
        : '该用户当前成本占比可控，建议继续观察趋势变化。',
      topModelShare >= 55
        ? `当前 ${topModel?.name ?? '主模型'} 占比过高，建议评估低价模型替代或做路由分流。`
        : '模型结构较分散，可进一步结合场景确认是否需要收敛模型栈。',
      lateNightRequests > officeHourRequests * 0.55
        ? '深夜调用偏活跃，建议核查自动任务、密钥权限和异常流量来源。'
        : '活跃时段整体正常，可重点跟进增长和成本变化。',
    ];

    return {
      totalPlatformCost,
      totalPlatformRequests,
      totalPlatformTokens,
      costRank,
      requestRank,
      tokenRank,
      topModel,
      topModelShare,
      recentCost,
      recentRequest,
      costTrendDelta,
      requestTrendDelta,
      lateNightRequests,
      officeHourRequests,
      peakSlot,
      peakWeekday,
      riskLevel,
      riskLabel,
      riskToneClass,
      recommendations,
    };
  }, [data.rankingTabs.cost, data.rankingTabs.requests, data.rankingTabs.tokens, profile]);

  if (!profile || !profileInsights) {
    return (
      <section className="span-12">
        <div className="glass-panel rounded-[26px] p-6">
          <p className="text-sm text-[var(--text-muted)]">当前没有可展示的用户画像，请先从高级分析中选择一个用户。</p>
          {onBackToAnalytics ? (
            <button type="button" className="analytics-chip mt-4" onClick={onBackToAnalytics}>
              返回高级分析
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const activityByWeekday = weekdayLabels.map((weekday) => ({
    weekday,
    total: profile.activityHeatmap.filter((cell) => cell.weekday === weekday).reduce((sum, cell) => sum + cell.value, 0),
  }));

  return (
    <>
      <section className="span-12">
        <div className="glass-panel rounded-[28px] p-5 md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">User Profile Workspace</p>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${profileInsights.riskToneClass}`}>
                  {profileInsights.riskLabel}
                </span>
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)] md:text-[2rem]">
                {profile.user}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                当前页聚焦 <span className="font-semibold text-[var(--text)]">{billingMonth}</span> 的单用户使用画像，
                适合做成本归因、增长复盘、模型优化和异常排查。
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">平台成本排名</p>
                  <p className="mt-1 text-base font-semibold text-[var(--text)]">#{profileInsights.costRank || '--'}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">请求排名</p>
                  <p className="mt-1 text-base font-semibold text-[var(--text)]">#{profileInsights.requestRank || '--'}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">Token 排名</p>
                  <p className="mt-1 text-base font-semibold text-[var(--text)]">#{profileInsights.tokenRank || '--'}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onBackToAnalytics ? (
                <button type="button" className="analytics-chip" onClick={onBackToAnalytics}>
                  返回平台分析
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="span-12">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">总成本</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">{formatMoney(profile.totalCost)}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">占平台 {formatShare(profile.totalCost, profileInsights.totalPlatformCost)}</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">总请求数</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">{formatNumber(profile.totalRequests)}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">占平台 {formatShare(profile.totalRequests, profileInsights.totalPlatformRequests)}</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">总 Token</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">{formatNumber(profile.totalTokens)}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">占平台 {formatShare(profile.totalTokens, profileInsights.totalPlatformTokens)}</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">活跃天数</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">{profile.activeDays}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{billingMonth} 活跃覆盖</p>
          </div>
        </div>
      </section>

      <section className="glass-panel span-12 rounded-[26px] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">用户摘要</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              从成本、请求、模型集中度与活跃时段四个维度快速判断这个用户值不值得继续深挖。
            </p>
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${profileInsights.riskToneClass}`}>
            风险等级 · {profileInsights.riskLabel}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="近 7 天成本" value={formatMoney(profileInsights.recentCost)} />
          <MetricTile label="近 7 天请求" value={formatNumber(profileInsights.recentRequest)} />
          <MetricTile label="成本趋势" value={formatPercent(profileInsights.costTrendDelta)} tone={profileInsights.costTrendDelta >= 0 ? 'warning' : 'success'} />
          <MetricTile label="请求趋势" value={formatPercent(profileInsights.requestTrendDelta)} tone={profileInsights.requestTrendDelta >= 0 ? 'primary' : 'success'} />
        </div>
      </section>

      <EChartCard
        className="span-6"
        title="成本趋势"
        subtitle={previousBillingMonth ? `${billingMonth} vs ${previousBillingMonth}` : '最近 30 天'}
        option={spendTrendOption}
        loading={loading}
        empty={!spendTrendOption}
        height={320}
      />
      <EChartCard
        className="span-6"
        title="请求趋势"
        subtitle={previousBillingMonth ? `${billingMonth} vs ${previousBillingMonth}` : '最近 30 天'}
        option={requestTrendOption}
        loading={loading}
        empty={!requestTrendOption}
        height={320}
      />

      <EChartCard
        className="span-6"
        title="模型偏好"
        subtitle="该用户常用模型结构"
        option={modelPreferenceOption}
        loading={loading}
        empty={!modelPreferenceOption || profile.modelPreference.length === 0}
        height={320}
      />

      <section className="glass-panel span-6 rounded-[26px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">模型与调用结构</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">这里主要看模型集中度是否过高，以及调用是否具备优化空间。</p>
          </div>
          <span className="rounded-full border border-[rgba(77,142,255,0.18)] bg-[rgba(77,142,255,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]">
            Focus
          </span>
        </div>

        <div className="mt-5 space-y-3">
          <MetricRow label="主力模型" value={profileInsights.topModel?.name ?? '--'} />
          <MetricRow label="主力模型占比" value={`${profileInsights.topModelShare.toFixed(1)}%`} />
          <MetricRow
            label="模型集中判断"
            value={profileInsights.topModelShare >= 55 ? '偏集中' : profileInsights.topModelShare >= 35 ? '中等' : '较分散'}
          />
        </div>

        <div className="mt-5 space-y-2.5">
          {profile.modelPreference.slice(0, 5).map((item) => {
            const total = profile.modelPreference.reduce((sum, row) => sum + row.value, 0);
            const width = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.name}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--text)]">{item.name}</span>
                  <span className="text-[var(--text-dim)]">{width.toFixed(1)}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/6">
                  <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(width, 4)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-panel span-7 rounded-[26px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">活跃时段热力图</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              结合一周 7×24 调用密度，看这个用户是否存在深夜活跃或固定批处理调用模式。
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-dim)]">
            Peak · {profileInsights.peakWeekday} {profileInsights.peakSlot?.hour ?? '--'}:00
          </span>
        </div>

        <div className="mt-5">
          <HeatmapGrid cells={profile.activityHeatmap} />
        </div>
      </section>

      <section className="glass-panel span-5 rounded-[26px] p-5">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">活跃摘要</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">辅助判断该用户更像在线业务、办公型调用，还是自动化脚本型调用。</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <MetricTile label="深夜请求" value={formatNumber(profileInsights.lateNightRequests)} compact />
          <MetricTile label="工作时段请求" value={formatNumber(profileInsights.officeHourRequests)} compact />
        </div>

        <div className="mt-5 space-y-3">
          {activityByWeekday.map((item) => (
            <div key={item.weekday}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--text)]">{item.weekday}</span>
                <span className="text-[var(--text-dim)]">{formatNumber(item.total)}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/6">
                <div
                  className="h-2 rounded-full bg-[rgba(0,194,255,0.9)]"
                  style={{
                    width: `${Math.max(
                      6,
                      (item.total / Math.max(...activityByWeekday.map((row) => row.total), 1)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel span-6 rounded-[26px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">风险信号</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">建议优先复核异常增长、深夜活跃、模型集中与调用结构偏移。</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${profileInsights.riskToneClass}`}>
            {profile.riskSignals.length} signals
          </span>
        </div>

        <ul className="mt-4 space-y-3">
          {profile.riskSignals.length > 0 ? (
            profile.riskSignals.map((signal, index) => (
              <li
                key={`${profile.userId}-signal-${index}`}
                className="rounded-2xl border border-amber-300/15 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100"
              >
                {signal}
              </li>
            ))
          ) : (
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text-muted)]">
              当前没有明显风险信号。
            </li>
          )}
        </ul>
      </section>

      <section className="glass-panel span-6 rounded-[26px] p-5">
        <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">建议下一步</h3>
        <div className="mt-4 space-y-3">
          {profileInsights.recommendations.map((item, index) => (
            <div key={`${profile.userId}-rec-${index}`} className="panel-muted rounded-[22px] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                Action {String(index + 1).padStart(2, '0')}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function MetricTile({
  label,
  value,
  tone = 'default',
  compact = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'success' | 'warning';
  compact?: boolean;
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-[var(--primary)]'
      : tone === 'success'
        ? 'text-emerald-300'
        : tone === 'warning'
          ? 'text-amber-200'
          : 'text-[var(--text)]';

  return (
    <div className={`rounded-2xl border border-white/8 bg-white/4 ${compact ? 'px-4 py-3' : 'px-4 py-4'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">{label}</p>
      <p className={`mt-2 font-semibold ${compact ? 'text-base' : 'text-xl'} ${toneClass}`}>{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--text)]">{value}</span>
    </div>
  );
}

function HeatmapGrid({
  cells,
}: {
  cells: Array<{ weekday: string; hour: number; value: number }>;
}) {
  const max = Math.max(...cells.map((cell) => cell.value), 1);
  const hours = Array.from({ length: 24 }, (_, index) => index);

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="min-w-[720px]">
        <div className="grid gap-2" style={{ gridTemplateColumns: '72px repeat(24, minmax(0, 1fr))' }}>
          <div />
          {hours.map((hour) => (
            <div key={hour} className="text-center text-[10px] font-semibold text-[var(--text-dim)]">
              {hour}
            </div>
          ))}
          {weekdayLabels.map((weekday) => (
            <HeatmapRow key={weekday} weekday={weekday} hours={hours} cells={cells} max={max} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HeatmapRow({
  weekday,
  hours,
  cells,
  max,
}: {
  weekday: string;
  hours: number[];
  cells: Array<{ weekday: string; hour: number; value: number }>;
  max: number;
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
          <div
            key={`${weekday}-${hour}`}
            title={`${weekday} ${hour}:00 · ${cell.value} requests`}
            className="h-6 rounded-md border border-white/6"
            style={{ background: bg }}
          />
        );
      })}
    </>
  );
}
