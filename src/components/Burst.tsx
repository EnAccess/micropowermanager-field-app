import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Ellipse, G } from 'react-native-svg';

import { colors } from '@/theme';

type BurstProps = {
  size?: number;
  color?: string;
  rotation?: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
};

export function Burst({
  size = 64,
  color = colors.brand.sky,
  rotation = 0,
  opacity = 1,
  style,
}: BurstProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={style as object}
      opacity={opacity}
    >
      <G origin="50, 50" rotation={rotation}>
        {RAYS.map(({ angle, length, width: w, offset }, index) => (
          <Ellipse
            key={index}
            cx="50"
            cy={50 - offset - length / 2}
            rx={w}
            ry={length / 2}
            fill={color}
            origin="50, 50"
            rotation={angle}
          />
        ))}
      </G>
    </Svg>
  );
}

type Ray = { angle: number; length: number; width: number; offset: number };

const RAYS: Ray[] = [
  { angle: -90, length: 28, width: 2.6, offset: 6 },
  { angle: -70, length: 18, width: 2.0, offset: 8 },
  { angle: -55, length: 24, width: 2.4, offset: 6 },
  { angle: -38, length: 14, width: 1.8, offset: 10 },
  { angle: -20, length: 26, width: 2.5, offset: 6 },
  { angle: -5, length: 16, width: 2.0, offset: 9 },
  { angle: 12, length: 20, width: 2.2, offset: 8 },
  { angle: 28, length: 26, width: 2.5, offset: 6 },
  { angle: 45, length: 16, width: 1.9, offset: 9 },
  { angle: 62, length: 22, width: 2.2, offset: 7 },
  { angle: 78, length: 18, width: 2.0, offset: 9 },
  { angle: 95, length: 26, width: 2.4, offset: 6 },
  { angle: 112, length: 14, width: 1.8, offset: 10 },
  { angle: 130, length: 22, width: 2.3, offset: 7 },
  { angle: 148, length: 18, width: 2.0, offset: 9 },
  { angle: 165, length: 24, width: 2.4, offset: 6 },
  { angle: 180, length: 16, width: 1.9, offset: 9 },
  { angle: -160, length: 22, width: 2.2, offset: 7 },
  { angle: -140, length: 18, width: 2.0, offset: 9 },
  { angle: -118, length: 26, width: 2.5, offset: 6 },
];
