import { Image, StyleProp, View, ViewStyle } from 'react-native';

import logo from '@/assets/logo.png';

type LogoProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function Logo({ size = 32, style }: LogoProps) {
  const aspectRatio = 571 / 309;
  const width = size * aspectRatio;
  return (
    <View style={style}>
      <Image
        source={logo}
        style={{ width, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}
