export const radii = {
  input: 12,
  button: 12,
  card: 14,
  pill: 999,
  sheetTop: 20,
} as const;

export type RadiiToken = keyof typeof radii;
