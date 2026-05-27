import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { agentFullName } from '@/api/auth';
import { useSession } from '@/auth/SessionContext';
import { BottomSheet, Button, SecondaryHeader, Text } from '@/components';
import { SupportedLanguage } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { useLastSyncedAt } from '@/storage/lastSync';
import { useAgentVillage } from '@/storage/useAgentVillage';
import { useOutbox } from '@/storage/useOutbox';
import { fonts, radii, semantic, shadows, spacing } from '@/theme';
import { initials } from '@/utils/format';
import { formatRelativeTime } from '@/utils/time';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { agent, logout } = useSession();
  const { language } = useI18n();
  const outbox = useOutbox();
  const lastSyncedAt = useLastSyncedAt();
  const village = useAgentVillage();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const fullName = agentFullName(agent) ?? agent?.email ?? t('common.agent');
  const initial = initials(fullName).slice(0, 2);
  const subtitle = agentLocation(village, agent?.miniGrid?.name);

  const pending = outbox.filter((e) => e.status === 'pending').length;
  const failed = outbox.filter((e) => e.status === 'failed').length;
  const synced = pending === 0 && failed === 0;
  const lastSyncedLabel = lastSyncedAt
    ? t('settings.syncStatus.lastSynced', {
        when: formatRelativeTime(lastSyncedAt, t),
      })
    : t('settings.syncStatus.never');
  const syncMessage = synced
    ? `${lastSyncedLabel} · ${t('settings.syncStatus.allUpToDate')}`
    : failed > 0
      ? t('settings.syncStatus.pending', { count: pending + failed })
      : t('settings.syncStatus.pending', { count: pending });

  const languageLabel = t(`language.${LANGUAGE_LABEL_KEY[language]}`);

  const version = Constants.expoConfig?.version ?? '—';
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    '—';

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('settings.title')}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <Row>
            <View style={styles.avatar}>
              <Text variant="bodyEmphasis" style={styles.avatarLetter}>
                {initial}
              </Text>
            </View>
            <View style={styles.rowMain}>
              <Text variant="bodyEmphasis" tone="primary" numberOfLines={1}>
                {fullName}
              </Text>
              {subtitle ? (
                <Text variant="meta" tone="muted" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </Row>
        </View>

        <View style={styles.section}>
          <Pressable
            onPress={() => router.push('/(app)/settings/language')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Feather name="globe" size={20} color={semantic.ink2} />
            </View>
            <View style={styles.rowMain}>
              <Text variant="bodyEmphasis" tone="primary">
                {t('settings.language')}
              </Text>
              <Text variant="meta" tone="muted">
                {languageLabel}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={semantic.ink3} />
          </Pressable>

          <View style={styles.divider} />

          <Row>
            <View style={styles.iconWrap}>
              <Feather name="refresh-cw" size={20} color={semantic.ink2} />
            </View>
            <View style={styles.rowMain}>
              <Text variant="bodyEmphasis" tone="primary">
                {t('settings.sync')}
              </Text>
              <Text variant="meta" tone="muted">
                {syncMessage}
              </Text>
            </View>
            {synced ? (
              <View style={styles.pillSynced}>
                <View style={styles.pillDot} />
                <Text style={styles.pillText}>
                  {t('settings.syncStatus.synced')}
                </Text>
              </View>
            ) : null}
          </Row>
        </View>

        <View style={styles.signOutWrap}>
          <Pressable
            onPress={() => setConfirmVisible(true)}
            style={({ pressed }) => [
              styles.signOutBtn,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="log-out" size={16} color={semantic.orange} />
            <Text variant="callout" style={styles.signOutLabel}>
              {t('settings.signOut')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text variant="meta" tone="muted">
          {t('settings.appName')}
        </Text>
        <Text style={styles.footerVersion}>
          {t('settings.version', { version, build })}
        </Text>
      </View>

      <BottomSheet
        visible={confirmVisible}
        onDismiss={() => setConfirmVisible(false)}
      >
        <View style={styles.confirmHeader}>
          <View style={styles.confirmIcon}>
            <Feather name="log-out" size={22} color={semantic.orange} />
          </View>
          <Text variant="pageTitle" tone="primary" style={styles.confirmTitle}>
            {t('settings.signOutConfirm.title')}
          </Text>
          <Text variant="body" tone="muted" style={styles.confirmMsg}>
            {t('settings.signOutConfirm.message')}
          </Text>
        </View>

        <View style={styles.confirmCard}>
          <View style={styles.avatar}>
            <Text variant="bodyEmphasis" style={styles.avatarLetter}>
              {initial}
            </Text>
          </View>
          <View style={styles.rowMain}>
            <Text variant="bodyEmphasis" tone="primary" numberOfLines={1}>
              {fullName}
            </Text>
            {subtitle ? (
              <Text variant="meta" tone="muted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.confirmActions}>
          <Button
            tone="ghost"
            label={t('common.cancel')}
            onPress={() => setConfirmVisible(false)}
            style={styles.confirmBtn}
          />
          <Button
            tone="accent"
            label={t('settings.signOut')}
            onPress={() => {
              setConfirmVisible(false);
              void logout();
            }}
            style={styles.confirmBtn}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function agentLocation(
  village: string | null,
  miniGridName: string | null | undefined,
): string {
  return [village, miniGridName].filter(Boolean).join(' · ');
}

const LANGUAGE_LABEL_KEY: Record<SupportedLanguage, string> = {
  ar: 'arabic',
  bu: 'burmese',
  en: 'english',
  fr: 'french',
  pt: 'portuguese',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bgSoft,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  section: {
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(119,217,247,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: semantic.sky,
  },
  avatarLetter: {
    color: semantic.blue,
    fontFamily: fonts.ptBold,
    fontSize: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: semantic.line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  pillSynced: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: semantic.greenLight,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.green,
  },
  pillText: {
    fontFamily: fonts.ptBold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: semantic.green,
  },
  signOutWrap: {
    marginTop: spacing.md,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: semantic.orange,
    backgroundColor: semantic.paper,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  signOutLabel: {
    color: semantic.orange,
  },
  footer: {
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: 2,
  },
  footerVersion: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: semantic.ink3,
    letterSpacing: 0.4,
  },
  confirmHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: semantic.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  confirmTitle: {
    textAlign: 'center',
  },
  confirmMsg: {
    textAlign: 'center',
  },
  confirmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: semantic.line,
    backgroundColor: semantic.bgSoft,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  confirmBtn: {
    flex: 1,
  },
});
