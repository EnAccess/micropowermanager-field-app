import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

type CustomerChipProps = {
  name: string;
  meta?: string;
  initials?: string;
  onChange?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function CustomerChip({
  name,
  meta,
  initials,
  onChange,
  style,
}: CustomerChipProps) {
  const init = initials ?? name.slice(0, 1).toUpperCase();
  return (
    <View style={[styles.root, style]}>
      <View style={styles.avatar}>
        <Text variant="bodyEmphasis" tone="brand">
          {init}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="bodyEmphasis" tone="primary" numberOfLines={1}>
          {name}
        </Text>
        {meta ? (
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {onChange ? (
        <Pressable onPress={onChange} hitSlop={8}>
          <Text variant="bodyEmphasis" tone="brand">
            Change
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.bgSoft,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: semantic.line,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(119,217,247,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
});
