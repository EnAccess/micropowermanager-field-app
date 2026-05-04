import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { fonts, semantic } from '@/theme';
import { Text } from './Text';

type StripedThumbnailProps = {
  size?: number;
  label?: string;
};

export function StripedThumbnail({
  size = 56,
  label = 'SHS',
}: StripedThumbnailProps) {
  return (
    <View
      style={[styles.root, { width: size, height: size, borderRadius: 10 }]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <Pattern
            id="diagstripes"
            width={12}
            height={12}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Rect width={6} height={12} fill={semantic.bgSoft} />
            <Rect x={6} width={6} height={12} fill={semantic.paper} />
          </Pattern>
        </Defs>
        <Rect width={size} height={size} fill="url(#diagstripes)" />
      </Svg>
      <View style={styles.label} pointerEvents="none">
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: semantic.line2,
  },
  label: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fonts.ptBold,
    fontSize: 14,
    color: semantic.ink3,
  },
});
