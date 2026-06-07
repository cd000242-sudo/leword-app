# Mobile Store Credentials

Place store submission credentials here only on the release machine.

- `google-play-service-account.json` is used by `eas submit --platform android --profile production`.
- Do not commit JSON, p8, password, or private key files.
- iOS can use `EXPO_APPLE_APP_SPECIFIC_PASSWORD` with the `appleId` in `eas.json`, or App Store Connect API key fields in the submit profile.
- In CI, set `EXPO_ASC_API_KEY_P8_B64`, `EXPO_ASC_API_KEY_ISSUER_ID`, and `EXPO_ASC_API_KEY_ID`; `npm run mobile:submit-config:materialize` writes the temporary `.p8` file here before submit.
