# Restoring access to an expired Side Quest TestFlight build

**Important:** Current phone app bundle identifier: `com.ashlynsloanesteam.sidequest` (from `apps/mobile/app.json`). Rehab sandbox bundle ID: `com.ashlynsloanesteam.sidequest.rehabbeta`.

An expired TestFlight build stops launching after the Apple 90-day testing window. This is **not** proof that the app's SQLite database has been deleted.

## Preserve data before doing anything
1. **Do not delete/offload Side Quest or clear its data.** Do not replace its bundle identifier with an unrelated app.
2. Make an **encrypted Finder backup** of the iPhone on a trusted Mac: connect phone, Finder > [iPhone] > General > Back up all data to this Mac > Encrypt local backup > Back Up Now. Record the completion status. Keep the backup password safely.
3. Device backups may not guarantee that every database is recoverable. Before any app update, check whether the existing install has critical local-only entries and whether an accessible export exists.
4. Test fresh builds using the **separate Rehab Beta app identity**, not the production identifier.

## Path A — Run the new rehab beta without affecting the expired installation
From the feature branch and repository root:
```sh
pnpm install --frozen-lockfile
cd apps/mobile
npx eas-cli device:create
npx eas-cli build --platform ios --profile rehab-beta
```
This is a separate ad hoc-signed iOS app using a different bundle identifier. Device registration, paid Apple Developer credentials, and signing/provisioning may be required. You must log in locally; **never send Apple passwords or signing certificates to the assistant**. The separate beta starts with its **own empty SQLite database**. It does not revive or automatically migrate data from the expired TestFlight installation.

## Path B — Revive the existing TestFlight Side Quest
Use **the stable/default branch** `sq2-experience-rebuild`, not the unmerged rehab PR, for the recovery update. Confirm its app identifier is still `com.ashlynsloanesteam.sidequest`.

Follow the repository's existing EAS store build and submit flow after backing up your iPhone:
```sh
git checkout sq2-experience-rebuild
git pull --ff-only
pnpm install --frozen-lockfile
cd apps/mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```
The Apple Developer/App Store Connect owner must make a new build available in the existing TestFlight testing group. Verify the app version/build number and Apple processing status. Update the existing installation **in place** (do not uninstall it). Data may persist because bundle identity is unchanged, but **do not assume** it will—validate the local database immediately after opening the updated app. If a prompt suggests removing app data, stop.

A TestFlight internal testing build requires App Store-signed distribution; an EAS internal/ad hoc build is **not** a TestFlight build. Do not confuse `rehab-beta` and `production` EAS profiles.

## QA checkpoints
- Phone remains on original expired TestFlight icon before installing any new QA build.
- Rehab beta appears under a **different** app name/icon label and does not replace Side Quest.
- Original app remains installed while rehab beta can record and restore synthetic injury entries.
- Device backup is confirmed before any in-place TestFlight update.
- After original TestFlight recovery, assess actual local history, profile, and import/sync state; preserve evidence of restoration and never claim successful backup without testing it.

## References
- Apple TestFlight 90-day expiry: https://beta.itunes.apple.com/
- Expo iOS internal distribution: https://docs.expo.dev/build/internal-distribution/
- Expo TestFlight submission: https://docs.expo.dev/submit/testflight/
- Apple iPhone Finder backup: https://support.apple.com/guide/iphone/back-up-iphone-iph3ecf67d29/ios
