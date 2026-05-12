import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSpans, fetchGraph } from '../api/client'

const LIMITS = [25, 50, 100, 250, 500]

export function SpansTable() {
  const [service, setService] = useState('')
  const [limit, setLimit] = useState(50)

  const { data: graph } = useQuery({
    queryKey: ['graph'],
    queryFn: fetchGraph,
    refetchInterval: 30_000,
  })

  const { data: spans = [], isFetching } = useQuery({
    queryKey: ['spans', service, limit],
    queryFn: () => fetchSpans({ service_name: service, limit }),
    refetchInterval: 30_000,
  })

  const services = graph?.nodes ?? []

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Spans</h2>
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
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {LIMITS.map(l => (
              <option key={l} value={l}>Last {l}</option>
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
              <th className="text-left px-4 py-3">Operation</th>
              <th className="text-left px-4 py-3">Trace ID</th>
              <th className="text-right px-4 py-3">Duration (ms)</th>
              <th className="text-left px-4 py-3">Started At</th>
            </tr>
          </thead>
          <tbody>
            {spans.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-500 py-8">No spans found</td>
              </tr>
            ) : (
              spans.map(span => (
                <tr key={span.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="inline-block bg-indigo-900/60 text-indigo-300 text-xs px-2 py-0.5 rounded-full">
                      {span.service_name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-200 font-mono text-xs">{span.operation}</td>
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{span.trace_id.slice(0, 16)}…</td>
                  <td className="px-4 py-2.5 text-right">
                    {span.duration_ms != null ? (
                      <span className={`font-mono text-xs ${span.duration_ms > 100 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {span.duration_ms.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">
                    {new Date(span.started_at).toLocaleString()}
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
