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

export function parseGeoPoint(
  value: string | null | undefined,
): GeoPoint | null {
  if (!value) return null;
  const [latStr, lngStr] = value.split(',').map((s) => s.trim());
  const latitude = Number(latStr);
  const longitude = Number(lngStr);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export async function reverseGeocode(point: GeoPoint): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    if (!results.length) return null;
    const first = results[0];
    const streetName = first.street ?? first.name ?? first.district ?? '';
    if (!streetName) return null;
    const composed = first.streetNumber
      ? `${first.streetNumber} ${streetName}`
      : streetName;
    return composed.trim() || null;
  } catch {
    return null;
  }
}
