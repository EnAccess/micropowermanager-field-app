import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts, radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

export type SelectOption<TValue> = {
  value: TValue;
  label: string;
  description?: string;
};

type SelectProps<TValue> = {
  label?: string;
  placeholder?: string;
  options: SelectOption<TValue>[];
  value: TValue | null | undefined;
  onChange: (value: TValue) => void;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  compact?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Select<TValue>({
  label,
  placeholder = 'Select…',
  options,
  value,
  onChange,
  error,
  disabled,
  loading,
  searchable,
  searchPlaceholder = 'Search…',
  compact,
  containerStyle,
}: SelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const visibleOptions = useMemo(() => {
    if (!searchable) return options;
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        o.description?.toLowerCase().includes(term),
    );
  }, [options, query, searchable]);

  const canOpen = !disabled && !loading;

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="sectionLabel" tone="secondary" style={styles.label}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={!canOpen}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          compact ? styles.triggerCompact : null,
          error ? styles.triggerError : null,
          pressed && canOpen ? styles.triggerPressed : null,
          !canOpen ? styles.triggerDisabled : null,
        ]}
      >
        <Text
          style={[
            styles.triggerText,
            { color: selected ? semantic.ink : semantic.ink3 },
          ]}
          numberOfLines={1}
        >
          {loading ? 'Loading…' : selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      {error ? (
        <Text variant="meta" tone="danger" style={styles.helper}>
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Pressable style={styles.backdrop} onPress={close} />
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.sheetHeader}>
              <Text variant="screenTitle">{label ?? 'Select'}</Text>
              <Pressable onPress={close}>
                <Text variant="bodyEmphasis" tone="brand">
                  Close
                </Text>
              </Pressable>
            </View>
            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={semantic.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.search}
              />
            ) : null}
            <FlatList
              data={visibleOptions}
              keyExtractor={(option) => String(option.value)}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <Text variant="meta" tone="muted" style={styles.empty}>
                  {searchable && query.trim()
                    ? 'No matches.'
                    : 'No options available.'}
                </Text>
              }
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      close();
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      pressed ? styles.optionPressed : null,
                    ]}
                  >
                    <View style={styles.optionBody}>
                      <Text variant="bodyEmphasis">{item.label}</Text>
                      {item.description ? (
                        <Text variant="meta" tone="muted">
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Text variant="bodyEmphasis" tone="brand">
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
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
  triggerCompact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 34,
    borderWidth: 1,
  },
  triggerError: {
    borderColor: semantic.red,
  },
  triggerPressed: {
    opacity: 0.85,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  helper: {
    marginTop: spacing.xs,
  },
  modalContainer: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,42,63,0.45)',
  },
  sheet: {
    backgroundColor: semantic.paper,
    borderTopLeftRadius: radii.sheetTop,
    borderTopRightRadius: radii.sheetTop,
    maxHeight: '70%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  search: {
    backgroundColor: semantic.paper,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: semantic.ink,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  optionBody: {
    flex: 1,
    gap: 2,
  },
  optionPressed: {
    opacity: 0.7,
  },
  separator: {
    height: 1,
    backgroundColor: semantic.line,
  },
  empty: {
    padding: spacing.lg,
    textAlign: 'center',
  },
});
