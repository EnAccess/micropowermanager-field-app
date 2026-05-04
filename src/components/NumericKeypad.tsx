import { Feather } from '@expo/vector-icons';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, semantic, shadows, spacing } from '@/theme';
import { Text } from './Text';

type NumericKeypadProps = {
  onKeyPress: (key: string) => void;
  onDelete: () => void;
  decimal?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function NumericKeypad({
  onKeyPress,
  onDelete,
  decimal = false,
  style,
}: NumericKeypadProps) {
  const rows: string[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [decimal ? '.' : '000', '0', 'DEL'],
  ];

  return (
    <View style={[styles.tray, style]}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((k) => {
            const isDelete = k === 'DEL';
            return (
              <Pressable
                key={k}
                onPress={isDelete ? onDelete : () => onKeyPress(k)}
                style={({ pressed }) => [
                  styles.cell,
                  pressed && styles.pressed,
                ]}
              >
                {isDelete ? (
                  <Feather name="delete" size={22} color={semantic.ink2} />
                ) : (
                  <Text style={styles.keyText}>{k}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    backgroundColor: semantic.bgSoft,
    padding: spacing.sm,
    borderRadius: radii.card,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    height: 56,
    backgroundColor: semantic.paper,
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  pressed: {
    opacity: 0.7,
  },
  keyText: {
    fontFamily: 'PTSans_700Bold',
    fontSize: 22,
    color: semantic.ink,
    includeFontPadding: false,
  },
});
