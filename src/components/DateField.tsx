import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

type DateFieldProps = {
  label?: string;
  value: Date | null;
  onChange: (value: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  error?: string;
  helper?: string;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  error,
  helper,
  placeholder = 'Select a date',
  containerStyle,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);

  function openPicker() {
    setDraft(value ?? new Date());
    setOpen(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, next?: Date) {
    setOpen(false);
    if (event.type === 'set' && next) {
      onChange(next);
    }
  }

  function handleIosChange(_: DateTimePickerEvent, next?: Date) {
    if (next) setDraft(next);
  }

  function confirmIos() {
    if (draft) onChange(draft);
    setOpen(false);
  }

  const displayValue = value ? formatDisplay(value) : placeholder;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" tone="muted" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={openPicker}
        style={({ pressed }) => [
          styles.trigger,
          error ? styles.triggerError : null,
          pressed ? styles.triggerPressed : null,
        ]}
      >
        <Text variant="body" tone={value ? 'primary' : 'muted'}>
          {displayValue}
        </Text>
        <Text variant="body" tone="muted">
          ▾
        </Text>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="danger" style={styles.helper}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="muted" style={styles.helper}>
          {helper}
        </Text>
      ) : null}

      {Platform.OS === 'android' && open ? (
        <DateTimePicker
          value={draft ?? value ?? new Date()}
          mode="date"
          display="default"
          onChange={handleAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.sheetHeader}>
              <Text variant="heading">{label ?? 'Select date'}</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text variant="label" tone="muted">
                  Cancel
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft ?? value ?? new Date()}
              mode="date"
              display="spinner"
              onChange={handleIosChange}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              themeVariant="light"
            />
            <Button
              label="Confirm"
              onPress={confirmIos}
              style={styles.confirmCta}
            />
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

function formatDisplay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toIsoDate(date: Date): string {
  return formatDisplay(date);
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    letterSpacing: 0.3,
  },
  trigger: {
    backgroundColor: colors.surface.raised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  triggerError: {
    borderColor: colors.status.danger,
  },
  triggerPressed: {
    opacity: 0.85,
  },
  helper: {
    marginTop: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.surface.page,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  confirmCta: {
    marginTop: spacing.md,
  },
});
