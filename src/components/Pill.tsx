import { ReactNode } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

type PillTone =
  | 'neutral'
  | 'blue'
  | 'sky'
  | 'orange'
  | 'green'
  | 'red'
  | 'onNavy'
  | 'selected';

type PillProps = {
  label: string;
  tone?: PillTone;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Pill({
  label,
  tone = 'neutral',
  leading,
  trailing,
  onPress,
  selected,
  style,
}: PillProps) {
  const t = selected ? 'selected' : tone;
  const palette = toneStyles[t];

  const content = (
    <>
      {leading}
      <Text
        variant="pill"
        style={[styles.label, { color: palette.text }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
      {trailing}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          { backgroundColor: palette.bg, borderColor: palette.border },
          pressed && styles.pressed,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    letterSpacing: 0.3,
    includeFontPadding: true,
    textAlignVertical: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});

const toneStyles: Record<
  PillTone,
  { bg: string; text: string; border: string }
> = {
  neutral: { bg: semantic.bgSoft, text: semantic.ink2, border: semantic.line },
  blue: {
    bg: 'rgba(23,69,105,0.10)',
    text: semantic.blue,
    border: 'transparent',
  },
  sky: {
    bg: 'rgba(119,217,247,0.25)',
    text: semantic.blue,
    border: 'transparent',
  },
  orange: {
    bg: semantic.orangeLight,
    text: semantic.orange,
    border: 'transparent',
  },
  green: {
    bg: semantic.greenLight,
    text: semantic.green,
    border: 'transparent',
  },
  red: {
    bg: 'rgba(199,62,62,0.12)',
    text: semantic.red,
    border: 'transparent',
  },
  onNavy: {
    bg: 'rgba(255,255,255,0.15)',
    text: semantic.paper,
    border: 'transparent',
  },
  selected: { bg: semantic.blue, text: semantic.paper, border: semantic.blue },
};
