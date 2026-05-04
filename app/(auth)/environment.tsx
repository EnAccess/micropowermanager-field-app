import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/SessionContext';
import { Button, GradientHero, Logo, Text, TextField } from '@/components';
import {
  EnvironmentKind,
  cloudEnvironment,
  customEnvironment,
  demoEnvironment,
} from '@/config/environments';
import { radii, semantic, spacing } from '@/theme';

type Option = {
  kind: EnvironmentKind;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>['name'];
};

const OPTIONS: Option[] = [
  {
    kind: 'demo',
    title: 'Demo',
    description: 'Explore with sample data. No setup.',
    icon: 'play-circle',
  },
  {
    kind: 'cloud',
    title: 'Cloud',
    description: 'Sign in to the MicroPowerManager cloud.',
    icon: 'cloud',
  },
  {
    kind: 'custom',
    title: 'Custom',
    description: 'Self-hosted, local, or staging.',
    icon: 'server',
  },
];

export default function EnvironmentPicker() {
  const { setEnvironment } = useSession();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<EnvironmentKind>('cloud');
  const [customUrl, setCustomUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    setError(null);
    try {
      if (selected === 'demo') {
        await setEnvironment(demoEnvironment());
      } else if (selected === 'cloud') {
        await setEnvironment(cloudEnvironment());
      } else {
        if (!/^https?:\/\//i.test(customUrl.trim())) {
          setError('Enter a full URL starting with http:// or https://');
          return;
        }
        await setEnvironment(customEnvironment(customUrl));
      }
      setSubmitting(true);
      router.replace('/(auth)/login');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save environment.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <GradientHero variant="blue">
        <View style={styles.lockup}>
          <Logo size={36} />
          <Text variant="screenTitle" tone="onNavy">
            MicroPowerManager
          </Text>
        </View>
        <Text variant="pageTitle" tone="onNavy" style={styles.title}>
          Connect your account
        </Text>
        <Text variant="body" tone="onNavyMuted">
          Choose where this app should talk to.
        </Text>
      </GradientHero>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.options}>
            {OPTIONS.map((option) => {
              const isSelected = selected === option.kind;
              return (
                <Pressable
                  key={option.kind}
                  onPress={() => setSelected(option.kind)}
                  style={({ pressed }) => [
                    styles.optionRing,
                    isSelected && styles.optionRingSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[styles.option, isSelected && styles.optionSelected]}
                  >
                    <View
                      style={[
                        styles.optionIcon,
                        isSelected && styles.optionIconSelected,
                      ]}
                    >
                      <Feather
                        name={option.icon}
                        size={20}
                        color={semantic.blue}
                      />
                    </View>
                    <View style={styles.optionBody}>
                      <Text
                        variant="bodyEmphasis"
                        tone={isSelected ? 'brand' : 'primary'}
                      >
                        {option.title}
                      </Text>
                      <Text variant="meta" tone="muted">
                        {option.description}
                      </Text>
                    </View>
                    <View
                      style={[styles.radio, isSelected && styles.radioSelected]}
                    >
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {selected === 'custom' ? (
            <TextField
              label="Server URL"
              placeholder="https://mpm.example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              mono
              value={customUrl}
              onChangeText={setCustomUrl}
              containerStyle={styles.field}
            />
          ) : null}

          {error ? (
            <Text variant="meta" tone="danger" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Button
            label="Continue"
            onPress={handleContinue}
            loading={submitting}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  flex: {
    flex: 1,
  },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    marginTop: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  options: {
    gap: spacing.md,
  },
  optionRing: {
    borderRadius: radii.card + 3,
  },
  optionRingSelected: {
    backgroundColor: 'rgba(23,69,105,0.15)',
    padding: 3,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: semantic.line,
    padding: spacing.md,
  },
  optionSelected: {
    backgroundColor: semantic.bgSoft,
    borderColor: semantic.blue,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: semantic.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconSelected: {
    borderWidth: 1.5,
    borderColor: semantic.sky,
  },
  optionBody: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: semantic.line2,
    backgroundColor: semantic.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: semantic.blue,
    backgroundColor: semantic.blue,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: semantic.paper,
  },
  pressed: {
    opacity: 0.85,
  },
  field: {
    marginTop: spacing.lg,
  },
  error: {
    marginTop: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: semantic.paper,
    borderTopWidth: 1,
    borderTopColor: semantic.line,
  },
});
