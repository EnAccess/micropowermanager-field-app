import { StyleProp, View, ViewStyle } from 'react-native';

import Sun from '@/assets/sun.svg';
import { colors } from '@/theme';

const ASPECT_RATIO = 185.88 / 178.02;

type BurstProps = {
  size?: number;
  color?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
};

export function Burst({
  size = 64,
  color = colors.brand.sky,
  opacity = 1,
  style,
}: BurstProps) {
  return (
    <View style={style}>
      <Sun
        width={size}
        height={size * ASPECT_RATIO}
        fill={color}
        opacity={opacity}
      />
    </View>
  );
}
