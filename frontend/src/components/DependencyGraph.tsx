import { useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import ForceGraph2D from 'react-force-graph-2d'
import { fetchGraph } from '../api/client'

interface GraphNode {
  id: string
}

interface GraphLink {
  source: string
  target: string
  call_count: number
}

export function DependencyGraph() {
  const fgRef = useRef<{ zoomToFit: (ms: number) => void } | null>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['graph'],
    queryFn: fetchGraph,
    refetchInterval: 30_000,
  })

  const nodes: GraphNode[] = (data?.nodes ?? []).map(id => ({ id }))
  const links: GraphLink[] = (data?.edges ?? []).map(e => ({
    source: e.caller,
    target: e.callee,
    call_count: e.call_count,
  }))

  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(400)
  }, [])

  const paintNode = useCallback((node: GraphNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D) => {
    const radius = 18
    const x = node.x ?? 0
    const y = node.y ?? 0

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = '#4f46e5'
    ctx.fill()
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.font = '8px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#e0e7ff'

    const label = (node.id as string).length > 14 ? (node.id as string).slice(0, 13) + '…' : node.id as string
    ctx.fillText(label, x, y)
  }, [])

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Service Dependency Graph</h2>
        <div className="flex items-center gap-2">
          {isFetching && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
          <span className="text-xs text-gray-400">{nodes.length} nodes · {links.length} edges</span>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          No service graph data yet
        </div>
      ) : (
        <ForceGraph2D
          ref={fgRef as never}
          graphData={{ nodes, links }}
          width={undefined}
          height={320}
          backgroundColor="#1f2937"
          nodeCanvasObject={paintNode as never}
          nodeCanvasObjectMode={() => 'replace'}
          linkColor={() => '#4b5563'}
          linkWidth={link => Math.max(1, Math.log((link as GraphLink).call_count + 1))}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={2}
          linkDirectionalParticleColor={() => '#818cf8'}
          linkDirectionalParticleSpeed={0.004}
          onEngineStop={handleEngineStop}
          cooldownTicks={120}
        />
      )}
    </div>
  )
}
