import type { HealthResponse, SpanResponse, MetricResponse, GraphResponse } from '../types'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const fetchHealth = () => get<HealthResponse>('/health')

export const fetchSpans = (opts: {
  service_name?: string
  start_time?: string
  end_time?: string
  limit?: number
}) =>
  get<SpanResponse[]>('/spans', {
    service_name: opts.service_name ?? '',
    start_time: opts.start_time ?? '',
    end_time: opts.end_time ?? '',
    limit: opts.limit ? String(opts.limit) : '',
  })

export const fetchMetrics = (opts: { service_name?: string } = {}) =>
  get<MetricResponse[]>('/metrics', { service_name: opts.service_name ?? '' })

export const fetchGraph = () => get<GraphResponse>('/graph')
