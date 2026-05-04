import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radii, semantic } from '@/theme';

type ProgressStepsProps = {
  total: number;
  current: number;
  style?: StyleProp<ViewStyle>;
};

export function ProgressSteps({ total, current, style }: ProgressStepsProps) {
  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: total }).map((_, idx) => {
        const state =
          idx + 1 < current
            ? 'done'
            : idx + 1 === current
              ? 'current'
              : 'upcoming';
        return (
          <View
            key={idx}
            style={[
              styles.segment,
              state === 'done' && { backgroundColor: semantic.orange },
              state === 'current' && { backgroundColor: semantic.sky },
              state === 'upcoming' && { backgroundColor: semantic.line },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
  },
});
