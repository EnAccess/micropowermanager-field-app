import { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, semantic, shadows, spacing } from '@/theme';

type BottomSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
};

export function BottomSheet({
  visible,
  onDismiss,
  children,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translate = useRef(new Animated.Value(400)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translate, {
        toValue: visible ? 0 : 400,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: visible ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translate, fade]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + spacing.lg,
              transform: [{ translateY: translate }],
            },
          ]}
        >
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,42,63,0.35)',
  },
  sheet: {
    backgroundColor: semantic.paper,
    borderTopLeftRadius: radii.sheetTop,
    borderTopRightRadius: radii.sheetTop,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadows.sheet,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: semantic.line2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
});
