import { useEffect, useState } from 'react';

import { useSession } from '@/auth/SessionContext';

import { readCachedCities } from './citiesCache';

export function useAgentVillage(): string | null {
  const { agent } = useSession();
  const [village, setVillage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVillage(null);
    if (!agent?.id || agent.mini_grid_id == null) return;
    void readCachedCities(agent.id).then((cities) => {
      if (cancelled || !cities) return;
      const match = cities.find((c) => c.mini_grid_id === agent.mini_grid_id);
      setVillage(match?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [agent?.id, agent?.mini_grid_id]);

  return village;
}
