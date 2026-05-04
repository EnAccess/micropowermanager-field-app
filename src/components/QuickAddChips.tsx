import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

type QuickAddChipsProps = {
  values: number[];
  onAdd: (value: number) => void;
  style?: StyleProp<ViewStyle>;
};

const formatLabel = (n: number) => {
  if (n >= 1000) return `+${n / 1000}k`;
  return `+${n}`;
};

export function QuickAddChips({ values, onAdd, style }: QuickAddChipsProps) {
  return (
    <View style={[styles.row, style]}>
      {values.map((v) => (
        <Pressable
          key={v}
          onPress={() => onAdd(v)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text variant="bodyEmphasis" tone="primary">
            {formatLabel(v)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: semantic.bgSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: semantic.line,
  },
  pressed: {
    opacity: 0.75,
  },
});
