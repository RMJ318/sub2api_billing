import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

export interface EChartCardProps {
  title: string;
  option?: EChartsOption;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  subtitle?: ReactNode;
  height?: number;
  className?: string;
}

export function EChartCard({
  title,
  option,
  loading = false,
  empty = false,
  emptyMessage = 'No data available for the current selection.',
  subtitle,
  height = 320,
  className,
}: EChartCardProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || empty) {
      return;
    }

    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    if (option) {
      chart.setOption(option);
    }

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [empty]);

  useEffect(() => {
    if (!chartRef.current || empty) {
      return;
    }
    chartRef.current.setOption(option ?? {}, true);
  }, [option, empty]);

  useEffect(() => {
    if (!chartRef.current || empty) {
      return;
    }
    if (loading) {
      chartRef.current.showLoading('default', {
        text: 'Loading chart...',
        color: '#adc6ff',
        textColor: '#c2c6d6',
        maskColor: 'rgba(13, 19, 34, 0.3)',
      });
    } else {
      chartRef.current.hideLoading();
    }
  }, [loading, empty]);

  return (
    <section className={`glass-panel rounded-3xl p-5 ${className ?? 'span-6'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-[var(--text)]">{title}</h2>
          {subtitle ? (
            <div className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{subtitle}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[var(--text-dim)]">
          <button
            type="button"
            aria-label={`${title} menu`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10"
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {empty ? (
        <div
          className="panel-muted mt-4 flex items-center justify-center rounded-2xl border border-dashed border-[var(--border-soft)] px-4 text-sm text-[var(--text-muted)]"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="mt-4 w-full rounded-2xl"
          style={{ height }}
          aria-label={`${title} chart`}
        />
      )}
    </section>
  );
}

function MenuIcon(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4z" />
    </svg>
  );
}