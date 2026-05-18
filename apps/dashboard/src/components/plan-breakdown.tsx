"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

interface BreakdownItem {
  label: string;
  value: number;
  color?: string;
}

const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function HorizontalBarBreakdown({
  data,
  height = 200,
}: {
  data: BreakdownItem[];
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} horizontal={false} />
          <XAxis
            type="number"
            fontSize={11}
            stroke="currentColor"
            opacity={0.6}
            tickFormatter={(v) => v.toLocaleString("ja-JP")}
          />
          <YAxis
            type="category"
            dataKey="label"
            fontSize={11}
            stroke="currentColor"
            opacity={0.7}
            width={96}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-popover-foreground)",
            }}
            formatter={(value: number) => value.toLocaleString("ja-JP")}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((item, idx) => (
              <Cell
                key={item.label}
                fill={item.color ?? PALETTE[idx % PALETTE.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
