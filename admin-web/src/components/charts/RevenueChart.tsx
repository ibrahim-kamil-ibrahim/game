import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatEtb } from '../../lib/utils';

interface Point {
  label: string;
  revenueSantim: number;
  sessions?: number;
}

export function RevenueChart({ data, height = 280 }: { data: Point[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3ebf6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#6e93bb' }}
            axisLine={false}
            tickLine={false}
            minTickGap={18}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6e93bb' }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(value: number) => `${Math.round(value / 100)}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e3ebf6',
              boxShadow: '0 12px 30px -16px rgba(11,31,58,0.35)',
              fontSize: 12,
            }}
            formatter={(value, name) =>
              name === 'Revenue' ? [formatEtb(Number(value ?? 0)), 'Revenue'] : [String(value ?? ''), String(name)]
            }
            labelStyle={{ fontWeight: 600, color: '#0b1f3a', marginBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="revenueSantim"
            name="Revenue"
            stroke="#2563eb"
            strokeWidth={2.5}
            fill="url(#revenueFill)"
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBars({
  data,
}: {
  data: Array<{ label: string; value: number; caption?: string }>;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-navy-700">{item.label}</span>
            <span className="shrink-0 text-navy-500">{item.caption}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-navy-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
