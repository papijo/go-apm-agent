import { useState } from 'react'
import { HealthBadge } from './HealthBadge'
import { StatsBar } from './StatsBar'
import { SpansTable } from './SpansTable'
import { MetricsTable } from './MetricsTable'
import { DependencyGraph } from './DependencyGraph'

type Tab = 'spans' | 'metrics' | 'graph'

export function Dashboard() {
  const [tab, setTab] = useState<Tab>('spans')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Observability Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">Distributed Observability Agent</p>
          </div>
          <HealthBadge />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <StatsBar />

        <div className="flex gap-1 border-b border-gray-800">
          {(['spans', 'metrics', 'graph'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t === 'graph' ? 'Dependency Graph' : t}
            </button>
          ))}
        </div>

        {tab === 'spans' && <SpansTable />}
        {tab === 'metrics' && <MetricsTable />}
        {tab === 'graph' && <DependencyGraph />}
      </main>
    </div>
  )
}
