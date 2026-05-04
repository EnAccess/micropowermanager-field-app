import { Feather } from '@expo/vector-icons';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radii, semantic } from '@/theme';

type SuccessCheckmarkProps = {
  style?: StyleProp<ViewStyle>;
};

export function SuccessCheckmark({ style }: SuccessCheckmarkProps) {
  return (
    <View style={[styles.halo, style]}>
      <View style={styles.circle}>
        <Feather name="check" size={48} color={semantic.paper} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    width: 128,
    height: 128,
    borderRadius: radii.pill,
    backgroundColor: semantic.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: semantic.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
