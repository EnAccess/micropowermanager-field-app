import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useSession } from '@/auth/SessionContext';
import { colors } from '@/theme';

export default function Index() {
  const { status, environment } = useSession();

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.text.onNavy} />
      </View>
    );
  }

  if (status === 'authenticated') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <Redirect href={environment ? '/(auth)/login' : '/(auth)/environment'} />
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.navy,
  },
});
