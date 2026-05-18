"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type ChartPoint = Record<string, string | number>;

export interface StackSeriesDef {
  key: string;
  label: string;
  color: string;
}

interface StackedBarChartProps {
  data: ChartPoint[];
  xKey: string;
  series: StackSeriesDef[];
  height?: number;
}

export function StackedBarChart({
  data,
  xKey,
  series,
  height = 280,
}: StackedBarChartProps) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
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
            tickFormatter={(v) => v.toLocaleString("ja-JP")}
            width={56}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-popover-foreground)",
            }}
            formatter={(value: number, name: string) => [
              value.toLocaleString("ja-JP"),
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            iconSize={8}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="stack"
              fill={s.color}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
