import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '../api/client'

export function HealthBadge() {
  const { data, isError, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: 1,
  })

  if (isFetching && !data) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-400">
        <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
        connecting…
      </span>
    )
  }

  const ok = !isError && data?.status === 'ok'
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
        ok ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {ok ? 'API healthy' : 'API unreachable'}
    </span>
  )
}
