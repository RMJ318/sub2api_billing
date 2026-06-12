from pathlib import Path

p = Path(r"d:\projects\sub2api-billing\sub2api-billing\packages\web\src\App.tsx")
text = p.read_text(encoding="utf-8")

text = text.replace(
    "import { importCsvFile } from './lib/api.js';\n",
    "import { importCsvFile } from './lib/api.js';\nimport { buildAdvancedAnalyticsData } from './lib/advancedAnalytics.js';\n",
)

text = text.replace(
"""  const formatKpiDelta = (deltaPct: number): string => {
    const arrow = deltaPct >= 0 ? '↑' : '↓';
    return `${arrow} ${Math.abs(deltaPct).toFixed(1)}% ${t('kpi.comparedLastMonth')}`;
  };
""",
"""  const formatKpiDelta = (deltaPct: number): string => {
    const arrow = deltaPct >= 0 ? '↑' : '↓';
    return `${arrow} ${Math.abs(deltaPct).toFixed(1)}% ${t('kpi.comparedLastMonth')}`;
  };

  const calcPctChange = (current: number, previous: number): number => {
    if (previous <= 0) {
      if (current <= 0) return 0;
      return 100;
    }
    return Number((((current - previous) / previous) * 100).toFixed(1));
  };
""",
)

text = text.replace(
"""  const openUserProfilePage = (userId: string) => {
    setAdvancedAnalyticsGlobalView(false);
    setSelectedUserId(userId);
    navigate(`/advanced-analytics/users/${encodeURIComponent(userId)}`);
  };
""",
"""  const openUserProfilePage = (userId: string) => {
    setAdvancedAnalyticsGlobalView(false);
    setSelectedUserId(userId);
    navigate(`/advanced-analytics/users/${encodeURIComponent(userId)}`);
  };

  const openAdvancedAnalyticsOverview = () => {
    setAdvancedAnalyticsGlobalView(true);
    setSelectedUserId(null);
    navigate('/advanced-analytics');
  };
""",
)

text = text.replace(
"""  const costTreemapOption = useMemo<EChartsOption | undefined>(() => {
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
""",
"""  const costTreemapOption = useMemo<EChartsOption | undefined>(() => {
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

  const totalSpendDelta = calcPctChange(
    Number(dashboardData?.kpis.totalSpendUsd ?? 0),
    Number(previousDashboardData?.kpis.totalSpendUsd ?? 0),
  );
  const activeUsersDelta = calcPctChange(
    dashboardData?.kpis.activeUserCount ?? 0,
    previousDashboardData?.kpis.activeUserCount ?? 0,
  );
  const totalRequestsDelta = calcPctChange(
    dashboardData?.kpis.totalRequestCount ?? 0,
    previousDashboardData?.kpis.totalRequestCount ?? 0,
  );
  const totalTokensDelta = calcPctChange(
    dashboardData?.kpis.totalTokenCount ?? 0,
    previousDashboardData?.kpis.totalTokenCount ?? 0,
  );

  const topCostUser = overviewAnalytics.rankingTabs.cost[0];
  const topGrowthUser = overviewAnalytics.growth.requests[0];
  const topRiskUser = overviewAnalytics.anomalies[0];
  const leadingModel = [...overviewAnalytics.modelPreference].sort((a, b) => b.value - a.value)[0];
""",
)

old_home = """      {activePath === '/' ? (
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
"""

new_home = """      {activePath === '/' ? (
        <>
          <DashboardSummaryCard
            title={t('kpi.totalSpend')}
            value={dashboardQuery.data?.kpis.totalSpendUsd !== undefined ? formatMoney(dashboardQuery.data.kpis.totalSpendUsd) : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')}
            change={formatKpiDelta(totalSpendDelta)}
            hint={topCostUser ? `Top 用户 ${topCostUser.user} 占比 ${topCostUser.sharePct.toFixed(1)}%` : t('kpi.comparedLastMonth')}
            tone="primary"
            onClick={openAdvancedAnalyticsOverview}
            actionLabel="查看成本洞察"
          />
          <DashboardSummaryCard
            title={t('kpi.activeUsers')}
            value={dashboardQuery.data?.kpis.activeUserCount !== undefined ? dashboardQuery.data.kpis.activeUserCount : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')}
            change={formatKpiDelta(activeUsersDelta)}
            hint={overviewAnalytics.segments[0] ? `${overviewAnalytics.segments[0].label} ${overviewAnalytics.segments[0].count} 人` : t('kpi.comparedLastMonth')}
            tone="success"
            onClick={() => navigate('/users')}
            actionLabel="查看用户分层"
          />
          <DashboardSummaryCard
            title={t('kpi.totalRequests')}
            value={dashboardData?.kpis.totalRequestCount !== undefined ? dashboardData.kpis.totalRequestCount.toLocaleString() : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')}
            change={formatKpiDelta(totalRequestsDelta)}
            hint={topGrowthUser ? `增长最快 ${topGrowthUser.user} ${topGrowthUser.growthPct >= 0 ? '+' : ''}${topGrowthUser.growthPct.toFixed(1)}%` : t('kpi.comparedLastMonth')}
            tone="primary"
            onClick={() => navigate('/users')}
            actionLabel="查看增长用户"
          />
          <DashboardSummaryCard
            title={t('kpi.totalTokens')}
            value={dashboardData?.kpis.totalTokenCount !== undefined ? dashboardData.kpis.totalTokenCount.toLocaleString() : dashboardQuery.isLoading ? t('status.loading') : t('status.unavailable')}
            change={formatKpiDelta(totalTokensDelta)}
            hint={leadingModel ? `主力模型 ${leadingModel.name}` : t('kpi.comparedLastMonth')}
            tone="warning"
            onClick={() => navigate('/models')}
            actionLabel="查看模型偏好"
          />

          <section className="glass-panel span-12 rounded-[26px] p-5 lg:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-dim)]">
                  Overview Optimized
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                  把 Advanced Analytics 的关键结论前置到总览
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  首页先展示头部成本、增长用户、风险异常和模型集中度，让你先看结论，再决定是否进入深度分析。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openAdvancedAnalyticsOverview}
                  className="inline-flex h-10 items-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:brightness-110"
                >
                  打开 Advanced Analytics
                </button>
                {topRiskUser ? (
                  <button
                    type="button"
                    onClick={() => openUserProfilePage(topRiskUser.userId)}
                    className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
                  >
                    查看最高风险用户
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              {overviewAnalytics.aiInsight.summary.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.targetUserId) {
                      openUserProfilePage(item.targetUserId);
                      return;
                    }
                    openAdvancedAnalyticsOverview();
                  }}
                  className="rounded-2xl border border-[var(--border-soft)] bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/10"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                    Insight
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text)]">{item.text}</p>
                </button>
              ))}
            </div>
          </section>

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
            {topRiskUser ? (
              <button
                type="button"
                onClick={() => openUserProfilePage(topRiskUser.userId)}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-red-300 transition hover:text-red-200"
              >
                <span>最高风险：{topRiskUser.user}</span>
                <span aria-hidden="true">↗</span>
              </button>
            ) : null}
          </section>
          <EChartCard className="span-4" title={t('chart.modelDistribution')} subtitle={t('chart.modelDistributionSubtitle')} option={modelShareOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData} height={320} />
          <EChartCard className="span-4" title={t('chart.topUsers')} subtitle={t('chart.topUsersSubtitle')} option={topUsersOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData || dashboardData.topUserSpend.length === 0} height={320} />
          <EChartCard className="span-8" title={t('chart.costBreakdown')} subtitle={t('chart.costBreakdownSubtitle')} option={costCompositionOption} loading={dashboardQuery.isLoading} empty={!hasDashboardData} height={320} />
        </>
      ) : null}
"""

if old_home not in text:
    raise SystemExit("home block not found")
text = text.replace(old_home, new_home)

p.write_text(text, encoding="utf-8")
print("patched")
