import { useQuery } from '@tanstack/react-query';

import { fetchCities } from '@/api/referenceData';
import { useSession } from '@/auth/SessionContext';

import { writeCachedCities } from './citiesCache';

export function usePrefetchCities() {
  const { api, scopeId } = useSession();

  useQuery({
    queryKey: ['cities', scopeId],
    queryFn: async () => {
      const fresh = await fetchCities(api!);
      if (scopeId) {
        await writeCachedCities(scopeId, fresh);
      }
      return fresh;
    },
    enabled: !!api && !!scopeId,
    staleTime: 24 * 60 * 60_000,
  });
}
