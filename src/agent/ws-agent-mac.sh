#!/bin/zsh
# WS-Agent for macOS - IT Assets register, Whitespace Partners.
# Run by launchd as root every 10 minutes (and at start-up) from /Library/WS-Agent.
# Every run: a heartbeat (who is signed in, network, free space, last start).
# Every 6 hours: the full inventory (hardware, macOS, security). Every 24 hours: the app list.
# It never reads passwords, keys, files, mail or browsing.
#   ws-agent.sh --dry-run    print what would be sent, send nothing

AGENT_VERSION='1.0.0'
DIR=/Library/WS-Agent
INVENTORY_EVERY=21600
SOFTWARE_EVERY=86400
export PATH=/usr/bin:/bin:/usr/sbin:/sbin

DRY=0
[[ "$1" == "--dry-run" ]] && DRY=1
[[ $DRY == 1 && "$2" != "" ]] && DIR="$2"

LOG="$DIR/agent.log"
TMP=$(mktemp -d /tmp/ws-agent.XXXXXX) || exit 1
trap 'rm -rf "$TMP"' EXIT

log() {
  print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >>"$LOG" 2>/dev/null
  tail -n 300 "$LOG" >"$TMP/log" 2>/dev/null && cat "$TMP/log" >"$LOG" 2>/dev/null
}

# ---------------------------------------------------------------- JSON (JavaScript for Automation)
# Builds the report from the raw files in $TMP, or reads one value out of a JSON file.
JXA='
ObjC.import("Foundation");
function read(p) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
  return s.isNil() ? "" : s.js;
}
function json(p) { try { return JSON.parse(read(p)); } catch (e) { return null; } }
function env(k) { const v = $.NSProcessInfo.processInfo.environment.objectForKey(k); return v.isNil() ? "" : v.js; }
const clean = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
const gib = (bytes) => (bytes ? Math.round((Number(bytes) / 1073741824) * 10) / 10 : null);
const day = (t) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(t || "")); return m ? m[1] : null; };
const iso = (t) => { const d = new Date(t); return isNaN(d) ? null : d.toISOString().replace(/\.\d+Z$/, "Z"); };
const sizeOf = (t) => {
  const m = /([\d.]+)\s*(TB|GB|MB)/i.exec(String(t || ""));
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toUpperCase() === "TB" ? n * 1024 : m[2].toUpperCase() === "MB" ? Math.round((n / 1024) * 10) / 10 : n;
};
const NAMES = { 11: "Big Sur", 12: "Monterey", 13: "Ventura", 14: "Sonoma", 15: "Sequoia", 26: "Tahoe" };

function volumes(T) {
  // df -k /: the startup disk (APFS: the free space of its whole container).
  const line = read(T + "/df").trim().split("\n").pop() || "";
  const f = line.split(/\s+/);
  if (f.length < 4) return [];
  return [{ drive: "HD", label: clean(env("VOLUME_NAME")) || "Macintosh HD",
            totalGb: Math.round((Number(f[1]) / 1048576) * 10) / 10,
            freeGb: Math.round((Number(f[3]) / 1048576) * 10) / 10 }];
}

function network(T) {
  const list = read(T + "/net").split("\n").filter(Boolean).map((l) => {
    const [name, dev, mac, ip, up] = l.split("|");
    return { name: clean(name), mac: (mac || "").toUpperCase(), ip: ip || "", type: /wi-?fi|airport/i.test(name) ? "wifi" : "lan", up: up === "1", dev: dev };
  }).filter((n) => n.mac);
  const main = list.find((n) => n.dev === env("DEFAULT_IF")) || list.find((n) => n.up && n.ip);
  return {
    ipAddress: main ? main.ip : "",
    macAddress: main ? main.mac : list.length ? list[0].mac : "",
    connection: main ? main.type : "",
    network: list.map(({ dev, ...n }) => n),
  };
}

function full(T, r) {
  const sp = json(T + "/sp.json") || {};
  const hw = (sp.SPHardwareDataType || [])[0] || {};
  const sw = (sp.SPSoftwareDataType || [])[0] || {};
  const laptop = /macbook/i.test(hw.machine_name || "");
  r.serialNumber = clean(hw.serial_number);
  r.hardwareUuid = clean(hw.platform_UUID);
  r.manufacturer = "Apple Inc.";
  r.model = clean([hw.machine_name, hw.machine_model ? "(" + hw.machine_model + ")" : ""].join(" "));
  r.chassis = laptop ? "laptop" : "desktop";
  r.cpu = clean(hw.chip_type || [hw.cpu_type, hw.current_processor_speed].filter(Boolean).join(" @ "));
  const cores = /(\d+)/.exec(String(hw.number_processors || ""));
  r.cpuCores = cores ? Number(cores[1]) : null;
  r.ramGb = sizeOf(hw.physical_memory);
  const mem = ((sp.SPMemoryDataType || [])[0] || {});
  r.ramText = clean([hw.physical_memory, mem.dimm_type, hw.chip_type ? "(unified)" : ""].join(" "));
  r.mainboard = clean(hw.machine_model);
  r.biosVersion = clean(hw.boot_rom_version);

  // The internal disk the system is on; its size is that of the APFS container.
  const vols = (sp.SPStorageDataType || []);
  const root = vols.find((v) => v.mount_point === "/") || {};
  const drive = root.physical_drive || {};
  const total = gib(root.size_in_bytes);
  // Apple sells 256 / 512 GB, 1 / 2 TB: the container is a little smaller, so take the next size up.
  const dec = Number(root.size_in_bytes || 0) / 1e9;
  const tier = [64, 128, 256, 512, 1024, 2048, 4096, 8192].find((t) => t >= dec * 0.98) || Math.round(dec);
  const kind = String(drive.medium_type || "").toLowerCase() === "ssd" ? "SSD" : clean(drive.medium_type).toUpperCase();
  r.disks = total ? [{ model: clean(drive.device_name), type: kind, sizeGb: Math.round((tier / 1.073741824) * 10) / 10 }] : [];
  r.diskText = total ? (kind + " " + (tier >= 1024 ? tier / 1024 + " TB" : tier + " GB")).trim() : "";
  r.diskTotalGb = total;

  const gpus = (sp.SPDisplaysDataType || []);
  r.gpu = gpus.map((g) => clean(g.sppci_model || g._name)).filter(Boolean).join(" + ");
  const vram = gpus.map((g) => sizeOf(g.spdisplays_vram || g.spdisplays_vram_shared)).filter((n) => n);
  r.gpuMemoryGb = vram.length && !hw.chip_type ? Math.max(...vram) : null;
  r.monitors = [];
  gpus.forEach((g) => (g.spdisplays_ndrvs || []).forEach((m) => {
    r.monitors.push({ name: clean(m._name === "Color LCD" ? "Built-in display" : m._name), maker: "", serial: clean(m._spdisplays_display_serial_number || "") });
  }));
  const power = (sp.SPPowerDataType || []).find((p) => p.sppower_battery_health_info) || null;
  const health = power ? power.sppower_battery_health_info : null;
  const pct = health && /(\d+)/.exec(String(health.sppower_battery_health_maximum_capacity || ""));
  r.batteryHealth = pct ? Number(pct[1]) : null;

  const ver = env("OS_VERSION");
  const major = Number(ver.split(".")[0]);
  r.osName = clean("macOS " + (NAMES[major] || ""));
  r.osVersion = clean(ver + " (" + env("OS_BUILD") + ")");
  r.osActivated = null;
  const history = json(T + "/history.json") || [];
  const dates = history.map((h) => ({ at: iso(h.date), by: String(h.processName || "") })).filter((h) => h.at);
  const updates = dates.filter((h) => /softwareupdate|Software Update/i.test(h.by)).map((h) => h.at).sort();
  r.lastUpdateAt = updates.length ? updates[updates.length - 1] : null;
  const all = dates.map((h) => h.at).sort();
  r.osInstallDate = all.length ? day(all[0]) : null;

  r.antivirus = clean(env("ANTIVIRUS")) || "XProtect (macOS)";
  r.antivirusEnabled = env("ANTIVIRUS") ? null : true;
  r.antivirusUpdatedAt = null;
  r.firewallEnabled = env("FIREWALL") === "" ? null : env("FIREWALL") === "1";
  r.diskEncrypted = env("FILEVAULT") === "" ? null : env("FILEVAULT") === "1";
  void sw;
}

function software(T) {
  const sp = json(T + "/apps.json") || {};
  return (sp.SPApplicationsDataType || [])
    .filter((a) => /^\/Applications\/|^\/Users\/[^/]+\/Applications\//.test(a.path || ""))
    .map((a) => {
      const signer = String((a.signed_by || [])[0] || "");
      const publisher = signer.replace(/^(Developer ID Application|Apple Mac OS Application Signing|Apple Development):\s*/, "").replace(/\s*\([A-Z0-9]+\)$/, "");
      return { name: clean(a._name), version: clean(a.version), publisher: clean(a.obtained_from === "apple" ? "Apple" : publisher), installDate: day(a.lastModified) };
    })
    .filter((a) => a.name);
}

function run(argv) {
  const [mode, T, a, b] = argv;
  if (mode === "get") { const j = json(T); return j && j[a] != null ? String(j[a]) : ""; }
  const r = { agentVersion: env("AGENT_VERSION"), os: "mac" };
  r.computerName = clean(env("COMPUTER_NAME"));
  r.hardwareUuid = clean(env("HW_UUID"));
  r.loginUser = clean(env("LOGIN_USER"));
  r.lastLoginUser = clean(env("LAST_USER"));
  Object.assign(r, network(T));
  const boot = Number(env("BOOT_SEC"));
  r.lastBootAt = boot ? new Date(boot * 1000).toISOString().replace(/\.\d+Z$/, "Z") : null;
  r.volumes = volumes(T);
  r.diskFreeGb = r.volumes.length ? r.volumes[0].freeGb : null;
  if (a === "1") full(T, r);
  if (b === "1") r.software = software(T);
  if (r.volumes.length && r.diskTotalGb == null) r.diskTotalGb = r.volumes[0].totalGb;
  return JSON.stringify(r);
}
'
jxa() { osascript -l JavaScript -e "$JXA" "$@"; }

# ---------------------------------------------------------------- collect

collect() {  # $1 = full (1/0), $2 = with apps (1/0); writes $TMP/report.json
  export AGENT_VERSION
  export COMPUTER_NAME="$(scutil --get ComputerName 2>/dev/null)"
  export HW_UUID="$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}')"
  local console="$(stat -f%Su /dev/console 2>/dev/null)"
  [[ "$console" == "root" || "$console" == "_mbsetupuser" ]] && console=""
  export LOGIN_USER="$console"
  export LAST_USER="$(defaults read /Library/Preferences/com.apple.loginwindow lastUserName 2>/dev/null)"
  export BOOT_SEC="$(sysctl -n kern.boottime 2>/dev/null | sed -E 's/.*sec = ([0-9]+).*/\1/')"
  export DEFAULT_IF="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
  export VOLUME_NAME="$(diskutil info / 2>/dev/null | awk -F': *' '/Volume Name/{print $2; exit}')"
  df -k / >"$TMP/df" 2>/dev/null

  # Network ports: "Hardware Port|device|MAC|IP|active".
  : >"$TMP/net"
  networksetup -listallhardwareports 2>/dev/null | awk -F': ' '/Hardware Port/{p=$2} /Device/{print p"|"$2}' |
    while IFS='|' read -r port dev; do
      [[ "$port" == *Bluetooth* || "$port" == *Thunderbolt\ Bridge* || "$dev" != en* ]] && continue
      local mac="$(ifconfig "$dev" 2>/dev/null | awk '/ether/{print $2; exit}')"
      local ip="$(ipconfig getifaddr "$dev" 2>/dev/null)"
      local up=0
      ifconfig "$dev" 2>/dev/null | grep -q 'status: active' && up=1
      print -r -- "$port|$dev|$mac|$ip|$up" >>"$TMP/net"
    done

  if [[ "$1" == 1 ]]; then
    system_profiler -json -detailLevel mini SPHardwareDataType SPSoftwareDataType SPStorageDataType \
      SPDisplaysDataType SPPowerDataType SPMemoryDataType >"$TMP/sp.json" 2>/dev/null
    plutil -convert json -o "$TMP/history.json" /Library/Receipts/InstallHistory.plist 2>/dev/null
    export OS_VERSION="$(sw_vers -productVersion 2>/dev/null)"
    export OS_BUILD="$(sw_vers -buildVersion 2>/dev/null)"
    local fw="$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null)"
    export FIREWALL=""
    [[ "$fw" == *enabled* ]] && FIREWALL=1
    [[ "$fw" == *disabled* ]] && FIREWALL=0
    local fv="$(fdesetup status 2>/dev/null)"
    export FILEVAULT=""
    [[ "$fv" == *"is On"* ]] && FILEVAULT=1
    [[ "$fv" == *"is Off"* ]] && FILEVAULT=0
    # An antivirus app other than the built-in XProtect.
    export ANTIVIRUS="$(ls /Applications 2>/dev/null | grep -iE 'ESET|Sophos|Falcon|Bitdefender|Kaspersky|Trend Micro|Malwarebytes|SentinelOne|Norton|Avast|AVG|Intego' | head -1 | sed 's/\.app$//')"
  fi
  if [[ "$2" == 1 ]]; then
    system_profiler -json -detailLevel mini SPApplicationsDataType >"$TMP/apps.json" 2>/dev/null
  fi
  jxa report "$TMP" "$1" "$2" >"$TMP/report.json"
}

send() {  # $1 = path, $2 = token or empty; answer in $TMP/answer.json, HTTP status printed
  local server="$(jxa get "$DIR/config.json" server)"
  local auth=()
  [[ -n "$2" ]] && auth=(-H "Authorization: Bearer $2")
  curl -sS -m 90 -o "$TMP/answer.json" -w '%{http_code}' -X POST "${auth[@]}" \
    -H 'Content-Type: application/json; charset=utf-8' --data-binary @"$TMP/report.json" "$server$1" 2>>"$LOG"
}

# ---------------------------------------------------------------- main

if [[ $DRY == 1 ]]; then
  collect 1 1
  cat "$TMP/report.json"
  echo
  exit 0
fi

[[ -f "$DIR/config.json" ]] || { log "No config.json: run the installer again."; exit 1; }
now=$(date +%s)
inventory_at=$(cat "$DIR/inventory_at" 2>/dev/null || echo 0)
software_at=$(cat "$DIR/software_at" 2>/dev/null || echo 0)
last_version=$(cat "$DIR/version" 2>/dev/null)
token=$(cat "$DIR/token" 2>/dev/null)

if [[ -z "$token" ]]; then
  # First run: enrol with everything; the computer waits for IT to approve it.
  collect 1 1
  key="$(jxa get "$DIR/config.json" enrollKey)"
  # Add the enrolment key to the report.
  sed -i '' "s/^{/{\"enrollKey\":\"$key\",/" "$TMP/report.json"
  code=$(send /api/agent/enroll "")
  if [[ "$code" == 200 ]]; then
    token="$(jxa get "$TMP/answer.json" token)"
    umask 077
    print -rn -- "$token" >"$DIR/token"
    print -r -- "$now" >"$DIR/inventory_at"
    print -r -- "$now" >"$DIR/software_at"
    print -r -- "$AGENT_VERSION" >"$DIR/version"
    log "Enrolled with the IT Assets register ($(jxa get "$TMP/answer.json" status))."
    exit 0
  fi
else
  full=0; apps=0
  [[ "$last_version" != "$AGENT_VERSION" ]] && { full=1; apps=1; }
  (( now - inventory_at >= INVENTORY_EVERY )) && full=1
  (( now - software_at >= SOFTWARE_EVERY )) && apps=1
  collect $full $apps
  code=$(send /api/agent/report "$token")
  if [[ "$code" == 200 ]]; then
    [[ $full == 1 ]] && print -r -- "$now" >"$DIR/inventory_at"
    [[ $apps == 1 ]] && print -r -- "$now" >"$DIR/software_at"
    print -r -- "$AGENT_VERSION" >"$DIR/version"
    log "Reported ($([[ $full == 1 ]] && echo full || echo heartbeat)$([[ $apps == 1 ]] && echo ' + apps')): $(jxa get "$TMP/answer.json" status)."
    exit 0
  fi
fi

if [[ "$code" == 401 ]]; then
  # The register no longer knows this token (removed, or another computer's): enrol again next time.
  rm -f "$DIR/token" "$DIR/inventory_at" "$DIR/software_at"
  log "Token refused: will enrol again on the next run."
elif [[ "$code" == 403 ]]; then
  log "This computer is blocked in the IT Assets register."
else
  log "Failed (HTTP $code): $(head -c 300 "$TMP/answer.json" 2>/dev/null)"
fi
exit 1
