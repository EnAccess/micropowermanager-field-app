import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, semantic, shadows, spacing } from '@/theme';
import { Text } from './Text';

type SubAction = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  onPress: () => void;
};

type FabProps = {
  icon?: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  actions?: SubAction[];
  style?: StyleProp<ViewStyle>;
  bottomOffset?: number;
};

export function Fab({
  icon = 'plus',
  onPress,
  actions,
  style,
  bottomOffset = 84,
}: FabProps) {
  const [open, setOpen] = useState(false);
  const rot = useRef(new Animated.Value(0)).current;
  const subs = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rot, {
      toValue: open ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    Animated.timing(subs, {
      toValue: open ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [open, rot, subs]);

  const handlePress = () => {
    if (actions && actions.length > 0) {
      setOpen((v) => !v);
    } else {
      onPress?.();
    }
  };

  const rotate = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <>
      {open ? (
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} />
      ) : null}
      <View
        style={[styles.wrap, { bottom: bottomOffset }, style]}
        pointerEvents="box-none"
      >
        {actions ? (
          <View style={styles.actions} pointerEvents={open ? 'auto' : 'none'}>
            {actions.map((a, i) => {
              const translateY = subs.interpolate({
                inputRange: [0, 1],
                outputRange: [20, -((i + 1) * 64)],
              });
              return (
                <Animated.View
                  key={a.key}
                  style={[
                    styles.action,
                    { opacity: subs, transform: [{ translateY }] },
                  ]}
                >
                  <View style={styles.chip}>
                    <Text variant="bodyEmphasis" tone="primary">
                      {a.label}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setOpen(false);
                      a.onPress();
                    }}
                    style={({ pressed }) => [
                      styles.subBtn,
                      { backgroundColor: a.color ?? semantic.blue },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Feather name={a.icon} size={20} color={semantic.paper} />
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        ) : null}
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Feather name={icon} size={26} color={semantic.paper} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,42,63,0.25)',
  },
  wrap: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: radii.pill,
    backgroundColor: semantic.orange,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  pressed: {
    opacity: 0.9,
  },
  actions: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    alignItems: 'flex-end',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  chip: {
    backgroundColor: semantic.paper,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    ...shadows.card,
  },
  subBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
});
