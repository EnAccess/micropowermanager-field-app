import {
  CourierPrime_400Regular,
  CourierPrime_700Bold,
} from '@expo-google-fonts/courier-prime';
import {
  OpenSans_400Regular,
  OpenSans_600SemiBold,
  OpenSans_700Bold,
} from '@expo-google-fonts/open-sans';
import { PTSans_400Regular, PTSans_700Bold } from '@expo-google-fonts/pt-sans';
import { useFonts } from 'expo-font';

export function useBrandFonts() {
  return useFonts({
    PTSans_400Regular,
    PTSans_700Bold,
    OpenSans_400Regular,
    OpenSans_600SemiBold,
    OpenSans_700Bold,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
  });
}
