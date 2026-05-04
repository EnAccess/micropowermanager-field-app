import { ReactNode } from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type Surface = 'page' | 'raised' | 'navy';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  surface?: Surface;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
};

const SURFACE_BG: Record<Surface, string> = {
  page: colors.surface.page,
  raised: colors.surface.raised,
  navy: colors.surface.navy,
};

export function Screen({
  children,
  scroll = false,
  padded = true,
  surface = 'page',
  edges = ['top', 'left', 'right'],
  style,
}: ScreenProps) {
  const contentStyle = [styles.content, padded && styles.padded, style];

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: SURFACE_BG[surface] }]}
      edges={edges}
    >
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    padding: spacing.lg,
  },
});
