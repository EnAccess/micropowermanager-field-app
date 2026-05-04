import { StyleProp, View, ViewStyle } from 'react-native';

import LogoSvg from '@/assets/logo.svg';

type LogoProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function Logo({ size = 32, style }: LogoProps) {
  const aspectRatio = 614.14 / 521.42;
  const width = size * aspectRatio;
  return (
    <View style={style}>
      <LogoSvg width={width} height={size} />
    </View>
  );
}
