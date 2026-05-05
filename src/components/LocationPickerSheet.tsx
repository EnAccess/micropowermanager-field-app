import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { radii, semantic, shadows, spacing } from '@/theme';
import { GeoPoint, captureGeoPoint } from '@/utils/location';
import { Button } from './Button';
import { Text } from './Text';

const FALLBACK_CENTER: GeoPoint = { latitude: -6.7924, longitude: 39.2083 }; // Dar es Salaam

type LocationPickerSheetProps = {
  visible: boolean;
  initial: GeoPoint | null;
  onClose: () => void;
  onConfirm: (point: GeoPoint) => void;
};

type PickMessage = { type: 'pick'; lat: number; lng: number };

export function LocationPickerSheet({
  visible,
  initial,
  onClose,
  onConfirm,
}: LocationPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [point, setPoint] = useState<GeoPoint | null>(initial);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (visible) setPoint(initial);
  }, [visible, initial]);

  const startCenter = initial ?? FALLBACK_CENTER;
  const startZoom = initial ? 15 : 5;

  const html = useMemo(
    () => buildHtml(startCenter, startZoom),
    [startCenter, startZoom],
  );

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as PickMessage;
      if (data.type === 'pick') {
        setPoint({ latitude: data.lat, longitude: data.lng });
      }
    } catch {
      // ignore malformed messages
    }
  }

  async function useCurrentLocation() {
    setLocating(true);
    const captured = await captureGeoPoint();
    setLocating(false);
    if (!captured) return;
    setPoint(captured);
    webRef.current?.injectJavaScript(
      `window.__setMarker(${captured.latitude}, ${captured.longitude}, 16); true;`,
    );
  }

  function confirm() {
    if (point) onConfirm(point);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Feather name="x" size={20} color={semantic.ink} />
          </Pressable>
          <Text variant="bodyEmphasis">Pick meter location</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={styles.mapWrap}>
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            style={styles.map}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={semantic.blue} />
              </View>
            )}
            startInLoadingState
          />

          <Pressable
            onPress={useCurrentLocation}
            disabled={locating}
            style={({ pressed }) => [
              styles.locateBtn,
              pressed && { opacity: 0.7 },
              locating && { opacity: 0.5 },
            ]}
          >
            {locating ? (
              <ActivityIndicator color={semantic.blue} />
            ) : (
              <Feather name="crosshair" size={18} color={semantic.blue} />
            )}
          </Pressable>
        </View>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Text variant="meta" tone="muted" style={styles.coords}>
            {point
              ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`
              : 'Tap the map to choose a point.'}
          </Text>
          <Button
            tone="accent"
            label="Use this location"
            onPress={confirm}
            disabled={!point}
          />
        </View>
      </View>
    </Modal>
  );
}

function buildHtml(center: GeoPoint, zoom: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #e9eef2; }
  .leaflet-control-attribution { font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  (function () {
    var map = L.map('map', { zoomControl: true }).setView([${center.latitude}, ${center.longitude}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var marker = L.marker([${center.latitude}, ${center.longitude}], { draggable: true }).addTo(map);

    function post(lat, lng) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pick', lat: lat, lng: lng }));
      }
    }

    map.on('click', function (e) {
      marker.setLatLng(e.latlng);
      post(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', function () {
      var ll = marker.getLatLng();
      post(ll.lat, ll.lng);
    });

    window.__setMarker = function (lat, lng, z) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], z != null ? z : map.getZoom());
      post(lat, lng);
    };
  })();
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.bgSoft,
  },
  locateBtn: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: semantic.paper,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sheet,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.line,
    gap: spacing.sm,
  },
  coords: {
    fontVariant: ['tabular-nums'],
  },
});
