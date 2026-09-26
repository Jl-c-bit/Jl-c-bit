# Phone spyware scan

A read-only check for stalkerware and spyware. It runs on your computer and
inspects a phone connected over USB. It never changes or deletes anything.

## Android: `scan-android.sh`

1. Install Android platform-tools (this provides `adb`):
   https://developer.android.com/tools/releases/platform-tools
2. On the phone, go to **Settings → About phone** and tap **Build number** 7 times.
   Then go to **Settings → System → Developer options** and turn on **USB debugging**.
3. Plug the phone in and tap **Allow** on the prompt.
4. Run the scan:
   ```bash
   ./scan-android.sh            # downloads the latest known-stalkerware list
   ./scan-android.sh --offline  # uses the small built-in list
   ```
5. When you're done, turn **USB debugging** off again.

What the scan checks:

| # | Check | Why it matters |
|---|-------|----------------|
| 1 | Installed apps vs. about 600 known stalkerware packages ([Echap indicators](https://github.com/AssoEchap/stalkerware-indicators)) | A direct match is a strong sign |
| 2 | Device admin apps | Spyware uses admin rights so it can't be uninstalled |
| 3 | Accessibility services | These can read everything on screen and log keystrokes |
| 4 | Notification access | These can read your messages as they arrive |
| 5 | Sideloaded apps | Most stalkerware can't be installed from Play |
| 6 | Apps with no launcher icon | Spyware usually hides its icon |
| 7 | Apps with 4 or more surveillance permissions | Location, microphone, SMS, call log, camera and so on |
| 8 | Play Protect off, unknown sources allowed, root | These make spyware easier to install |

`[!]` marks a strong indicator. `[?]` marks something to review, and many of those
will be apps you installed yourself.

**Safety note:** if someone else may have installed the spyware, removing it can alert
them. Consider contacting a support service such as https://stopstalkerware.org first.

## iPhone

Apple doesn't allow app-level inspection over USB the way Android does. Use Amnesty
International's Mobile Verification Toolkit (MVT), which checks an encrypted backup
for known spyware such as Pegasus:

```bash
pip install mvt
# Make an encrypted backup in Finder/iTunes, or with: idevicebackup2 backup --full ./backup
mvt-ios decrypt-backup -p <backup-password> -d ./decrypted ./backup
mvt-ios download-iocs
mvt-ios check-backup --output ./mvt-results ./decrypted
```

Also check these manually: **Settings → General → VPN & Device Management** (look for
unknown profiles), your Apple ID's device list, and whether anyone else knows your
passcode or Apple ID password.
