# WS-Agent: reports this computer to the IT Assets register (Whitespace Partners).
# Installed by install.cmd into C:\ProgramData\WS-Agent and run by Task Scheduler as SYSTEM every
# 10 minutes and at start-up. Windows PowerShell 5.1, no modules to install.
#
# What it sends: computer identity, hardware, Windows version, network addresses, the signed-in
# user name, antivirus / firewall / BitLocker on-off, installed programs (once a day).
# What it never sends: passwords, product keys, recovery keys, files, browsing, screenshots.
#
#   ws-agent.ps1            report (enrols on the first run)
#   ws-agent.ps1 -DryRun    print what would be sent, send nothing
#   -ConfigDir <folder>     another folder than C:\ProgramData\WS-Agent (for testing)
param([switch]$DryRun, [string]$ConfigDir)

$ErrorActionPreference = 'Stop'
$AgentVersion = '1.0.0'
$Dir = if ($ConfigDir) { $ConfigDir } else { Join-Path $env:ProgramData 'WS-Agent' }
$ConfigFile = Join-Path $Dir 'config.json'
$TokenFile = Join-Path $Dir 'token'
$StateFile = Join-Path $Dir 'state.json'
$LogFile = Join-Path $Dir 'agent.log'
# A full inventory every 6 hours, the program list once a day; a short heartbeat in between.
$InventoryEvery = [TimeSpan]::FromHours(6)
$SoftwareEvery = [TimeSpan]::FromHours(24)

function Write-Log([string]$Text) {
  $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Text
  Write-Output $line
  if ($DryRun) { return }
  try {
    $old = @()
    if (Test-Path $LogFile) { $old = @(Get-Content $LogFile -Tail 300) }
    Set-Content -Path $LogFile -Value ($old + $line) -Encoding UTF8
  } catch { }
}

# Runs a block; on any error returns $null instead, so one missing class never stops a report.
function Try-Get([scriptblock]$Block) {
  try { & $Block } catch { $null }
}

function Iso([object]$Date) {
  if ($null -eq $Date) { return $null }
  try { return ([datetime]$Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } catch { return $null }
}

function Day([object]$Date) {
  if ($null -eq $Date) { return $null }
  try { return ([datetime]$Date).ToString('yyyy-MM-dd') } catch { return $null }
}

function Gb([object]$Bytes, [int]$Digits = 1) {
  if ($null -eq $Bytes) { return $null }
  return [math]::Round([double]$Bytes / 1GB, $Digits)
}

function Clean([object]$Text) {
  if ($null -eq $Text) { return '' }
  return ([string]$Text).Trim() -replace '\s+', ' '
}

# WMI strings stored as arrays of character codes (monitor names and serials).
function Chars([object]$Codes) {
  if ($null -eq $Codes) { return '' }
  return Clean ((@($Codes) | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ }) -join '')
}

# ---------------------------------------------------------------- what is collected

function Get-Identity {
  $cs = Get-CimInstance Win32_ComputerSystem
  $product = Try-Get { Get-CimInstance Win32_ComputerSystemProduct }
  $bios = Try-Get { Get-CimInstance Win32_BIOS }
  $enclosure = Try-Get { Get-CimInstance Win32_SystemEnclosure }
  # 2 = mobile; chassis types 8-14, 30-32 are portable, notebook, laptop, tablet, convertible.
  $laptopChassis = @(8, 9, 10, 11, 12, 14, 30, 31, 32)
  $isLaptop = ($cs.PCSystemType -eq 2) -or (@($enclosure.ChassisTypes | Where-Object { $laptopChassis -contains $_ }).Count -gt 0)
  $serial = Clean $bios.SerialNumber
  if (-not $serial) { $serial = Clean $product.IdentifyingNumber }
  [ordered]@{
    computerName = $env:COMPUTERNAME
    serialNumber = $serial
    manufacturer = Clean $cs.Manufacturer
    model        = Clean $cs.Model
    chassis      = $(if ($isLaptop) { 'laptop' } else { 'desktop' })
    hardwareUuid = Clean $product.UUID
    biosVersion  = Clean $bios.SMBIOSBIOSVersion
    biosDate     = Day $bios.ReleaseDate
  }
}

function Get-Hardware {
  $cpu = @(Get-CimInstance Win32_Processor)
  $cs = Get-CimInstance Win32_ComputerSystem
  $sticks = @(Try-Get { Get-CimInstance Win32_PhysicalMemory })
  $ramGb = [math]::Round(($sticks | Measure-Object Capacity -Sum).Sum / 1GB)
  if (-not $ramGb) { $ramGb = [math]::Round($cs.TotalPhysicalMemory / 1GB) }
  $ddr = @{ 20 = 'DDR'; 21 = 'DDR2'; 24 = 'DDR3'; 26 = 'DDR4'; 34 = 'DDR5'; 35 = 'LPDDR5' }
  $first = $sticks | Select-Object -First 1
  $ramType = if ($first) { $ddr[[int]$first.SMBIOSMemoryType] } else { $null }
  $speed = if ($first -and $first.Speed) { "$($first.Speed)" } else { '' }
  $ramText = (@("$ramGb GB", $ramType, $speed, $(if ($sticks.Count) { "($($sticks.Count) slots)" })) | Where-Object { $_ }) -join ' '

  # Physical disks with their type, and the space of the local drives.
  $media = @{ 3 = 'HDD'; 4 = 'SSD' }
  $disks = @(Try-Get {
      Get-CimInstance -Namespace root\Microsoft\Windows\Storage -ClassName MSFT_PhysicalDisk | ForEach-Object {
        $type = $media[[int]$_.MediaType]
        if ([int]$_.BusType -eq 17) { $type = 'NVMe' }
        [ordered]@{ model = Clean $_.FriendlyName; type = $(if ($type) { $type } else { '' }); sizeGb = Gb $_.Size 0 }
      }
    })
  $volumes = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')
  $system = $volumes | Where-Object { $_.DeviceID -eq $env:SystemDrive } | Select-Object -First 1
  $diskText = ($disks | ForEach-Object { "$($_.type) $($_.sizeGb) GB".Trim() }) -join ' + '

  # Video memory: the registry holds the full size (WMI stops at 4 GB).
  $gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic Display|Remote|Virtual|Mirror' })
  $vram = @(Try-Get {
      Get-ItemProperty 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' -ErrorAction SilentlyContinue |
        ForEach-Object { $_.'HardwareInformation.qwMemorySize' } | Where-Object { $_ }
    })
  $vramGb = if ($vram.Count) { Gb (($vram | Measure-Object -Maximum).Maximum) 0 } elseif ($gpus.Count) { Gb (($gpus | Measure-Object AdapterRAM -Maximum).Maximum) 0 } else { $null }

  $monitors = @(Try-Get {
      Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | ForEach-Object {
        [ordered]@{ name = Chars $_.UserFriendlyName; maker = Chars $_.ManufacturerName; serial = Chars $_.SerialNumberID }
      }
    })

  $battery = Try-Get {
    $full = (Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity | Select-Object -First 1).FullChargedCapacity
    $design = (Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData | Select-Object -First 1).DesignedCapacity
    if ($full -and $design) { [int][math]::Round(100 * $full / $design) } else { $null }
  }
  $board = Try-Get { Get-CimInstance Win32_BaseBoard }

  [ordered]@{
    cpu           = Clean $cpu[0].Name
    cpuCores      = [int](($cpu | Measure-Object NumberOfCores -Sum).Sum)
    ramGb         = $ramGb
    ramText       = $ramText
    disks         = $disks
    diskText      = $diskText
    diskTotalGb   = $(if ($system) { Gb $system.Size } else { $null })
    diskFreeGb    = $(if ($system) { Gb $system.FreeSpace } else { $null })
    gpu           = ($gpus | ForEach-Object { Clean $_.Name }) -join ' + '
    gpuMemoryGb   = $vramGb
    monitors      = $monitors
    batteryHealth = $battery
    mainboard     = $(if ($board) { Clean "$($board.Manufacturer) $($board.Product)" } else { '' })
  }
}

function Get-OsInfo {
  $os = Get-CimInstance Win32_OperatingSystem
  $nt = Try-Get { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' }
  $release = if ($nt.DisplayVersion) { $nt.DisplayVersion } else { $nt.ReleaseId }
  # Activated or not; the key is not read.
  $activated = Try-Get {
    $lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND LicenseStatus=1" -Property LicenseStatus
    @($lic).Count -gt 0
  }
  $lastUpdate = Try-Get { (Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn }
  [ordered]@{
    osName        = Clean $os.Caption
    osVersion     = Clean ("$release (build $($os.BuildNumber).$($nt.UBR))" -replace '^\s*\(', '(')
    osInstallDate = Day $os.InstallDate
    osActivated   = $activated
    lastUpdateAt  = Iso $lastUpdate
    lastBootAt    = Iso $os.LastBootUpTime
  }
}

function Get-Network {
  $adapters = @(Try-Get { Get-NetAdapter -Physical | Where-Object { $_.MacAddress } })
  $configs = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True')
  $route = Try-Get { Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1 }
  $list = @($adapters | ForEach-Object {
      $a = $_
      $conf = $configs | Where-Object { $_.InterfaceIndex -eq $a.ifIndex } | Select-Object -First 1
      $ip = @($conf.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' }) | Select-Object -First 1
      $kind = if ($a.PhysicalMediaType -match '802\.11|Wireless' -or $a.Name -match 'Wi-?Fi|Wireless') { 'wifi' } else { 'lan' }
      [ordered]@{ name = Clean $a.InterfaceDescription; mac = ($a.MacAddress -replace '-', ':'); ip = $(if ($ip) { $ip } else { '' }); type = $kind; up = ($a.Status -eq 'Up'); index = $a.ifIndex }
    })
  $main = $null
  if ($route) { $main = $list | Where-Object { $_.index -eq $route.ifIndex } | Select-Object -First 1 }
  if (-not $main) { $main = $list | Where-Object { $_.up -and $_.ip } | Select-Object -First 1 }
  foreach ($n in $list) { $n.Remove('index') }
  [ordered]@{
    ipAddress  = $(if ($main) { $main.ip } else { '' })
    macAddress = $(if ($main) { $main.mac } elseif ($list.Count) { $list[0].mac } else { '' })
    connection = $(if ($main) { $main.type } else { '' })
    network    = $list
  }
}

function Get-Users {
  $current = Try-Get { (Get-CimInstance Win32_ComputerSystem).UserName }
  $last = Try-Get { (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\LogonUI').LastLoggedOnSAMUser }
  [ordered]@{ loginUser = Clean $current; lastLoginUser = Clean $last }
}

function Get-Security {
  # Security Center: productState bits 12-15 = on/off, 4-7 = signatures out of date.
  $av = @(Try-Get { Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct })
  $active = $av | Where-Object { (($_.productState -shr 12) -band 0xF) -eq 1 } | Select-Object -First 1
  $shown = if ($active) { $active } else { $av | Select-Object -First 1 }
  # Signature date: only Defender tells it; other products' Security Center timestamp is not it.
  $avUpdated = $null
  if ($shown -and $shown.displayName -match 'Defender') {
    $avUpdated = Try-Get { (Get-MpComputerStatus).AntivirusSignatureLastUpdated }
  }
  $firewall = Try-Get { @(Get-NetFirewallProfile | Where-Object { $_.Enabled }).Count -gt 0 }
  # BitLocker on the system drive: 1 = protected. Absent on Home editions.
  $encrypted = Try-Get {
    $v = Get-CimInstance -Namespace root\cimv2\Security\MicrosoftVolumeEncryption -ClassName Win32_EncryptableVolume -Filter "DriveLetter='$env:SystemDrive'"
    if ($v) { $v.ProtectionStatus -eq 1 } else { $null }
  }
  [ordered]@{
    antivirus          = $(if ($shown) { Clean $shown.displayName } else { '' })
    antivirusEnabled   = $(if ($shown) { [bool]$active } else { $null })
    antivirusUpdatedAt = Iso $avUpdated
    firewallEnabled    = $firewall
    diskEncrypted      = $encrypted
  }
}

function Get-Software {
  $keys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'Registry::HKEY_USERS\*\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $seen = @{}
  $list = foreach ($key in $keys) {
    Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object {
      $_.DisplayName -and $_.SystemComponent -ne 1 -and -not $_.ParentKeyName -and $_.DisplayName -notmatch '^(Security Update|Update for|Hotfix)'
    } | ForEach-Object {
      $name = Clean $_.DisplayName
      $version = Clean $_.DisplayVersion
      $id = "$name|$version"
      if (-not $seen.ContainsKey($id)) {
        $seen[$id] = $true
        $installed = $null
        $raw = [string]$_.InstallDate
        if ($raw -match '^\d{8}$') {
          $installed = Try-Get { [datetime]::ParseExact($raw, 'yyyyMMdd', $null).ToString('yyyy-MM-dd') }
        }
        [ordered]@{ name = $name; version = $version; publisher = Clean $_.Publisher; installDate = $installed }
      }
    }
  }
  @($list | Sort-Object { $_.name })
}

# ---------------------------------------------------------------- sending

function Read-Json([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  try { return Get-Content $Path -Raw | ConvertFrom-Json } catch { return $null }
}

function Send([string]$Path, [hashtable]$Headers, $Body) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $json = $Body | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $uri = $Config.server.TrimEnd('/') + $Path
  return Invoke-RestMethod -Uri $uri -Method Post -Headers $Headers -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 60 -UseBasicParsing
}

function Status-Of($Err) {
  try { return [int]$Err.Exception.Response.StatusCode } catch { return 0 }
}

function Collect([bool]$Full, [bool]$WithSoftware) {
  $report = [ordered]@{ agentVersion = $AgentVersion; os = 'windows' }
  $parts = @((Get-Users), (Try-Get { Get-Network }))
  if ($Full) {
    $parts += @((Get-Identity), (Try-Get { Get-Hardware }), (Try-Get { Get-OsInfo }), (Try-Get { Get-Security }))
  } else {
    # Heartbeat: who is signed in, the address, free space, last start.
    $os = Try-Get { Get-CimInstance Win32_OperatingSystem }
    $sys = Try-Get { Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'" }
    $parts += [ordered]@{ lastBootAt = Iso $os.LastBootUpTime; diskFreeGb = $(if ($sys) { Gb $sys.FreeSpace } else { $null }) }
  }
  foreach ($part in $parts) { if ($part) { foreach ($k in $part.Keys) { $report[$k] = $part[$k] } } }
  if ($WithSoftware) { $report['software'] = Get-Software }
  return $report
}

# ---------------------------------------------------------------- main

if ($DryRun) {
  $report = Collect $true $true
  $count = @($report['software']).Count
  $report['software'] = "($count programs)"
  $report | ConvertTo-Json -Depth 6
  exit 0
}

$Config = Read-Json $ConfigFile
if (-not $Config -or -not $Config.server) { Write-Log 'No config.json: run install.cmd again.'; exit 1 }
$State = Read-Json $StateFile
$now = Get-Date
$lastInventory = if ($State -and $State.inventoryAt) { [datetime]$State.inventoryAt } else { [datetime]::MinValue }
$lastSoftware = if ($State -and $State.softwareAt) { [datetime]$State.softwareAt } else { [datetime]::MinValue }

try {
  $token = if (Test-Path $TokenFile) { (Get-Content $TokenFile -Raw).Trim() } else { '' }
  if (-not $token) {
    # First run: enrol with the full inventory; the computer waits for IT to approve it.
    $report = Collect $true $true
    $report['enrollKey'] = $Config.enrollKey
    $answer = Send '/api/agent/enroll' @{} $report
    Set-Content -Path $TokenFile -Value $answer.token -Encoding ASCII -NoNewline
    $State = @{ inventoryAt = $now.ToString('o'); softwareAt = $now.ToString('o') }
    Write-Log "Enrolled with the IT Assets register ($($answer.status))."
  } else {
    $full = ($now - $lastInventory) -ge $InventoryEvery
    $withSoftware = ($now - $lastSoftware) -ge $SoftwareEvery
    $report = Collect $full $withSoftware
    $answer = Send '/api/agent/report' @{ Authorization = "Bearer $token" } $report
    $State = @{
      inventoryAt = $(if ($full) { $now.ToString('o') } else { $lastInventory.ToString('o') })
      softwareAt  = $(if ($withSoftware) { $now.ToString('o') } else { $lastSoftware.ToString('o') })
    }
    Write-Log ("Reported ({0}{1}): {2}." -f $(if ($full) { 'full' } else { 'heartbeat' }), $(if ($withSoftware) { ' + programs' } else { '' }), $answer.status)
  }
  $State | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
} catch {
  $code = Status-Of $_
  if ($code -eq 401) {
    # The register no longer knows this token (the computer was removed): enrol again next time.
    Remove-Item $TokenFile -Force -ErrorAction SilentlyContinue
    Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
    Write-Log 'Token refused: will enrol again on the next run.'
  } elseif ($code -eq 403) {
    Write-Log 'This computer is blocked in the IT Assets register.'
  } else {
    Write-Log "Report failed ($code): $($_.Exception.Message)"
  }
  exit 1
}
