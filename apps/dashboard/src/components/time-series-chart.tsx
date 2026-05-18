"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type ChartPoint = Record<string, string | number>;

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

interface TimeSeriesChartProps {
  data: ChartPoint[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  /** 数値フォーマット（軸とTooltipに適用）。デフォルトはローカライズ */
  formatValue?: (value: number) => string;
}

const DEFAULT_FORMATTER = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString("ja-JP") : "-";

export function TimeSeriesChart({
  data,
  xKey,
  series,
  height = 280,
  formatValue = DEFAULT_FORMATTER,
}: TimeSeriesChartProps) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient
                key={s.key}
                id={`grad-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey={xKey}
            fontSize={11}
            tickMargin={6}
            stroke="currentColor"
            opacity={0.6}
          />
          <YAxis
            fontSize={11}
            stroke="currentColor"
            opacity={0.6}
            tickFormatter={formatValue}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-popover-foreground)",
            }}
            formatter={(value: number, name: string) => [formatValue(value), name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            iconSize={8}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={`url(#grad-${s.key})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
