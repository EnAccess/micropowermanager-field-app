<p align="center">
  <a href="https://github.com/EnAccess/micropowermanager-field-app">
    <img
      src="https://micropowermanager.io/mpmlogo_raw.png"
      alt="MicroPowerManager Field App"
      width="320"
    >
  </a>
</p>
<p align="center">
    <em>Decentralized utility management made simple. Manage customers, revenues and assets with this all-in one open source platform.</em>
</p>
<p align="center">
  <img
    alt="Project Status"
    src="https://img.shields.io/badge/Project%20Status-beta-orange"
  >
  <img
    alt="GitHub Workflow Status"
    src="https://img.shields.io/github/actions/workflow/status/EnAccess/micropowermanager-field-app/check-generic.yaml"
  >
  <a href="https://github.com/EnAccess/micropowermanager-field-app/blob/main/LICENSE" target="_blank">
    <img
      alt="License"
      src="https://img.shields.io/github/license/EnAccess/micropowermanager-field-app"
    >
  </a>
</p>

---

# MicroPowerManager - Field App

MicroPowerManager (MPM) is a decentralized utility and customer management tool.
Manage customers, revenues and assets with this all-in one Open Source platform.

## Get Started

This repository contains the source code for the [MicroPowerManager Field App](https://micropowermanager.io/usage-guide/android-apps.html) — a cross-platform Expo / React Native app that lets field agents register customers, record appliance sales, and collect payments, online or offline.

### Prerequisites

- [Node.js](https://nodejs.org/) 20 LTS and npm
- [Xcode](https://developer.apple.com/xcode/) (iOS) and/or [Android Studio](https://developer.android.com/studio) (Android)
- Git clone the repository

### Build and run the app locally

```sh
npm install
npm start          # Metro dev server
npm run android    # build & install on Android emulator/device
npm run ios        # build & install on iOS simulator/device
```

The app uses location permissions, so ensure the emulator or device has location services enabled.

### Connecting to a backend

On first launch the app shows an environment picker:

| Option   | Use when                                                |
| -------- | ------------------------------------------------------- |
| `Demo`   | Explore against the public demo tenant                  |
| `Cloud`  | Sign in with a `<company>.micropowermanager.cloud` slug |
| `Custom` | Self-hosted, local, or staging                          |

### Create a release build locally

For Android

```sh
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# output: android/app/build/outputs/apk/release
```

For iOS, open the generated `ios/` workspace in Xcode and archive (or use [EAS Build](https://docs.expo.dev/eas/)).

## Architecture

File-based routing on **Expo Router** with an offline-first data layer.

- **Expo Router** for navigation (typed, file-based routes)
- **TanStack React Query** for server cache and request orchestration
- **Axios** client with auth + `device-id` interceptors and a 401 → re-login handler
- **AsyncStorage** outbox; **expo-secure-store** for tokens
- **React Hook Form** + **Zod** for forms and validation
- Custom design system in `src/components` + `src/theme`

### Routing (`app/`)

- `(auth)` — `environment`, `login`
- `(app)/(tabs)` — `index`, `customers`, `sales`, `payments`
- `(app)/{customers,sales,payments}/` — `[id]` and `new` screens

### Offline Outbox

Mutations that fail offline are queued in `src/storage/outbox.ts` (AsyncStorage, capped at 200 entries) and replayed by `outboxDrainer.ts` once `useNetworkStatus` reports connectivity. `SyncBanner` surfaces pending and failed counts.

### Session

`SessionContext` (`src/auth/SessionContext.tsx`) holds the active environment, token, and agent. Tokens live in `expo-secure-store`; a stable `device-id` is generated on first launch.

## Feature Modules

### Customers

Browse, search, register, and inspect customers.
Screens: `(tabs)/customers.tsx`, `customers/new.tsx`, `customers/[id]/index.tsx`.
Registration captures a geolocation fix and is enqueued in the outbox if offline.

### Sales

Sell appliances on credit or PAYG.
Screens: `(tabs)/sales.tsx`, `sales/new.tsx`, `sales/[id].tsx`.

### Payments

Record payments and view receipts.
Screens: `(tabs)/payments.tsx`, `payments/new.tsx`, `payments/[id].tsx`.

## Development Notes

- TypeScript strict mode; `@/*` aliases `src/*`.
- Prefer `react-hook-form` + `zodResolver` for new forms — see `customers/new.tsx`.
- Use theme tokens from `@/theme` (`semantic`, `spacing`, `radii`, `shadows`) rather than hard-coded values.
- SVGs load via `react-native-svg-transformer` (types in `svg.d.ts`).
- Location permission is requested on demand from the registration flow, not at boot.
