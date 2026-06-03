import {
  useEffect,
  useRef,
  type JSX,
  type ReactNode,
} from 'react';
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
}

export function EChartCard({
  title,
  option,
  loading = false,
  empty = false,
  emptyMessage = 'No data available for the current selection.',
  subtitle,
  height = 320,
}: EChartCardProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || empty) {
      return;
    }

    const chart = echarts.init(container);
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
      });
    } else {
      chartRef.current.hideLoading();
    }
  }, [loading, empty]);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
            {title}
          </h2>
          {subtitle ? (
            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>

      {empty ? (
        <div
          className="mt-4 flex items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-400"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="mt-4 w-full"
          style={{ height }}
          aria-label={`${title} chart`}
        />
      )}
    </section>
  );
}
