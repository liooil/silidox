#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage:' \
    '  debug/capture-kerr.sh frame [time] [progress] [tracer]' \
    '  debug/capture-kerr.sh video [time] [progress] [duration] [speed] [tracer]' \
    '' \
    'Environment:' \
    '  SILIDOX_CAPTURE_DIR     Output directory (default: /tmp/silidox-captures)' \
    '  SILIDOX_CAPTURE_WIDTH   Canvas CSS width (default: 1600)' \
    '  SILIDOX_CAPTURE_HEIGHT  Canvas CSS height (default: 900)'
}

mode=${1:-frame}
case "$mode" in
  frame)
    time_seconds=${2:-12}
    progress=${3:-1}
    tracer=${4:-0}
    duration=6
    speed=1
    ;;
  video)
    time_seconds=${2:-0}
    progress=${3:-1}
    duration=${4:-6}
    speed=${5:-1}
    tracer=${6:-0}
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! command -v firefox >/dev/null 2>&1; then
  printf 'Firefox is required.\n' >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root_dir=$(cd -- "$script_dir/.." && pwd)
capture_dir=${SILIDOX_CAPTURE_DIR:-/tmp/silidox-captures}
profile_dir=${SILIDOX_FIREFOX_CAPTURE_PROFILE:-/tmp/silidox-firefox-capture-profile}
capture_width=${SILIDOX_CAPTURE_WIDTH:-1600}
capture_height=${SILIDOX_CAPTURE_HEIGHT:-900}
capture_id="$(date +%Y%m%d-%H%M%S)-$$"
archive_name="silidox-kerr-${mode}-${capture_id}.tar"
archive_path="$capture_dir/$archive_name"
extract_dir="$capture_dir/${archive_name%.tar}"
log_path="$capture_dir/firefox-${capture_id}.log"

mkdir -p -- "$capture_dir" "$profile_dir"
escaped_capture_dir=${capture_dir//\\/\\\\}
escaped_capture_dir=${escaped_capture_dir//\"/\\\"}
{
  printf 'user_pref("browser.download.folderList", 2);\n'
  printf 'user_pref("browser.download.dir", "%s");\n' "$escaped_capture_dir"
  printf 'user_pref("browser.download.useDownloadDir", true);\n'
  printf 'user_pref("browser.download.alwaysOpenPanel", false);\n'
  printf 'user_pref("browser.download.always_ask_before_handling_new_types", false);\n'
  printf 'user_pref("browser.helperApps.neverAsk.saveToDisk", "application/x-tar,application/octet-stream");\n'
  printf 'user_pref("browser.shell.checkDefaultBrowser", false);\n'
  printf 'user_pref("browser.tabs.warnOnClose", false);\n'
  printf 'user_pref("browser.startup.homepage_override.mstone", "ignore");\n'
  printf 'user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);\n'
  printf 'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);\n'
  printf 'user_pref("dom.webgpu.enabled", true);\n'
  printf 'user_pref("gfx.webrender.all", true);\n'
  printf 'user_pref("layout.css.devPixelsPerPx", "1.0");\n'
} > "$profile_dir/user.js"

root_url=${root_dir// /%20}
url="file://$root_url/debug/kerr-opening.html?capture=$mode&captureId=$capture_id&time=$time_seconds&progress=$progress&duration=$duration&speed=$speed&tracer=$tracer&width=$capture_width&height=$capture_height"

firefox --no-remote --profile "$profile_dir" "$url" > "$log_path" 2>&1 &
firefox_pid=$!

cleanup() {
  if kill -0 "$firefox_pid" 2>/dev/null; then
    kill "$firefox_pid" 2>/dev/null || true
    wait "$firefox_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

timeout_seconds=$((45 + ${duration%.*}))
deadline=$((SECONDS + timeout_seconds))
while [[ ! -s "$archive_path" ]]; do
  if ! kill -0 "$firefox_pid" 2>/dev/null; then
    printf 'Firefox exited before producing %s.\n' "$archive_name" >&2
    tail -n 40 "$log_path" >&2 || true
    exit 1
  fi
  if (( SECONDS >= deadline )); then
    printf 'Capture timed out after %s seconds. Firefox log: %s\n' "$timeout_seconds" "$log_path" >&2
    exit 1
  fi
  sleep 0.25
done

if ! tar -tf "$archive_path" >/dev/null; then
  printf 'Downloaded file is not a valid TAR archive: %s\n' "$archive_path" >&2
  exit 1
fi
mkdir -p -- "$extract_dir"
tar -xf "$archive_path" -C "$extract_dir"
manifest_path="$extract_dir/capture.json"
if [[ ! -f "$manifest_path" ]]; then
  printf 'Capture bundle has no manifest: %s\n' "$archive_path" >&2
  exit 1
fi
if ! grep -q '"status": "complete"' "$manifest_path"; then
  printf 'Capture failed according to %s:\n' "$manifest_path" >&2
  cat "$manifest_path" >&2
  exit 1
fi

printf 'bundle=%s\n' "$archive_path"
printf 'manifest=%s\n' "$manifest_path"
find "$extract_dir" -maxdepth 1 -type f ! -name capture.json -printf 'artifact=%p\n' | sort
