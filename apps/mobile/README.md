# Haksan Mobil Sekreter

Android/iOS companion app for the Haksan CRM call assistant and personal calendar.

## What It Does

- Logs into the existing CRM API with the same user account.
- Requests Android phone/call-log/notification permissions.
- Listens for incoming call state changes on Android.
- Sends completed or missed calls to `POST /api/v1/mobile/calls/events`.
- Shows Android notifications with CRM actions:
  - Teklif
  - Servis
  - Arama kaydı
  - Yoksay
- Lists pending call suggestions inside the app.
- Includes a manual phone-number test form for quick validation.
- Reads selected device calendars and synchronizes a rolling six-month past/future window with CRM.
- Writes CRM-created events back to the user's selected writable calendar.
- Keeps customer-visit calendar entries linked to CRM visit reporting.

## API URL

Use the same backend that the web app uses.

Android emulator:

```text
http://10.0.2.2:3000/api/v1
```

Physical Android phone on the same Wi-Fi as the Mac:

```text
http://YOUR_MAC_LAN_IP:3000/api/v1
```

Example from the current local run:

```text
http://192.168.2.98:3000/api/v1
```

## Run

From the repo root:

```bash
npm install
npm run dev:api
npm run dev:mobile
npm run android:mobile
```

iOS requires CocoaPods and Xcode:

```bash
cd apps/mobile/ios
pod install
cd ../../..
npm --workspace @haksan/mobile run ios
```

Then open the app, set the API URL, log in, and enable `Otomatik arama yakalama`.

## Android Permissions

This app uses:

- `READ_PHONE_STATE`
- `READ_CALL_LOG`
- `READ_PHONE_NUMBERS`
- `POST_NOTIFICATIONS`
- `READ_CALENDAR`
- `WRITE_CALENDAR`

For internal APK testing this is fine. Google Play distribution may reject broad Call Log access unless the app qualifies under Play's restricted permission policy. Treat this as an internal companion app unless the policy path is reviewed separately.

## iPhone

iPhone cannot expose normal GSM incoming call numbers to a third-party app in the same way. Call capture remains Android-only. Calendar synchronization is supported on iOS through EventKit full calendar access.
