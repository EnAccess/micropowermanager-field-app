import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { semantic, spacing } from '@/theme';
import { Button } from './Button';
import { Callout } from './Callout';
import { SecondaryHeader } from './SecondaryHeader';
import { Text } from './Text';

type ProviderCheckoutProps = {
  url: string;
  onDone: () => void;
};

const RETURN_MARKERS = [
  'trxref=',
  'reference=',
  'tx_ref=',
  'transaction_id=',
  'ordertrackingid=',
];

function hostOf(raw: string): string | null {
  const match = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/([^/?#]+)/.exec(raw);
  return match ? match[1].toLowerCase() : null;
}

export function ProviderCheckout({ url, onDone }: ProviderCheckoutProps) {
  const { t } = useTranslation();
  const checkoutHost = useMemo(() => hostOf(url), [url]);

  const hasLeftCheckout = useCallback(
    (candidate: string) => {
      const host = hostOf(candidate);
      return host !== null && host !== checkoutHost;
    },
    [checkoutHost],
  );

  const isReturnUrl = useCallback(
    (candidate: string) => {
      if (!hasLeftCheckout(candidate)) return false;
      const lowered = candidate.toLowerCase();
      return RETURN_MARKERS.some((marker) => lowered.includes(marker));
    },
    [hasLeftCheckout],
  );

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('providerCheckout.title')}
        subtitle={t('providerCheckout.subtitle')}
        onBack={onDone}
      />
      <WebView
        source={{ uri: url }}
        style={styles.web}
        startInLoadingState
        onShouldStartLoadWithRequest={(request) => {
          if (isReturnUrl(request.url)) {
            onDone();
            return false;
          }
          return true;
        }}
        onError={({ nativeEvent }) => {
          if (hasLeftCheckout(nativeEvent.url ?? '')) onDone();
        }}
        onHttpError={({ nativeEvent }) => {
          if (hasLeftCheckout(nativeEvent.url ?? '')) onDone();
        }}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={semantic.blue} />
          </View>
        )}
        renderError={() => (
          <View style={styles.error}>
            <Callout tone="warning">
              <Text variant="body" tone="secondary">
                {t('providerCheckout.errorBody')}
              </Text>
            </Callout>
          </View>
        )}
      />
      <View style={styles.footer}>
        <Button label={t('providerCheckout.done')} onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  web: {
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.paper,
  },
  error: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: semantic.paper,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: semantic.paper,
    borderTopWidth: 1,
    borderTopColor: semantic.line,
  },
});
