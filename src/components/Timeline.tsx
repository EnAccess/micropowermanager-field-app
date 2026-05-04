import { Feather } from '@expo/vector-icons';
import { Fragment, ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radii, semantic, spacing } from '@/theme';

export type TimelineDotTone = 'orange' | 'blue' | 'green' | 'red' | 'neutral';

export type TimelineItem = {
  key: string;
  tone: TimelineDotTone;
  icon?: keyof typeof Feather.glyphMap;
  content: ReactNode;
};

type TimelineProps = {
  items: TimelineItem[];
  style?: StyleProp<ViewStyle>;
};

const dotBg: Record<TimelineDotTone, string> = {
  orange: semantic.orange,
  blue: semantic.blue,
  green: semantic.green,
  red: semantic.red,
  neutral: semantic.ink3,
};

export function Timeline({ items, style }: TimelineProps) {
  return (
    <View style={[styles.root, style]}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <Fragment key={item.key}>
            <View style={styles.row}>
              <View style={styles.gutter}>
                <View
                  style={[styles.dot, { backgroundColor: dotBg[item.tone] }]}
                >
                  {item.icon ? (
                    <Feather
                      name={item.icon}
                      size={16}
                      color={semantic.paper}
                    />
                  ) : null}
                </View>
                {!isLast ? <View style={styles.connector} /> : null}
              </View>
              <View style={styles.body}>{item.content}</View>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  gutter: {
    width: 36,
    alignItems: 'center',
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    flex: 1,
    width: 2,
    backgroundColor: semantic.line,
    marginTop: 2,
    marginBottom: 2,
  },
  body: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
});
