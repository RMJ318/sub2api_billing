import { useEffect, useMemo, useState, type JSX } from 'react';
import type { EChartsOption } from 'echarts';
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
  onSelectUser?: (userId: string) => void;
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

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatMoney = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

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

  const visibleGrowthCostRows = growthLimit === 'all' ? data.growth.cost : data.growth.cost.slice(0, growthLimit);
  const visibleGrowthRequestRows =
    growthLimit === 'all' ? data.growth.requests : data.growth.requests.slice(0, growthLimit);

  useEffect(() => {
    if (!highlightedSection) return undefined;
    const timeoutId = window.setTimeout(() => setHighlightedSection(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedSection]);

  useEffect(() => {
    if (!highlightedUserId) return undefined;
    const timeoutId = window.setTimeout(() => setHighlightedUserId(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedUserId]);

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

  const userRowClassName = (userId: string): string =>
    highlightedUserId === userId ? 'analytics-row-highlight' : '';

  return (
    <>
      <div className="span-12 xl:hidden">
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

      <div className="span-12 min-w-0">
        <div className="space-y-4 xl:pr-[316px]">
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
              <InsightMiniCard title="成本洞察" body={data.aiInsight.costInsight} />
              <InsightMiniCard title="用户洞察" body={data.aiInsight.userInsight} />
              <InsightMiniCard title="风险洞察" body={data.aiInsight.riskInsight} />
              <InsightMiniCard title="优化建议" body={data.aiInsight.optimizationSuggestion} />
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
                />
                <MetricLine label="异常用户" value={`${data.anomalies.length}`} />
                <MetricLine
                  label="高风险信号"
                  value={`${data.anomalies.filter((item) => item.risk === 'high').length}`}
                />
                <MetricLine label="重点模型" value={data.modelPreference[0]?.name ?? '--'} />
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
                {data.rankingTabs.cost.slice(0, 12).map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>#{row.rank}</td>
                    <td>
                      <button type="button" className="analytics-link" onClick={() => onSelectUser?.(row.userId)}>
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
                {data.rankingTabs.requests.slice(0, 12).map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>
                      <button type="button" className="analytics-link" onClick={() => onSelectUser?.(row.userId)}>
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
                {data.rankingTabs.tokens.slice(0, 12).map((row) => (
                  <tr key={row.userId} className={userRowClassName(row.userId)}>
                    <td>
                      <button type="button" className="analytics-link" onClick={() => onSelectUser?.(row.userId)}>
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
          {data.efficiency.slice(0, 8).map((row) => (
            <div key={row.userId} className="panel-muted analytics-row-card rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="analytics-link text-left font-semibold"
                  onClick={() => onSelectUser?.(row.userId)}
                >
                  {row.user}
                </button>
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
            </div>
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
                      <button type="button" className="analytics-link" onClick={() => onSelectUser?.(row.userId)}>
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
                      <button type="button" className="analytics-link" onClick={() => onSelectUser?.(row.userId)}>
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

        <div className="mt-5 space-y-3">
          {data.anomalies.map((item) => (
            <div key={item.id} className="panel-muted analytics-risk-card rounded-2xl p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="analytics-link font-semibold" onClick={() => onSelectUser?.(item.userId)}>
                      {item.user}
                    </button>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-[var(--text-dim)]">
                      {item.type}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${riskToneClass[item.risk]}`}>
                      {item.risk === 'high' ? '🔴 High' : item.risk === 'medium' ? '🟠 Medium' : '🟢 Low'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.detail}</p>
                </div>
                <div className="grid min-w-[190px] grid-cols-2 gap-3 text-sm">
                  <MetricTile label="异常分数" value={`${item.score}`} compact />
                  <MetricTile label="时间" value={item.time} compact />
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
            </p>
          </div>
          <HeatmapGrid cells={data.heatmap} />
        </section>

        <div
          id="analytics-model-preference"
          className={sectionClassName('analytics-model-preference', 'xl:col-span-6 grid gap-4 md:grid-cols-2')}
        >
          <EChartCard
            className="md:col-span-1"
            title="模型使用占比"
            subtitle="支持全平台与单用户偏好对比"
            option={platformModelOption}
            loading={loading}
            empty={data.modelPreference.length === 0}
            height={320}
          />
          <EChartCard
            className="md:col-span-1"
            title="模型偏好对比"
            subtitle="Stacked Bar"
            option={stackedPreferenceOption}
            loading={loading}
            empty={data.modelPreference.length === 0}
            height={320}
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
            <div key={segment.label} className="panel-muted rounded-2xl p-4">
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
            </div>
          ))}
        </div>
        </section>
      </div>

      <section
        id="analytics-user-profile"
        className={sectionClassName('analytics-user-profile', 'glass-panel rounded-[26px] p-5')}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">用户画像分析</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              点击排行榜中的任意用户查看基础指标、趋势变化、模型偏好与风险信号。
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[var(--text-dim)]">
            {data.selectedUserProfile ? `Selected · ${data.selectedUserProfile.user}` : 'No User Selected'}
          </div>
        </div>

        {data.selectedUserProfile ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-4">
                <div className="panel-muted analytics-panel-accent rounded-[22px] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
                        Selected User
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                        {data.selectedUserProfile.user}
                      </h3>
                    </div>
                    <span className="rounded-full border border-[rgba(173,198,255,0.18)] bg-[rgba(77,142,255,0.1)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                      Live Profile
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <MetricTile label="总成本" value={formatMoney(data.selectedUserProfile.totalCost)} />
                    <MetricTile label="总请求数" value={formatNumber(data.selectedUserProfile.totalRequests)} />
                    <MetricTile label="总 Token" value={formatNumber(data.selectedUserProfile.totalTokens)} />
                    <MetricTile label="活跃天数" value={`${data.selectedUserProfile.activeDays}`} />
                  </div>
                </div>

                <div className="panel-muted rounded-[22px] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">风险信号</p>
                    <span className="rounded-full border border-amber-300/15 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                      Watchlist
                    </span>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {data.selectedUserProfile.riskSignals.map((signal) => (
                      <li
                        key={signal}
                        className="rounded-2xl border border-amber-300/15 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                      >
                        {signal}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="panel-muted rounded-[22px] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">活跃时间分布</p>
                  <HeatmapGrid cells={data.selectedUserProfile.activityHeatmap} compact />
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
                  subtitle="Donut Chart"
                  option={{
                    tooltip: { trigger: 'item' },
                    legend: { bottom: 0, textStyle: { color: '#8c909f' } },
                    series: [
                      {
                        type: 'pie',
                        radius: ['48%', '70%'],
                        itemStyle: { borderColor: '#111827', borderWidth: 2 },
                        data: data.selectedUserProfile.modelPreference.map((item, index) => ({
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
                  empty={data.selectedUserProfile.modelPreference.length === 0}
                  height={320}
                />
              </div>
            </div>
        ) : (
          <div className="panel-muted mt-5 rounded-2xl px-5 py-14 text-center text-sm text-[var(--text-dim)]">
            当前没有可展示的用户画像数据。
          </div>
        )}
      </section>
        </div>

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
    </>
  );
}

function InsightMiniCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel-muted analytics-soft-card rounded-[20px] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="analytics-inline-metric flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-3">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--text)]">{value}</span>
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

function HeatmapGrid({
  cells,
  compact = false,
}: {
  cells: Array<{ weekday: string; hour: number; value: number }>;
  compact?: boolean;
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
            <FragmentRow key={weekday} weekday={weekday} hours={hours} cells={cells} max={max} />
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
              className="analytics-heatmap-cell h-6 rounded-md border border-white/6"
              style={{ background: bg }}
            />
        );
      })}
    </>
  );
}
