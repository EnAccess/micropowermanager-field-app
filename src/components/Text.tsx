import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleSheet,
} from 'react-native';

import { semantic, typography, TypographyToken } from '@/theme';

type Tone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'brand'
  | 'accent'
  | 'success'
  | 'danger'
  | 'onNavy'
  | 'onNavyMuted';

type TextProps = RNTextProps & {
  variant?: TypographyToken;
  tone?: Tone;
};

const toneColor: Record<Tone, string> = {
  primary: semantic.ink,
  secondary: semantic.ink2,
  muted: semantic.ink3,
  inverse: semantic.paper,
  brand: semantic.blue,
  accent: semantic.orange,
  success: semantic.green,
  danger: semantic.red,
  onNavy: semantic.paper,
  onNavyMuted: 'rgba(255, 255, 255, 0.72)',
};

export function Text({
  variant = 'body',
  tone = 'primary',
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        styles.base,
        typography[variant],
        { color: toneColor[tone] },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
