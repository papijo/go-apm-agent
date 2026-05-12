import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMetrics, fetchGraph } from '../api/client'

export function MetricsTable() {
  const [service, setService] = useState('')

  const { data: graph } = useQuery({
    queryKey: ['graph'],
    queryFn: fetchGraph,
    refetchInterval: 30_000,
  })

  const { data: metrics = [], isFetching } = useQuery({
    queryKey: ['metrics', service],
    queryFn: () => fetchMetrics({ service_name: service }),
    refetchInterval: 30_000,
  })

  const services = graph?.nodes ?? []

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Metrics</h2>
        <div className="flex items-center gap-3">
          <select
            value={service}
            onChange={e => setService(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All services</option>
            {services.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {isFetching && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-700">
              <th className="text-left px-4 py-3">Service</th>
              <th className="text-left px-4 py-3">Metric</th>
              <th className="text-right px-4 py-3">Value</th>
              <th className="text-left px-4 py-3">Unit</th>
              <th className="text-left px-4 py-3">Recorded At</th>
            </tr>
          </thead>
          <tbody>
            {metrics.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-500 py-8">No metrics found</td>
              </tr>
            ) : (
              metrics.map(m => (
                <tr key={m.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="inline-block bg-purple-900/60 text-purple-300 text-xs px-2 py-0.5 rounded-full">
                      {m.service_name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-200 font-mono text-xs">{m.metric_name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-400">
                    {m.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{m.unit ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">
                    {new Date(m.recorded_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
