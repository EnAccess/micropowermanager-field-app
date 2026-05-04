import { Feather } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { semantic, spacing } from '@/theme';
import { Text } from './Text';

type SecondaryHeaderProps = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  closeIcon?: boolean;
  right?: ReactNode;
};

export function SecondaryHeader({
  title,
  subtitle,
  onBack,
  closeIcon = false,
  right,
}: SecondaryHeaderProps) {
  const insets = useSafeAreaInsets();
  const iconName = closeIcon ? 'x' : 'chevron-left';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <View style={styles.leading}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && styles.pressed,
              ]}
            >
              <Feather name={iconName} size={22} color={semantic.ink} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>
        <View style={styles.titles}>
          {title ? (
            <Text variant="screenTitle" tone="primary" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="meta" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.trailing}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: semantic.paper,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  leading: {
    width: 40,
    alignItems: 'flex-start',
  },
  trailing: {
    width: 40,
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  titles: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
