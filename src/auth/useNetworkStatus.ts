import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

function isOnline(state: NetInfoState | null): boolean {
  if (!state) return true; // optimistic — assume online until we know otherwise
  if (state.isConnected === false) return false;
  // isInternetReachable is null while NetInfo is still resolving DNS; treat as
  // online so we don't flag good connections as offline during the gap.
  return state.isInternetReachable !== false;
}

export function useNetworkStatus(): { online: boolean } {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch().then((state) => {
      if (mounted) setOnline(isOnline(state));
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (mounted) setOnline(isOnline(state));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { online };
}

export async function fetchOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return isOnline(state);
}
