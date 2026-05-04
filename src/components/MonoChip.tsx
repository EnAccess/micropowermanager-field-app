import { Feather } from '@expo/vector-icons';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

type MonoChipProps = {
  value: string;
  onCopy?: () => void;
  truncate?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MonoChip({
  value,
  onCopy,
  truncate = true,
  style,
}: MonoChipProps) {
  const inner = (
    <View style={[styles.root, style]}>
      <Text
        variant="mono"
        tone="primary"
        numberOfLines={truncate ? 1 : undefined}
        style={styles.value}
      >
        {value}
      </Text>
      {onCopy ? (
        <Feather
          name="copy"
          size={12}
          color={semantic.ink3}
          style={styles.icon}
        />
      ) : null}
    </View>
  );

  if (onCopy) {
    return (
      <Pressable onPress={onCopy} hitSlop={4} style={styles.press}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  press: {
    flexShrink: 1,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: semantic.bgSoft,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: semantic.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 1,
  },
  value: {
    flexShrink: 1,
  },
  icon: {
    marginLeft: 2,
    flexShrink: 0,
  },
});
