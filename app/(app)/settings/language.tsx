import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SecondaryHeader, Text } from '@/components';
import { SupportedLanguage } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { fonts, radii, semantic, shadows, spacing } from '@/theme';

const LANGUAGE_META: Record<
  SupportedLanguage,
  { native: string; flag: string }
> = {
  ar: { native: 'العربية', flag: '🇸🇦' },
  bu: { native: 'မြန်မာ', flag: '🇲🇲' },
  en: { native: 'English', flag: '🇬🇧' },
  fr: { native: 'Français', flag: '🇫🇷' },
  pt: { native: 'Português', flag: '🇵🇹' },
};

export default function LanguageScreen() {
  const { t } = useTranslation();
  const { language, supported, setLanguage } = useI18n();
  const filtered = supported.map((code) => ({
    code,
    native: LANGUAGE_META[code].native,
    flag: LANGUAGE_META[code].flag,
  }));

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('language.title')}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          {filtered.map((option, idx) => {
            const selected = option.code === language;
            return (
              <View key={option.code}>
                {idx > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={() => void setLanguage(option.code)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.flagWrap}>
                    <Text style={styles.flag}>{option.flag}</Text>
                  </View>
                  <View style={styles.rowMain}>
                    <Text variant="bodyEmphasis" tone="primary">
                      {option.native}
                    </Text>
                    <Text variant="meta" tone="muted">
                      {option.code.toUpperCase()}
                    </Text>
                  </View>
                  {selected ? (
                    <Feather name="check" size={20} color={semantic.blue} />
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bgSoft,
  },
  scroll: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  pressed: {
    opacity: 0.6,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  flagWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: {
    fontSize: 20,
    fontFamily: fonts.sansRegular,
  },
  divider: {
    height: 1,
    backgroundColor: semantic.line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
});
