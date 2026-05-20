import { useQuery } from '@tanstack/react-query';

import { fetchCities } from '@/api/referenceData';
import { useSession } from '@/auth/SessionContext';

import { writeCachedCities } from './citiesCache';

export function usePrefetchCities() {
  const { api, agent } = useSession();
  const agentId = agent?.id ?? null;

  useQuery({
    queryKey: ['cities', agentId],
    queryFn: async () => {
      const fresh = await fetchCities(api!);
      if (agentId != null) {
        await writeCachedCities(agentId, fresh);
      }
      return fresh;
    },
    enabled: !!api && agentId != null,
    staleTime: 24 * 60 * 60_000,
  });
}
