import { TextStyle } from 'react-native';

export const fonts = {
  ptRegular: 'PTSans_400Regular',
  ptBold: 'PTSans_700Bold',

  sansRegular: 'OpenSans_400Regular',
  sansSemibold: 'OpenSans_600SemiBold',
  sansBold: 'OpenSans_700Bold',

  monoRegular: 'CourierPrime_400Regular',
  monoBold: 'CourierPrime_700Bold',
} as const;

export const typography = {
  heroNumber: {
    fontFamily: fonts.ptBold,
    fontSize: 62,
    lineHeight: 68,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  heroNumberSm: {
    fontFamily: fonts.ptBold,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  pageTitle: {
    fontFamily: fonts.ptBold,
    fontSize: 28,
    lineHeight: 34,
  },
  screenTitle: {
    fontFamily: fonts.ptBold,
    fontSize: 17,
    lineHeight: 22,
  },
  sectionLabel: {
    fontFamily: fonts.ptBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  bodyEmphasis: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    lineHeight: 20,
  },
  bodyStrong: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  pill: {
    fontFamily: fonts.ptBold,
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  mono: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  monoStrong: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    lineHeight: 18,
  },

  display: {
    fontFamily: fonts.ptBold,
    fontSize: 30,
    lineHeight: 36,
  },
  title: {
    fontFamily: fonts.ptBold,
    fontSize: 22,
    lineHeight: 28,
  },
  heading: {
    fontFamily: fonts.ptBold,
    fontSize: 18,
    lineHeight: 24,
  },
  label: {
    fontFamily: fonts.ptBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  callout: {
    fontFamily: fonts.ptBold,
    fontSize: 14,
    lineHeight: 18,
  },
  caption: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  numeric: {
    fontFamily: fonts.ptBold,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  numericHero: {
    fontFamily: fonts.ptBold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  numericSmall: {
    fontFamily: fonts.ptBold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

export type TypographyToken = keyof typeof typography;
