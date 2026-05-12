import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { fetchSpans, fetchMetrics } from '../api/client'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']

export function StatsBar() {
  const { data: spans = [] } = useQuery({
    queryKey: ['spans', '', 500],
    queryFn: () => fetchSpans({ limit: 500 }),
    refetchInterval: 30_000,
  })
  const { data: metrics = [] } = useQuery({
    queryKey: ['metrics', ''],
    queryFn: () => fetchMetrics(),
    refetchInterval: 30_000,
  })

  const serviceCount = new Map<string, number>()
  spans.forEach(s => serviceCount.set(s.service_name, (serviceCount.get(s.service_name) ?? 0) + 1))
  const chartData = [...serviceCount.entries()].map(([name, count]) => ({ name, count }))

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard label="Spans loaded" value={spans.length} />
      <StatCard label="Services" value={serviceCount.size} />
      <StatCard label="Metric series" value={metrics.length} />

      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Spans by service</p>
        {chartData.length === 0 ? (
          <p className="text-gray-500 text-sm">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={60}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', color: '#f3f4f6' }}
                cursor={{ fill: 'rgba(99,102,241,0.1)' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  )
}
