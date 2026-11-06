import "server-only";
import macScript from "@/agent/ws-agent-mac.sh";
import agentScript from "@/agent/ws-agent.ps1";
import { HttpError } from "./errors";

/** The agent's version, from the line `$AgentVersion = '1.0.3'` of the script. */
export const AGENT_VERSION = /\$AgentVersion\s*=\s*'([\d.]+)'/.exec(agentScript)?.[1] ?? "0";

/**
 * install.cmd / uninstall.cmd for Windows, made when IT downloads them. install.cmd carries the
 * agent (base64, decoded by certutil), this site's address and the enrolment key; it puts them in
 * C:\ProgramData\WS-Agent (SYSTEM and Administrators only) and adds the scheduled tasks.
 * English only: cmd.exe shows Thai badly.
 */

const TASK = "WS-Agent";
const START_TASK = "WS-Agent (start-up)";
const RUN = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File %DIR%\\ws-agent.ps1";

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n";

export function installCmd(server: string, enrollKey: string): string {
  // Both end up inside `echo` lines: nothing cmd.exe would read as an operator.
  if (!/^https?:\/\/[A-Za-z0-9.:-]+$/.test(server)) throw new HttpError(500, "ที่อยู่เว็บไม่ถูกต้อง");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(enrollKey)) {
    throw new HttpError(500, "DEVICE_ENROLL_KEY ใช้ได้เฉพาะ A-Z a-z 0-9 _ - ยาว 16 ตัวขึ้นไป");
  }
  const base64 = Buffer.from(agentScript.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64");
  const chunks = base64.match(/.{1,76}/g) ?? [];
  return crlf([
    "@echo off",
    "rem WS-Agent installer - IT Assets register, Whitespace Partners.",
    "rem Right-click > Run as administrator. Installs C:\\ProgramData\\WS-Agent and two scheduled",
    "rem tasks (SYSTEM): every 10 minutes and at start-up. Remove with uninstall.cmd.",
    "rem It reports hardware, Windows, network, signed-in user, security on/off and installed programs.",
    "rem It never reads passwords, product keys, files or browsing.",
    "setlocal",
    "net session >nul 2>&1",
    "if errorlevel 1 (",
    '  echo Please right-click install.cmd and choose "Run as administrator".',
    "  pause",
    "  exit /b 1",
    ")",
    'set "DIR=%ProgramData%\\WS-Agent"',
    'if not exist "%DIR%" mkdir "%DIR%"',
    "rem Only SYSTEM and Administrators may read the folder (it holds the key and the token).",
    'icacls "%DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" >nul',
    'set "B64=%DIR%\\ws-agent.b64"',
    '>"%B64%" echo -----BEGIN CERTIFICATE-----',
    ...chunks.map((line) => `>>"%B64%" echo ${line}`),
    '>>"%B64%" echo -----END CERTIFICATE-----',
    'certutil -f -decode "%B64%" "%DIR%\\ws-agent.ps1" >nul',
    'del "%B64%"',
    `>"%DIR%\\config.json" echo {"server":"${server}","enrollKey":"${enrollKey}"}`,
    `schtasks /create /tn "${TASK}" /tr "${RUN}" /sc minute /mo 10 /ru SYSTEM /rl HIGHEST /f >nul`,
    `schtasks /create /tn "${START_TASK}" /tr "${RUN}" /sc onstart /delay 0001:00 /ru SYSTEM /rl HIGHEST /f >nul`,
    "rem Forget when the last full report was sent, so this run sends everything again.",
    'if exist "%DIR%\\state.json" del "%DIR%\\state.json"',
    "echo Sending a full report, about 30 seconds...",
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DIR%\\ws-agent.ps1"',
    "if errorlevel 1 (",
    "  echo.",
    "  echo FAILED. Details: %DIR%\\agent.log",
    ") else (",
    "  echo.",
    "  echo Done. Approve this computer in IT Assets ^> Hardware.",
    ")",
    "pause",
  ]);
}

export function uninstallCmd(): string {
  return crlf([
    "@echo off",
    "rem Removes WS-Agent (IT Assets register). Right-click > Run as administrator.",
    "net session >nul 2>&1",
    "if errorlevel 1 (",
    '  echo Please right-click uninstall.cmd and choose "Run as administrator".',
    "  pause",
    "  exit /b 1",
    ")",
    `schtasks /delete /tn "${TASK}" /f >nul 2>&1`,
    `schtasks /delete /tn "${START_TASK}" /f >nul 2>&1`,
    'rmdir /s /q "%ProgramData%\\WS-Agent"',
    "echo WS-Agent removed. Delete the computer in IT Assets ^> Hardware if it is no longer used.",
    "pause",
  ]);
}

// ---------------------------------------------------------------- macOS

/** The Mac agent's version, from the line `AGENT_VERSION='1.0.0'` of its script. */
export const MAC_AGENT_VERSION = /AGENT_VERSION='([\d.]+)'/.exec(macScript)?.[1] ?? "0";

const MAC_DIR = "/Library/WS-Agent";
const MAC_LABEL = "com.whitespace.ws-agent";
const MAC_PLIST = `/Library/LaunchDaemons/${MAC_LABEL}.plist`;
const lf = (lines: string[]) => lines.join("\n") + "\n";

/**
 * install_agent_mac.sh: run in Terminal with `sudo bash install_agent_mac_….sh`. Puts the agent,
 * this site's address and the enrolment key in /Library/WS-Agent (root only) and a LaunchDaemon
 * that runs it every 10 minutes and at start-up.
 */
export function installMac(server: string, enrollKey: string): string {
  if (!/^https?:\/\/[A-Za-z0-9.:-]+$/.test(server)) throw new HttpError(500, "ที่อยู่เว็บไม่ถูกต้อง");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(enrollKey)) {
    throw new HttpError(500, "DEVICE_ENROLL_KEY ใช้ได้เฉพาะ A-Z a-z 0-9 _ - ยาว 16 ตัวขึ้นไป");
  }
  const base64 = Buffer.from(macScript.replace(/\r\n/g, "\n"), "utf8").toString("base64");
  return lf([
    "#!/bin/bash",
    "# WS-Agent installer for macOS - IT Assets register, Whitespace Partners.",
    "# Run in Terminal:  sudo bash ~/Downloads/<this file>",
    `# Installs ${MAC_DIR} and a LaunchDaemon (root): every 10 minutes and at start-up.`,
    "# It reports hardware, macOS, network, signed-in user, security on/off and installed apps.",
    "# It never reads passwords, keys, files, mail or browsing. Remove with uninstall_agent_mac.sh.",
    'if [ "$(id -u)" != "0" ]; then',
    '  echo "Please run:  sudo bash \\"$0\\""',
    "  exit 1",
    "fi",
    `DIR=${MAC_DIR}`,
    'mkdir -p "$DIR" && chown root:wheel "$DIR" && chmod 700 "$DIR"',
    "/usr/bin/base64 -D > \"$DIR/ws-agent.sh\" <<'WS_AGENT_B64'",
    ...(base64.match(/.{1,76}/g) ?? []),
    "WS_AGENT_B64",
    'chmod 700 "$DIR/ws-agent.sh"',
    "cat > \"$DIR/config.json\" <<'WS_AGENT_CFG'",
    `{"server":"${server}","enrollKey":"${enrollKey}"}`,
    "WS_AGENT_CFG",
    'chmod 600 "$DIR/config.json"',
    "# Forget when the last full report was sent, so this run sends everything again.",
    'rm -f "$DIR/inventory_at" "$DIR/software_at"',
    `cat > ${MAC_PLIST} <<'WS_AGENT_PLIST'`,
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `  <key>Label</key><string>${MAC_LABEL}</string>`,
    `  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>${MAC_DIR}/ws-agent.sh</string></array>`,
    "  <key>StartInterval</key><integer>600</integer>",
    "  <key>RunAtLoad</key><true/>",
    "  <key>StandardOutPath</key><string>/dev/null</string>",
    "  <key>StandardErrorPath</key><string>/dev/null</string>",
    "</dict></plist>",
    "WS_AGENT_PLIST",
    `chown root:wheel ${MAC_PLIST} && chmod 644 ${MAC_PLIST}`,
    `launchctl bootout system/${MAC_LABEL} 2>/dev/null`,
    'echo "Sending a full report, about 1 minute..."',
    'if /bin/zsh "$DIR/ws-agent.sh"; then',
    '  echo; echo "Done. Approve this Mac in IT Assets > Hardware."',
    "else",
    '  echo; echo "FAILED. Details: $DIR/agent.log"',
    "fi",
    `launchctl bootstrap system ${MAC_PLIST}`,
  ]);
}

export function uninstallMac(): string {
  return lf([
    "#!/bin/bash",
    "# Removes WS-Agent (IT Assets register) from this Mac. Run:  sudo bash <this file>",
    'if [ "$(id -u)" != "0" ]; then',
    '  echo "Please run:  sudo bash \\"$0\\""',
    "  exit 1",
    "fi",
    `launchctl bootout system/${MAC_LABEL} 2>/dev/null`,
    `rm -f ${MAC_PLIST}`,
    `rm -rf ${MAC_DIR}`,
    'echo "WS-Agent removed. Delete the Mac in IT Assets > Hardware if it is no longer used."',
  ]);
}
