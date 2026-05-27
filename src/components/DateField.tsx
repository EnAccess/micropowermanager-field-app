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

import { fonts, radii, semantic, spacing } from '@/theme';
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
        <Text variant="sectionLabel" tone="secondary" style={styles.label}>
          {label.toUpperCase()}
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
        <Text
          style={[
            styles.triggerText,
            { color: value ? semantic.ink : semantic.ink3 },
          ]}
          numberOfLines={1}
        >
          {displayValue}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      {error ? (
        <Text variant="meta" tone="danger" style={styles.helper}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="meta" tone="muted" style={styles.helper}>
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
    marginBottom: 2,
  },
  trigger: {
    backgroundColor: semantic.paper,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: spacing.sm,
  },
  triggerText: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  caret: {
    color: semantic.ink3,
    fontSize: 16,
  },
  triggerError: {
    borderColor: semantic.red,
  },
  triggerPressed: {
    opacity: 0.85,
  },
  helper: {
    marginTop: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,42,63,0.45)',
  },
  sheet: {
    backgroundColor: semantic.paper,
    borderTopLeftRadius: radii.sheetTop,
    borderTopRightRadius: radii.sheetTop,
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
