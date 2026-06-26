import { Feather } from '@expo/vector-icons';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, semantic, shadows, spacing } from '@/theme';

import { Text } from './Text';

type ToastTone = 'error' | 'success' | 'info';

type ToastOptions = {
  message: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastContextValue = {
  show: (options: ToastOptions) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  hide: () => void;
};

const toneConfig: Record<
  ToastTone,
  { bg: string; icon: keyof typeof Feather.glyphMap }
> = {
  error: { bg: semantic.red, icon: 'alert-circle' },
  success: { bg: semantic.green, icon: 'check-circle' },
  info: { bg: semantic.blue, icon: 'info' },
};

const DEFAULT_DURATION = 4000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 24,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(options);
      opacity.setValue(0);
      translateY.setValue(24);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
      timer.current = setTimeout(hide, options.duration ?? DEFAULT_DURATION);
    },
    [hide, opacity, translateY],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      showError: (message) => show({ message, tone: 'error' }),
      showSuccess: (message) => show({ message, tone: 'success' }),
      hide,
    }),
    [show, hide],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const tone = toneConfig[toast?.tone ?? 'info'];

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="box-none"
          style={[styles.host, { bottom: insets.bottom + spacing.lg }]}
        >
          <Animated.View
            style={{ opacity, transform: [{ translateY }], width: '100%' }}
          >
            <Pressable
              onPress={hide}
              style={[styles.toast, { backgroundColor: tone.bg }]}
            >
              <Feather name={tone.icon} size={18} color={semantic.paper} />
              <Text variant="body" tone="onNavy" style={styles.message}>
                {toast.message}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
    ...shadows.sheet,
  },
  message: {
    flex: 1,
  },
});
