import { Feather } from '@expo/vector-icons';
import {
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SvgProps } from 'react-native-svg';

import { CASH_PAYMENT_PROVIDER } from '@/api/transactions';
import { radii, semantic, spacing } from '@/theme';
import Safaricom from '@/assets/payment-providers/safaricom.svg';
import VodacomMzReversed from '@/assets/payment-providers/vodacom-mz-mono.svg';
import flutterwave from '@/assets/payment-providers/flutterwave.png';
import paystack from '@/assets/payment-providers/paystack.png';
import vodacomMz from '@/assets/payment-providers/vodacom-mz.png';

export const PROVIDER_VODACOM_MZ = 19;
export const PROVIDER_PAYSTACK = 25;
export const PROVIDER_PESAPAL = 30;
export const PROVIDER_SAFARICOM_KE = 31;
export const PROVIDER_FLUTTERWAVE = 32;

export const VODACOM_RED = '#E61E25';

type RasterMark = {
  source: ImageSourcePropType;
  background?: string;
};

const RASTER_MARKS: Record<number, RasterMark> = {
  [PROVIDER_VODACOM_MZ]: { source: vodacomMz, background: VODACOM_RED },
  [PROVIDER_PAYSTACK]: { source: paystack },
  [PROVIDER_FLUTTERWAVE]: { source: flutterwave },
};

const VECTOR_MARKS: Record<number, React.FC<SvgProps>> = {
  [PROVIDER_SAFARICOM_KE]: Safaricom,
};

type ReversedMark = {
  Mark: React.FC<SvgProps>;
  background: string;
  aspectRatio: number;
};

const REVERSED_MARKS: Record<number, ReversedMark> = {
  [PROVIDER_VODACOM_MZ]: {
    Mark: VodacomMzReversed,
    background: VODACOM_RED,
    aspectRatio: 3,
  },
};

const TILE_ASPECT_RATIO = 2.6;

export function reversedMarkOf(providerId: number): ReversedMark | null {
  return REVERSED_MARKS[providerId] ?? null;
}

export function ReversedPaymentMethodLogo({
  providerId,
  height = 40,
  style,
}: {
  providerId: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reversed = reversedMarkOf(providerId);
  if (!reversed) return null;
  const { Mark, aspectRatio } = reversed;
  return (
    <View style={style}>
      <Mark width={height * aspectRatio} height={height} />
    </View>
  );
}

export function PaymentMethodLogo({
  providerId,
  height = 26,
  style,
}: {
  providerId: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box: StyleProp<ViewStyle> = [
    styles.box,
    { height, width: height * TILE_ASPECT_RATIO },
    style,
  ];

  if (providerId === CASH_PAYMENT_PROVIDER) {
    return (
      <View style={[box, styles.cash]}>
        <Feather
          name="dollar-sign"
          size={height * 0.62}
          color={semantic.green}
        />
      </View>
    );
  }

  const raster = RASTER_MARKS[providerId];
  if (raster) {
    return (
      <View
        style={[
          box,
          raster.background
            ? {
                backgroundColor: raster.background,
                borderColor: raster.background,
              }
            : null,
        ]}
      >
        <Image
          source={raster.source}
          style={styles.mark}
          resizeMode="contain"
        />
      </View>
    );
  }

  const Vector = VECTOR_MARKS[providerId];
  if (Vector) {
    return (
      <View style={box}>
        <Vector width="100%" height="100%" />
      </View>
    );
  }

  return (
    <View style={[box, styles.unknown]}>
      <Feather name="credit-card" size={height * 0.62} color={semantic.ink3} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: semantic.line,
    backgroundColor: semantic.paper,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  mark: {
    width: '100%',
    height: '100%',
  },
  cash: {
    backgroundColor: semantic.greenLight,
    borderColor: semantic.greenLight,
  },
  unknown: {
    backgroundColor: semantic.bgSoft,
  },
});
