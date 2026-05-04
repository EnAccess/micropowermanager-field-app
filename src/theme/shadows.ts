import { Platform, ViewStyle } from 'react-native';

type Shadow = ViewStyle;

const ios = (
  offsetY: number,
  radius: number,
  opacity: number,
  color = '#174569',
): Shadow => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: offsetY },
  shadowRadius: radius,
  shadowOpacity: opacity,
});

const elevation = (value: number): Shadow => ({ elevation: value });

const compose = (s: Shadow, e: Shadow): Shadow =>
  Platform.OS === 'android' ? e : s;

export const shadows = {
  card: compose(
    {
      shadowColor: '#174569',
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      shadowOpacity: 0.06,
    },
    elevation(2),
  ),

  fab: compose(
    {
      shadowColor: '#FA8D41',
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 16,
      shadowOpacity: 0.4,
    },
    elevation(8),
  ),

  sheet: compose(
    {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowRadius: 24,
      shadowOpacity: 0.15,
    },
    elevation(16),
  ),

  focusRing: ios(0, 0, 0),
} as const;

export type ShadowToken = keyof typeof shadows;
