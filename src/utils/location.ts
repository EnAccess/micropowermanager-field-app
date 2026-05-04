import * as Location from 'expo-location';

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export async function captureGeoPoint(): Promise<GeoPoint | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return null;
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
}

export function formatGeoPoint(point: GeoPoint | null): string | null {
  if (!point) return null;
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}
