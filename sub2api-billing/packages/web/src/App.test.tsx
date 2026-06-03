import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

function renderApp() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App dashboard shell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dashboard KPI cards after loading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-06', '2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '123.45',
                activeUserCount: 8,
                totalRequestCount: 99,
                totalTokenCount: 4567,
                totalApiKeyCount: 4,
                avgResponseMs: 1200,
                budgetUsageRatePct: 12.3,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [
                {
                  apiKeyId: 'key-1',
                  apiKeyName: 'Primary Key',
                  spend: '42.00',
                  requestCount: 12,
                  ownerLabel: 'Alice',
                  deleted: true,
                },
              ],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys/k1/trend')) {
          return new Response(
            JSON.stringify({
              spend: [{ bucket: '2026-05-01', value: '12.3' }],
              requests: [{ bucket: '2026-05-01', value: '20' }],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(
            JSON.stringify({
              unreadCount: 1,
              signals: [
                {
                  id: 'signal-1',
                  group: 'high_spend',
                  severity: 'warning',
                  message: 'Spend spike detected.',
                  target: { page: '/users', entityId: 'user-1' },
                  read: false,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Total Spend')).toBeInTheDocument();
      expect(screen.getByText('$123.45')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });

  it('renders deleted indicator on keys page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-06', '2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '0',
                activeUserCount: 0,
                totalRequestCount: 0,
                totalTokenCount: 0,
                totalApiKeyCount: 0,
                avgResponseMs: 0,
                budgetUsageRatePct: 0,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [
                {
                  apiKeyId: 'key-1',
                  apiKeyName: 'Primary Key',
                  spend: '42.00',
                  requestCount: 12,
                  ownerLabel: 'Alice',
                  deleted: true,
                },
              ],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(
            JSON.stringify({
              unreadCount: 0,
              signals: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/models') || url.includes('/api/cost')) {
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    screen.getByText('Keys').click();

    await waitFor(() => {
      expect(screen.getByText('Deleted')).toBeInTheDocument();
    });
  });

  it('uses dynamic months and renders export link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-06', '2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '0',
                activeUserCount: 0,
                totalRequestCount: 0,
                totalTokenCount: 0,
                totalApiKeyCount: 0,
                avgResponseMs: 0,
                budgetUsageRatePct: 0,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys/k1/trend')) {
          return new Response(
            JSON.stringify({
              spend: [{ bucket: '2026-05-01', value: '12.3' }],
              requests: [{ bucket: '2026-05-01', value: '20' }],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(JSON.stringify({ unreadCount: 0, signals: [] }), {
            status: 200,
          });
        }
        if (url.includes('/api/models') || url.includes('/api/cost')) {
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByDisplayValue('2026-06')).toBeInTheDocument();
    });

    const exportLink = screen.getByText('Export CSV');
    expect(exportLink.getAttribute('href')).toContain(
      '/api/export?pageName=dashboard&billingMonth=2026-06',
    );
  });

  it('renders users page sections after navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '1',
                activeUserCount: 1,
                totalRequestCount: 1,
                totalTokenCount: 1,
                totalApiKeyCount: 1,
                avgResponseMs: 1,
                budgetUsageRatePct: 1,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [
                {
                  userId: 'u1',
                  label: 'Alice',
                  spend: '10.50',
                  requestCount: 120,
                  totalTokens: 3000,
                  apiKeyCount: 2,
                },
              ],
              budgetMonitor: [
                {
                  userId: 'u1',
                  label: 'Alice',
                  usedUsd: '10.50',
                  limitUsd: '1000',
                  remainingUsd: '989.50',
                  usagePct: 1.05,
                  style: 'normal',
                },
              ],
              activityScatter: [
                {
                  id: 'u1',
                  label: 'Alice',
                  x: 120,
                  y: 10.5,
                  size: 3000,
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(JSON.stringify({ unreadCount: 0, signals: [] }), {
            status: 200,
          });
        }
        if (url.includes('/api/models') || url.includes('/api/cost')) {
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Users'));

    await waitFor(() => {
      expect(screen.getByText('User Ranking')).toBeInTheDocument();
      expect(screen.getByText('Budget Monitor')).toBeInTheDocument();
      expect(screen.getByText('User Activity Scatter')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Alice'));

    await waitFor(() => {
      expect(
        screen.getByText('Daily spend and request trend for user u1.'),
      ).toBeInTheDocument();
    });
  });

  it('opens signal drawer and navigates on signal click', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '1',
                activeUserCount: 1,
                totalRequestCount: 1,
                totalTokenCount: 1,
                totalApiKeyCount: 1,
                avgResponseMs: 1,
                budgetUsageRatePct: 1,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(
            JSON.stringify({
              unreadCount: 1,
              signals: [
                {
                  id: 'signal-1',
                  group: 'high_spend',
                  severity: 'warning',
                  message: 'Spend spike detected.',
                  target: { page: '/users', entityId: 'user-1' },
                  read: false,
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/models') || url.includes('/api/cost')) {
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Notifications'));

    await waitFor(() => {
      expect(screen.getByText('Signal Center')).toBeInTheDocument();
      expect(screen.getByText('Spend spike detected.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Spend spike detected.'));

    await waitFor(() => {
      expect(screen.getByText('Current page:')).toBeInTheDocument();
      expect(screen.getByText('/users')).toBeInTheDocument();
    });
  });

  it('updates export link when navigating to users page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '0',
                activeUserCount: 0,
                totalRequestCount: 0,
                totalTokenCount: 0,
                totalApiKeyCount: 0,
                avgResponseMs: 0,
                budgetUsageRatePct: 0,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(JSON.stringify({ unreadCount: 0, signals: [] }), {
            status: 200,
          });
        }
        if (url.includes('/api/models') || url.includes('/api/cost')) {
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Users'));

    await waitFor(() => {
      const exportLink = screen.getByText('Export CSV');
      expect(exportLink.getAttribute('href')).toContain(
        '/api/export?pageName=users&billingMonth=2026-05',
      );
    });
  });

  it('renders keys health and trend sections after navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '0',
                activeUserCount: 0,
                totalRequestCount: 0,
                totalTokenCount: 0,
                totalApiKeyCount: 0,
                avgResponseMs: 0,
                budgetUsageRatePct: 0,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [
                {
                  apiKeyId: 'k1',
                  apiKeyName: 'Primary Key',
                  spend: '88.00',
                  requestCount: 200,
                  ownerLabel: 'Alice',
                  deleted: false,
                },
              ],
              keyHealth: {
                longUnused: [{}],
                highFrequency: [{}, {}],
                abnormalGrowth: [{}],
              },
              allKeysDailyTrend: {
                spend: [{ bucket: '2026-05-01', value: '12.3' }],
                requests: [{ bucket: '2026-05-01', value: '20' }],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(JSON.stringify({ unreadCount: 0, signals: [] }), {
            status: 200,
          });
        }
        if (url.includes('/api/models') || url.includes('/api/cost')) {
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText('Keys')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Keys'));

    await waitFor(() => {
      expect(screen.getByText('API Key Ranking')).toBeInTheDocument();
      expect(screen.getByText('Key Health')).toBeInTheDocument();
      expect(screen.getByText('Selected Key Daily Trend')).toBeInTheDocument();
      expect(screen.getByText('Long Unused')).toBeInTheDocument();
      expect(screen.getByText('High Frequency')).toBeInTheDocument();
      expect(screen.getByText('Abnormal Growth')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Primary Key'));

    await waitFor(() => {
      expect(
        screen.getByText('Daily spend trend for API key k1.'),
      ).toBeInTheDocument();
    });

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
      String(call[0]).includes('/api/keys/k1/trend?billingMonth=2026-05'),
    )).toBe(true);
  });

  it('renders models page charts after navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '0',
                activeUserCount: 0,
                totalRequestCount: 0,
                totalTokenCount: 0,
                totalApiKeyCount: 0,
                avgResponseMs: 0,
                budgetUsageRatePct: 0,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/models')) {
          return new Response(
            JSON.stringify({
              spendRanking: [{ model: 'gpt-5.5', spend: '123.4' }],
              requestRanking: [{ model: 'gpt-5.5', requestCount: 99 }],
              tokenStacks: [
                {
                  model: 'gpt-5.5',
                  inputTokens: 100,
                  outputTokens: 50,
                  cacheReadTokens: 20,
                },
              ],
              efficiencyScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/cost')) {
          return new Response('{}', { status: 200 });
        }
        if (url.includes('/api/signals')) {
          return new Response(JSON.stringify({ unreadCount: 0, signals: [] }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText('Models')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Models'));

    await waitFor(() => {
      expect(screen.getByText('Model Spend Ranking')).toBeInTheDocument();
      expect(screen.getByText('Model Token Mix')).toBeInTheDocument();
    });
  });

  it('renders cost page charts and forecast after navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/health')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (url.includes('/api/metadata/months')) {
          return new Response(JSON.stringify({ months: ['2026-05'] }), {
            status: 200,
          });
        }
        if (url.includes('/api/dashboard')) {
          return new Response(
            JSON.stringify({
              kpis: {
                totalSpendUsd: '0',
                activeUserCount: 0,
                totalRequestCount: 0,
                totalTokenCount: 0,
                totalApiKeyCount: 0,
                avgResponseMs: 0,
                budgetUsageRatePct: 0,
              },
              dailyTrends: { spend: [], requests: [], tokens: [] },
              topUserSpend: [],
              modelFamilyShare: { GPT: '0', Claude: '0', Gemini: '0', Other: '0' },
              costComposition: {
                input: '0',
                output: '0',
                cacheCreation: '0',
                cacheRead: '0',
                imageOutput: '0',
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/users')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              budgetMonitor: [],
              activityScatter: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/keys')) {
          return new Response(
            JSON.stringify({
              rankings: [],
              keyHealth: { longUnused: [], highFrequency: [], abnormalGrowth: [] },
              allKeysDailyTrend: { spend: [], requests: [] },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/models')) {
          return new Response('{}', { status: 200 });
        }
        if (url.includes('/api/cost')) {
          return new Response(
            JSON.stringify({
              trend: {
                daily: [{ bucket: '2026-05-01', value: '10.5' }],
                weekly: [],
                monthly: [],
              },
              pareto: { top10: 45, top20: 67, top30: 82 },
              forecast: {
                projectedMonthEndSpendUsd: '500.00',
                averageDailySpendUsd: '12.50',
                remainingDays: 10,
                projectedDaysToBudget: 40,
                isOverBudget: false,
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/signals')) {
          return new Response(JSON.stringify({ unreadCount: 0, signals: [] }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText('Cost')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cost'));

    await waitFor(() => {
      expect(screen.getByText('Cost Trend')).toBeInTheDocument();
      expect(screen.getByText('Pareto Concentration')).toBeInTheDocument();
      expect(screen.getByText('Forecast')).toBeInTheDocument();
      expect(screen.getByText('$500.00')).toBeInTheDocument();
    });
  });
});
