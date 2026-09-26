#!/usr/bin/env bash
# Read-only stalkerware / spyware check for an Android phone over USB (adb).
# It never changes or uninstalls anything; it only reports what it finds.
#
# Usage: ./scan-android.sh [--offline]
#   --offline  skip downloading the public stalkerware indicator list

set -u

IOC_URL="https://raw.githubusercontent.com/AssoEchap/stalkerware-indicators/master/ioc.yaml"
OFFLINE=0
[ "${1:-}" = "--offline" ] && OFFLINE=1

# Small built-in list used when the full list can't be downloaded.
FALLBACK_IOCS="com.thetruth TheTruthSpy
com.systemservice TheTruthSpy
com.mxspy TheTruthSpy
com.spyzee TheTruthSpy
com.fone TheTruthSpy
com.android.core.mngi mSpy
com.mspy.lite mSpy
com.flexispy FlexiSPY
com.android.systemupdate.service Generic-disguised
com.hoverwatch Hoverwatch
com.cocospy Cocospy
com.spyic Spyic
com.spyier Spyier
com.xnspy XNSPY
com.highstermobile Highster
com.ikeymonitor iKeyMonitor
com.spyhuman SpyHuman
com.cerberus Cerberus"

# Permissions that together let an app watch you. Each alone is often legitimate.
RISKY_PERMS="ACCESS_FINE_LOCATION ACCESS_BACKGROUND_LOCATION RECORD_AUDIO CAMERA READ_SMS RECEIVE_SMS READ_CALL_LOG READ_CONTACTS PROCESS_OUTGOING_CALLS READ_PHONE_STATE"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
hdr()    { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

FINDINGS=0
WARNINGS=0
flag() { red   "  [!] $*"; FINDINGS=$((FINDINGS+1)); }
warn() { yellow "  [?] $*"; WARNINGS=$((WARNINGS+1)); }

a() { adb shell "$@" 2>/dev/null | tr -d '\r'; }

# --- Preconditions -----------------------------------------------------------
if ! command -v adb >/dev/null 2>&1; then
  red "adb not found. Install Android platform-tools: https://developer.android.com/tools/releases/platform-tools"
  exit 2
fi
state=$(adb get-state 2>/dev/null)
if [ "$state" != "device" ]; then
  red "No authorised device. Enable USB debugging, plug in, and tap 'Allow' on the phone."
  exit 2
fi

hdr "Device"
echo "  Model:   $(a getprop ro.product.manufacturer) $(a getprop ro.product.model)"
echo "  Android: $(a getprop ro.build.version.release) (patch $(a getprop ro.build.version.security_patch))"

# --- Load indicators ---------------------------------------------------------
IOCS=""
if [ "$OFFLINE" -eq 0 ] && command -v curl >/dev/null 2>&1; then
  yaml=$(curl -fsSL --max-time 20 "$IOC_URL" 2>/dev/null || true)
  if [ -n "$yaml" ]; then
    IOCS=$(printf '%s\n' "$yaml" | awk '
      /^- name:/      { sub(/^- name: */, ""); name=$0; inp=0; next }
      /^  packages:/  { inp=1; next }
      inp && /^  - / { sub(/^  - */, ""); print $0, name; next }
      /^  [a-z_]+:/   { inp=0 }')
  fi
fi
if [ -n "$IOCS" ]; then
  echo "  Loaded $(printf '%s\n' "$IOCS" | wc -l | tr -d ' ') known stalkerware package names (Echap list)."
else
  IOCS="$FALLBACK_IOCS"
  yellow "  Using built-in indicator list (offline or download failed)."
fi

# --- 1. Installed apps vs. known stalkerware ---------------------------------
hdr "1. Known stalkerware packages"
ALL_PKGS=$(a pm list packages | sed 's/^package://' | sort -u)
THIRD=$(a pm list packages -3 -i | sed 's/^package://')
hit=0
while read -r pkg name; do
  [ -z "$pkg" ] && continue
  if printf '%s\n' "$ALL_PKGS" | grep -qxF "$pkg"; then
    flag "$pkg installed (matches $name)"; hit=1
  fi
done <<< "$IOCS"
[ $hit -eq 0 ] && green "  None found."

# --- 2. Device admin apps -----------------------------------------------------
hdr "2. Device administrator apps (can block uninstall / wipe / lock)"
admins=$(a dumpsys device_policy | grep -oE 'ComponentInfo\{[^}]+\}' | sed 's/ComponentInfo{//; s/}//' | cut -d/ -f1 | sort -u)
if [ -z "$admins" ]; then green "  None."; else
  while read -r p; do
    case "$p" in
      com.google.android.gms|com.google.android.apps.work.*|com.android.*) echo "  $p (system/Google)";;
      *) warn "$p is a device admin - make sure you recognise it";;
    esac
  done <<< "$admins"
fi

# --- 3. Accessibility services -----------------------------------------------
hdr "3. Accessibility services (can read everything on screen)"
acc=$(a settings get secure enabled_accessibility_services)
if [ -z "$acc" ] || [ "$acc" = "null" ]; then green "  None enabled."; else
  printf '%s\n' "$acc" | tr ':' '\n' | cut -d/ -f1 | sort -u | while read -r p; do
    [ -n "$p" ] && echo "  $p"
  done
  warn "Accessibility services are enabled - spyware abuses these. Check each one above."
fi

# --- 4. Notification listeners -----------------------------------------------
hdr "4. Notification access (can read your messages as they arrive)"
nl=$(a settings get secure enabled_notification_listeners)
if [ -z "$nl" ] || [ "$nl" = "null" ]; then green "  None."; else
  printf '%s\n' "$nl" | tr ':' '\n' | cut -d/ -f1 | sort -u | while read -r p; do
    [ -n "$p" ] && echo "  $p"
  done
fi

# --- 5. Sideloaded apps ------------------------------------------------------
hdr "5. Apps not installed from an app store"
side=$(printf '%s\n' "$THIRD" | awk '
  { pkg=$1; inst=$2; sub(/^installer=/, "", inst) }
  inst=="" || inst=="null" || inst ~ /packageinstaller|shell/ { print pkg }')
if [ -z "$side" ]; then green "  None."; else
  while read -r p; do warn "$p was sideloaded (not from Play/Galaxy store)"; done <<< "$side"
fi

# --- 6. Hidden apps (no launcher icon) ---------------------------------------
hdr "6. User-installed apps with no home-screen icon"
launchable=$(a cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  | grep -oE '^[[:space:]]*[a-zA-Z0-9_.]+/' | tr -d ' /' | sort -u)
if [ -z "$launchable" ]; then
  echo "  (Could not list launcher apps on this Android version - skipped.)"
else
  hidden=0
  while read -r p _; do
    [ -z "$p" ] && continue
    if ! printf '%s\n' "$launchable" | grep -qxF "$p"; then warn "$p has no app icon"; hidden=1; fi
  done <<< "$THIRD"
  [ $hidden -eq 0 ] && green "  None."
fi

# --- 7. Surveillance-capable permission combos -------------------------------
hdr "7. User apps holding many surveillance permissions"
perm_report=$(a dumpsys package packages | awk -v risky="$RISKY_PERMS" '
  BEGIN { n=split(risky, r, " "); for (i=1;i<=n;i++) want["android.permission." r[i]]=r[i] }
  /^  Package \[/ { if (pkg!="") emit(); pkg=$2; gsub(/[\[\]]/, "", pkg); list=""; cnt=0; delete seen; next }
  /granted=true/ { p=$1; sub(/:$/, "", p); if (p in want && !(p in seen)) { seen[p]=1; cnt++; list=list " " want[p] } }
  END { if (pkg!="") emit() }
  function emit() { if (cnt>=4) print pkg ":" list }')
third_names=$(printf '%s\n' "$THIRD" | awk '{print $1}')
combo=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  p=${line%%:*}
  if printf '%s\n' "$third_names" | grep -qxF "$p"; then
    warn "$p ->${line#*:}"; combo=1
  fi
done <<< "$perm_report"
[ $combo -eq 0 ] && green "  None with 4+ risky permissions."

# --- 8. Other settings -------------------------------------------------------
hdr "8. Other risky settings"
[ "$(a settings get global package_verifier_enable)" = "0" ] && flag "Google Play Protect app verification is OFF"
[ "$(a settings get secure install_non_market_apps)" = "1" ] && warn "Installing from unknown sources is allowed"
if a which su >/dev/null 2>&1 && [ -n "$(a which su)" ]; then flag "Device appears to be rooted (su binary present)"; fi
echo "  Done."

# --- Summary -----------------------------------------------------------------
hdr "Summary"
if [ $FINDINGS -gt 0 ]; then
  red "  $FINDINGS strong indicator(s), $WARNINGS item(s) to review."
elif [ $WARNINGS -gt 0 ]; then
  yellow "  No known spyware. $WARNINGS item(s) to review - most are probably apps you installed yourself."
else
  green "  Nothing suspicious found."
fi
cat <<'TXT'

  Before removing anything: if someone may have put this there to track you,
  removing it can alert them. Consider talking to a support service first
  (e.g. https://stopstalkerware.org). To remove an app:
    Settings > Security > Device admin apps  (turn it off first, if listed)
    then  adb uninstall <package>   or uninstall from Settings > Apps.
TXT
