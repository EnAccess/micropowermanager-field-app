const palette = {
  blue: '#174569',
  blueMid: '#1B75BA',
  sky: '#77D9F7',
  orange: '#FA8D41',
  orangeLight: '#FFEFE0',
  green: '#628B45',
  greenLight: '#E9F4DD',
  red: '#C73E3E',
  ink: '#0F2A3F',
  ink2: '#3D5265',
  ink3: '#7690A3',
  line: '#E3EAF0',
  line2: '#CFD9E1',
  bgSoft: '#F3F8FB',
  paper: '#FFFFFF',
} as const;

export const semantic = palette;

export const colors = {
  semantic,

  brand: {
    navy: palette.blue,
    primary: palette.blue,
    accent: palette.blueMid,
    sky: palette.sky,
    ice: palette.bgSoft,
  },
  accent: {
    orange: palette.orange,
    orangeSoft: palette.orange,
    orangeFaint: palette.orangeLight,
    green: palette.green,
    greenSoft: palette.green,
    greenFaint: palette.greenLight,
  },
  surface: {
    page: palette.paper,
    raised: palette.bgSoft,
    raisedAlt: palette.bgSoft,
    navy: palette.blue,
    overlay: 'rgba(15, 42, 63, 0.55)',
  },
  text: {
    primary: palette.ink,
    secondary: palette.ink2,
    muted: palette.ink3,
    inverse: palette.paper,
    brand: palette.blue,
    onNavy: palette.paper,
    onNavyMuted: 'rgba(255, 255, 255, 0.72)',
  },
  border: {
    subtle: palette.line,
    strong: palette.line2,
    onNavy: 'rgba(255, 255, 255, 0.16)',
    focus: palette.blue,
  },
  status: {
    success: palette.green,
    successSoft: palette.greenLight,
    warning: palette.orange,
    warningSoft: palette.orangeLight,
    danger: palette.red,
  },
  raw: palette,
} as const;

export type Colors = typeof colors;
