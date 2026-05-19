import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import PhoneInput, {
  ICountry,
  getCountryByCca2,
  getCountryByPhoneNumber,
} from 'react-native-international-phone-number';

import { fonts, radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

const PREFERRED_CCA2 = ['TZ', 'KE', 'UG', 'NG', 'CM', 'GH', 'RW', 'ZA', 'MZ'];

type PhoneFieldProps = {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  label?: string;
  error?: string;
  defaultIso?: string;
  placeholder?: string;
};

function callingCodeOf(country: ICountry): string {
  const suffix = country.idd.suffixes[0] ?? '';
  return `${country.idd.root}${suffix}`;
}

export function PhoneField({
  value,
  onChange,
  onBlur,
  label,
  error,
  defaultIso = 'TZ',
  placeholder = '712 345 678',
}: PhoneFieldProps) {
  const [selectedCountry, setSelectedCountry] = useState<ICountry | null>(
    () => {
      if (value) {
        const detected = getCountryByPhoneNumber(value);
        if (detected) return detected;
      }
      return getCountryByCca2(defaultIso) ?? null;
    },
  );

  const [phoneNumber, setPhoneNumber] = useState<string>(() => {
    if (!value || !selectedCountry) return '';
    const code = callingCodeOf(selectedCountry);
    return value.startsWith(code)
      ? value.slice(code.length)
      : value.replace(/^\+/, '');
  });

  const [touched, setTouched] = useState(Boolean(value));

  function emit(country: ICountry | null, phone: string) {
    if (!country) {
      onChange('');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    onChange(digits ? `${callingCodeOf(country)}${digits}` : '');
  }

  function handlePhoneChange(phone: string) {
    if (phone) setTouched(true);
    setPhoneNumber(phone);
    emit(selectedCountry, phone);
  }

  function handleCountryChange(country: ICountry) {
    setSelectedCountry(country);
    emit(country, phoneNumber);
  }

  return (
    <View style={styles.container}>
      {label ? (
        <Text variant="sectionLabel" tone="secondary" style={styles.label}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      <PhoneInput
        value={phoneNumber}
        defaultCountry={defaultIso as never}
        selectedCountry={selectedCountry}
        onChangePhoneNumber={handlePhoneChange}
        onChangeSelectedCountry={handleCountryChange}
        popularCountries={PREFERRED_CCA2 as never}
        placeholder={placeholder}
        phoneInputPlaceholderTextColor={semantic.ink3}
        onBlur={onBlur}
        modalSearchInputPlaceholder="Search by name or code"
        modalPopularCountriesTitle="Suggested"
        modalAllCountriesTitle="All countries"
        phoneInputStyles={{
          container: touched && error ? styles.frameError : styles.frame,
          flagContainer: styles.flagContainer,
          flag: styles.flag,
          callingCode: styles.callingCode,
          divider: styles.divider,
          caret: styles.caret,
          input: styles.input,
        }}
      />
      {touched && error ? (
        <Text variant="meta" tone="danger" style={styles.helper}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  frame: {
    backgroundColor: semantic.paper,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    minHeight: 48,
  },
  frameError: {
    backgroundColor: semantic.paper,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: semantic.red,
    minHeight: 48,
  },
  flagContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
  },
  flag: {
    fontSize: 18,
  },
  callingCode: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: semantic.ink,
  },
  divider: {
    backgroundColor: semantic.line2,
  },
  caret: {
    color: semantic.ink2,
    fontSize: 12,
  },
  input: {
    color: semantic.ink,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  helper: {
    marginTop: spacing.xs,
  },
});
