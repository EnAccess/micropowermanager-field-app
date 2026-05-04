import { Feather } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { z } from 'zod';

import { useSession } from '@/auth/SessionContext';
import { Button, GradientHero, Logo, Text, TextField } from '@/components';
import { environmentHost } from '@/config/environments';
import { fonts, radii, semantic, spacing } from '@/theme';

const schema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(1, 'Password required.'),
});

type LoginForm = z.infer<typeof schema>;

export default function LoginScreen() {
  const { environment, login } = useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await login(values);
    } catch (caught) {
      setSubmitError(errorMessage(caught));
    }
  });

  const host = environment ? environmentHost(environment) : '';

  return (
    <View style={styles.root}>
      <GradientHero variant="blue">
        <View style={styles.lockupRow}>
          <Pressable
            onPress={() => router.replace('/(auth)/environment')}
            hitSlop={8}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Feather name="chevron-left" size={20} color={semantic.paper} />
          </Pressable>
          <Logo size={32} />
          <Text variant="screenTitle" tone="onNavy">
            MicroPowerManager
          </Text>
        </View>
        <Text variant="pageTitle" tone="onNavy" style={styles.title}>
          Welcome back
        </Text>
        {host ? (
          <View style={styles.serverPill}>
            <View style={styles.serverDot} />
            <Text style={styles.serverText} numberOfLines={1}>
              {host}
            </Text>
          </View>
        ) : null}
      </GradientHero>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.fields}>
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label="Email"
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label="Password"
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  trailing={
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={8}
                    >
                      <Text variant="bodyEmphasis" tone="brand">
                        {showPassword ? 'Hide' : 'Show'}
                      </Text>
                    </Pressable>
                  }
                />
              )}
            />
          </View>

          {submitError ? (
            <Text variant="meta" tone="danger" style={styles.submitError}>
              {submitError}
            </Text>
          ) : null}

          <View style={styles.cta}>
            <Button label="Sign in" onPress={onSubmit} loading={isSubmitting} />
          </View>

          <View style={styles.switch}>
            <Text variant="meta" tone="muted">
              Wrong server?{' '}
            </Text>
            <Pressable
              onPress={() => router.replace('/(auth)/environment')}
              hitSlop={8}
            >
              <Text variant="bodyEmphasis" tone="brand">
                Change
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function errorMessage(caught: unknown): string {
  if (typeof caught === 'object' && caught !== null && 'response' in caught) {
    const response = (caught as { response?: { data?: { message?: string } } })
      .response;
    if (response?.data?.message) return response.data.message;
  }
  if (caught instanceof Error) return caught.message;
  return 'Sign-in failed. Try again.';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  flex: {
    flex: 1,
  },
  lockupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    marginTop: spacing.lg,
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  serverDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.sky,
  },
  serverText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: semantic.paper,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  fields: {
    gap: spacing.md,
  },
  submitError: {
    marginTop: spacing.md,
  },
  cta: {
    marginTop: spacing.xl,
  },
  switch: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
});
