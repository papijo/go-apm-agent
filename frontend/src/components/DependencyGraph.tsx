import { useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import ForceGraph2D from 'react-force-graph-2d'
import { fetchGraph } from '../api/client'

interface GraphNode {
  id: string
  x?: number
  y?: number
}

interface GraphLink {
  source: string
  target: string
  call_count: number
}

interface FgRef {
  zoomToFit: (duration: number, padding?: number) => void
  zoom: (scale: number, duration?: number) => void
  d3Force: (name: string) => { strength: (v: number) => void } | undefined
}

const NODE_RADIUS = 12

export function DependencyGraph() {
  const fgRef = useRef<FgRef | null>(null)

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
    fgRef.current?.zoomToFit(400, 80)
  }, [])

  const handleRef = useCallback((el: FgRef | null) => {
    fgRef.current = el
    if (el) {
      el.d3Force('charge')?.strength(-400)
    }
  }, [])

  // globalScale is the third argument — use it to keep label size constant in screen pixels
  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0

      // Glow
      ctx.beginPath()
      ctx.arc(x, y, NODE_RADIUS + 4, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(99,102,241,0.18)'
      ctx.fill()

      // Circle
      ctx.beginPath()
      ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI)
      ctx.fillStyle = '#4f46e5'
      ctx.fill()
      ctx.strokeStyle = '#818cf8'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Label — font size is fixed at 12 screen-pixels regardless of zoom
      const fontSize = 12 / globalScale
      ctx.font = `bold ${fontSize}px Inter, ui-sans-serif, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#e0e7ff'
      const label = node.id.length > 20 ? node.id.slice(0, 19) + '…' : node.id
      ctx.fillText(label, x, y + NODE_RADIUS + 3 / globalScale)
    },
    [],
  )

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Service Dependency Graph
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Lines show which services call each other · arrows show direction · line thickness reflects call volume
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
          <span className="text-xs text-gray-400">{nodes.length} nodes · {links.length} edges</span>
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => fgRef.current?.zoom((fgRef.current as unknown as { zoom: (s: number) => number }).zoom(0) * 1.4, 200)}
              className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm font-bold transition-colors"
              title="Zoom in"
            >+</button>
            <button
              onClick={() => fgRef.current?.zoom((fgRef.current as unknown as { zoom: (s: number) => number }).zoom(0) / 1.4, 200)}
              className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm font-bold transition-colors"
              title="Zoom out"
            >−</button>
            <button
              onClick={() => fgRef.current?.zoomToFit(300, 80)}
              className="px-2 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs transition-colors"
              title="Fit all nodes"
            >Fit</button>
          </div>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-500 text-sm">
          <span>No service graph data yet</span>
          <span className="text-xs">
            Call{' '}
            <code className="bg-gray-700 px-1 rounded text-indigo-300">
              GET /upstream
            </code>{' '}
            on node-service to generate cross-service traces
          </span>
        </div>
      ) : (
        <ForceGraph2D
          ref={handleRef as never}
          graphData={{ nodes, links }}
          height={440}
          backgroundColor="#1f2937"
          enableZoomInteraction
          enablePanInteraction
          nodeCanvasObject={paintNode as never}
          nodeCanvasObjectMode={() => 'replace'}
          nodeRelSize={NODE_RADIUS}
          linkColor={() => '#6366f1'}
          linkWidth={link => Math.max(1.5, Math.log((link as GraphLink).call_count + 1) * 1.5)}
          linkDirectionalArrowLength={8}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={() => '#a5b4fc'}
          linkDirectionalParticles={3}
          linkDirectionalParticleColor={() => '#a5b4fc'}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleSpeed={0.005}
          onEngineStop={handleEngineStop}
          cooldownTicks={150}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      )}
    </div>
  )
}
