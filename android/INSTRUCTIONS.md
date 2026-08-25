# NoorApp Android App Bundle (AAB) release

The repository contains a Trusted Web Activity for `https://noorapp.in` with application ID `in.noorapp.islamic`. The signed release bundle is built by GitHub Actions and is uploaded as a workflow artifact; signing keys and passwords must never be committed to Git.

## GitHub Actions setup

Create these four **repository secrets** in GitHub under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the Play-compatible upload keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | Key password |

The workflow is located at `.github/workflows/android-aab.yml`. Run it manually from the **Actions** tab, or push a version tag such as `v2.0.0`. After a successful run, download the artifact named `noorapp-release-aab-<commit-sha>` and upload `app-release.aab` to Google Play Console.

To create the Base64 value locally, use a command such as:

```bash
base64 -w 0 path/to/upload-keystore.jks
```

Do not paste the keystore, passwords, or Base64 value into source files, issues, logs, or chat. Keep a secure backup of the keystore because future Play Store updates must use the same signing lineage or the configured Play App Signing upload key.

## Play Store release

In Google Play Console, create or open the NoorApp application, complete the required store listing and policy declarations, and upload the signed AAB from the GitHub Actions artifact. The current Android package ID is `in.noorapp.islamic`, and the current version code is `2`; increment `versionCode` in `android/app/build.gradle` for every new Play release.

## Digital Asset Links

The TWA association file must be publicly available at:

`https://noorapp.in/.well-known/assetlinks.json`

The file must contain the SHA-256 fingerprint of the certificate used for the published app. If the upload key or signing certificate changes, regenerate and redeploy this file before testing the TWA navigation experience.
