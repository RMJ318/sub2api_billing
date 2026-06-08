import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'zh-CN' | 'en-US';

type Messages = Record<string, string>;

const messagesByLocale: Record<Locale, Messages> = {
  'zh-CN': {
    'lang.label': '语言',
    'lang.zh': '中文',
    'lang.en': 'English',
    'shell.brand': 'AI 用量分析',
    'shell.brandSub': 'Synthetix',
    'shell.headerEyebrow': '运营驾驶舱',
    'shell.headerTitle': '用量分析',
    'shell.theme': '主题',
    'shell.nav': '导航',
    'nav.dashboard': '总览',
    'nav.users': '用户',
    'nav.models': '模型',
    'nav.keys': '密钥',
    'nav.cost': '成本',
    'user.admin': '管理员',
    'user.role': '系统架构师',
    'page.usageAnalytics': '用量分析',
    'page.billingOverview': '{month} 账单概览',
    'page.description': '查看当前账单周期内的花费、用量、模型结构与风险信号。',
    'toolbar.import': '导入 CSV',
    'toolbar.importing': '导入中...',
    'toolbar.clear': '清空',
    'toolbar.month': '月份',
    'toolbar.from': '开始',
    'toolbar.to': '结束',
    'toolbar.export': '导出 CSV',
    'status.unavailable': '不可用',
    'status.loading': '加载中...',
    'kpi.totalSpend': '总花费',
    'kpi.activeUsers': '活跃用户',
    'kpi.totalRequests': '请求量',
    'kpi.totalTokens': 'Token 量',
    'kpi.budgetUsage': '预算使用率',
    'kpi.forecast': '预测花费',
    'kpi.selectedMonth': '当前月份',
    'kpi.comparedLastMonth': '较上月',
    'chart.dailySpendTrend': '每日消费趋势',
    'chart.dailySpendSubtitle': '展示当前账单周期内的每日花费与请求量。',
    'chart.modelDistribution': '模型分布',
    'chart.modelDistributionSubtitle': '按成本占比查看 GPT、Claude、Gemini 与其他模型。',
    'chart.topUsers': 'TOP 用户',
    'chart.topUsersSubtitle': '按月度花费排序的前 10 名用户。',
    'chart.costBreakdown': '成本构成',
    'chart.costBreakdownSubtitle': '输入、输出、缓存与图片成本分布。',
    'chart.userTrend': '用户趋势',
    'chart.userTrendEmpty': '请选择一个用户查看趋势。',
    'chart.userScatter': '用户活跃分布',
    'chart.userScatterSubtitle': '请求量与花费关系，点大小代表 Token 量。',
    'chart.keyTrend': '密钥趋势',
    'chart.keyTrendEmpty': '请选择一个 API 密钥查看趋势。',
    'chart.modelSpend': '模型花费排行',
    'chart.modelSpendSubtitle': '当前月份按花费排序的主要模型。',
    'chart.modelTokenMix': '模型 Token 结构',
    'chart.modelTokenMixSubtitle': '按模型查看输入、输出与缓存读取 Token。',
    'chart.costTrend': '成本趋势',
    'chart.costTrendSubtitle': '当前月份的每日成本变化。',
    'chart.pareto': '帕累托集中度',
    'chart.paretoSubtitle': '花费在头部用户中的集中情况。',
    'chart.treemap': '成本树图',
    'chart.treemapSubtitle': '按用户、模型、密钥层级查看花费。',
    'signal.center': '信号中心',
    'signal.summary': '预算风险、高消费用户、API 密钥异常与模型成本波动。',
    'signal.unread': '未读',
    'signal.focus': '重点关注',
    'signal.empty': '当前没有可用信号。',
    'signal.history': '查看历史信号',
    'table.userRanking': '用户排行',
    'table.userRankingSubtitle': '按当前月份花费排序的用户。',
    'table.keyRanking': 'API 密钥排行',
    'table.keyRankingSubtitle': '按当前月份花费与请求量查看密钥表现。',
    'table.budgetMonitor': '预算监控',
    'table.budgetMonitorSubtitle': '当前月份预算使用率最高的用户。',
    'table.keyHealth': '密钥健康度',
    'table.keyHealthSubtitle': '汇总长期未用、高频使用与异常增长的 API 密钥。',
    'table.searchUser': '搜索用户',
    'table.searchKey': '搜索密钥',
    'table.user': '用户',
    'table.owner': '归属人',
    'table.key': '密钥',
    'table.spend': '花费',
    'table.requests': '请求量',
    'table.tokens': 'Token',
    'table.apiKeys': '密钥数',
    'table.deleted': '已删除',
    'table.emptyUsers': '没有符合当前搜索条件的用户。',
    'table.emptyKeys': '没有符合当前搜索条件的 API 密钥。',
    'health.longUnused': '长期未使用',
    'health.highFrequency': '高频使用',
    'health.abnormalGrowth': '异常增长',
    'import.success': '已从 {count} 个文件导入 {records} 条记录。',
    'import.error': 'CSV 导入失败。',
    'misc.open': '打开',
    'misc.noData': '当前筛选条件下暂无数据。',
    'cost.input': '输入',
    'cost.output': '输出',
    'cost.cacheCreate': '缓存写入',
    'cost.cacheRead': '缓存读取',
    'cost.image': '图片',
  },
  'en-US': {
    'lang.label': 'Language',
    'lang.zh': '中文',
    'lang.en': 'English',
    'shell.brand': 'AI Usage Analytics',
    'shell.brandSub': 'Synthetix',
    'shell.headerEyebrow': 'Operations Dashboard',
    'shell.headerTitle': 'Usage Analytics',
    'shell.theme': 'Theme',
    'shell.nav': 'Navigation',
    'nav.dashboard': 'Dashboard',
    'nav.users': 'Users',
    'nav.models': 'Models',
    'nav.keys': 'Keys',
    'nav.cost': 'Cost',
    'user.admin': 'Admin User',
    'user.role': 'System Architect',
    'page.usageAnalytics': 'Usage Analytics',
    'page.billingOverview': '{month} Billing Overview',
    'page.description': 'Review spend, usage, model mix, and risk signals for the current billing window.',
    'toolbar.import': 'Import CSV',
    'toolbar.importing': 'Importing...',
    'toolbar.clear': 'Clear',
    'toolbar.month': 'Month',
    'toolbar.from': 'From',
    'toolbar.to': 'To',
    'toolbar.export': 'Export CSV',
    'status.unavailable': 'Unavailable',
    'status.loading': 'Loading...',
    'kpi.totalSpend': 'Total Spend',
    'kpi.activeUsers': 'Active Users',
    'kpi.totalRequests': 'Requests',
    'kpi.totalTokens': 'Tokens',
    'kpi.budgetUsage': 'Budget Usage',
    'kpi.forecast': 'Forecast',
    'kpi.selectedMonth': 'Selected Month',
    'kpi.comparedLastMonth': 'vs last month',
    'chart.dailySpendTrend': 'Daily Spend Trend',
    'chart.dailySpendSubtitle': 'Daily spend and request volume for the active billing month.',
    'chart.modelDistribution': 'Model Distribution',
    'chart.modelDistributionSubtitle': 'Cost share across GPT, Claude, Gemini, and Others.',
    'chart.topUsers': 'Top Users',
    'chart.topUsersSubtitle': 'Top 10 users by spend in the active month.',
    'chart.costBreakdown': 'Cost Breakdown',
    'chart.costBreakdownSubtitle': 'Input, output, cache, and image cost composition.',
    'chart.userTrend': 'User Trend',
    'chart.userTrendEmpty': 'Select a user to inspect trends.',
    'chart.userScatter': 'User Activity Scatter',
    'chart.userScatterSubtitle': 'Requests vs spend, sized by token volume.',
    'chart.keyTrend': 'Key Trend',
    'chart.keyTrendEmpty': 'Select an API key to inspect trends.',
    'chart.modelSpend': 'Model Spend Ranking',
    'chart.modelSpendSubtitle': 'Top models by spend in the selected month.',
    'chart.modelTokenMix': 'Model Token Mix',
    'chart.modelTokenMixSubtitle': 'Input, output, and cache-read tokens by model.',
    'chart.costTrend': 'Cost Trend',
    'chart.costTrendSubtitle': 'Daily spend for the selected month.',
    'chart.pareto': 'Pareto Concentration',
    'chart.paretoSubtitle': 'How much spend is concentrated in the top cohorts.',
    'chart.treemap': 'Cost Treemap',
    'chart.treemapSubtitle': 'Spend grouped by user, then model, then API key.',
    'signal.center': 'Signal Center',
    'signal.summary': 'Budget risk, high spend users, API key anomalies, and model cost spikes.',
    'signal.unread': 'Unread',
    'signal.focus': 'Focus',
    'signal.empty': 'No signals available.',
    'signal.history': 'Audit Signal History',
    'table.userRanking': 'User Ranking',
    'table.userRankingSubtitle': 'Top users by spend for the selected month.',
    'table.keyRanking': 'API Key Ranking',
    'table.keyRankingSubtitle': 'Spend and usage by API key for the selected month.',
    'table.budgetMonitor': 'Budget Monitor',
    'table.budgetMonitorSubtitle': 'Highest utilization users for the selected month.',
    'table.keyHealth': 'Key Health',
    'table.keyHealthSubtitle': 'Summary of long-unused, high-frequency, and abnormal-growth API keys.',
    'table.searchUser': 'Search user',
    'table.searchKey': 'Search key',
    'table.user': 'User',
    'table.owner': 'Owner',
    'table.key': 'Key',
    'table.spend': 'Spend',
    'table.requests': 'Requests',
    'table.tokens': 'Tokens',
    'table.apiKeys': 'API Keys',
    'table.deleted': 'Deleted',
    'table.emptyUsers': 'No users match the current search.',
    'table.emptyKeys': 'No API keys match the current search.',
    'health.longUnused': 'Long Unused',
    'health.highFrequency': 'High Frequency',
    'health.abnormalGrowth': 'Abnormal Growth',
    'import.success': 'Imported {records} records from {count} file(s).',
    'import.error': 'CSV import failed.',
    'misc.open': 'Open',
    'misc.noData': 'No data available for the current selection.',
    'cost.input': 'Input',
    'cost.output': 'Output',
    'cost.cacheCreate': 'Cache Create',
    'cost.cacheRead': 'Cache Read',
    'cost.image': 'Image',
  },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('zh-CN');

  useEffect(() => {
    const stored = window.localStorage.getItem('usage-analytics-locale');
    if (stored === 'zh-CN' || stored === 'en-US') {
      setLocale(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('usage-analytics-locale', locale);
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => {
        const template = messagesByLocale[locale][key] ?? key;
        if (!vars) return template;
        return Object.entries(vars).reduce(
          (result, [name, replacement]) =>
            result.replaceAll(`{${name}}`, String(replacement)),
          template,
        );
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
