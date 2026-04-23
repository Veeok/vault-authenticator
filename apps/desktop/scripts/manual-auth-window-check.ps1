param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,
  [Parameter(Mandatory = $true)]
  [string]$AppDataRoot,
  [Parameter(Mandatory = $true)]
  [ValidateSet("pin", "password")]
  [string]$Mode,
  [Parameter(Mandatory = $true)]
  [string]$Secret,
  [string]$MasterPassword,
  [string]$RecoveryCode
)

$ErrorActionPreference = "Stop"

function Wait-ActivateWindow {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,
    [int]$TimeoutSeconds = 30
  )

  $shell = New-Object -ComObject WScript.Shell
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($shell.AppActivate($Title)) {
      Start-Sleep -Milliseconds 500
      return $true
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Send-KeysRepeated {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Keys,
    [int]$Count = 1,
    [int]$DelayMs = 150
  )

  $shell = New-Object -ComObject WScript.Shell
  for ($i = 0; $i -lt $Count; $i += 1) {
    $shell.SendKeys($Keys)
    Start-Sleep -Milliseconds $DelayMs
  }
}

function Get-AppWindowSnapshot {
  Get-Process | Where-Object {
    $_.ProcessName -like "Vault Authenticator*" -or $_.ProcessName -like "electron*"
  } | Select-Object ProcessName, Id, MainWindowTitle
}

function Start-AppInstance {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,
    [Parameter(Mandatory = $true)]
    [string]$ProfileRoot
  )

  $escapedExe = $Executable.Replace('"', '""')
  $command = 'set APPDATA=' + $ProfileRoot + ' && start "" "' + $escapedExe + '"'
  return Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
}

$results = [ordered]@{}

try {
  Stop-Process -Name "Vault Authenticator" -ErrorAction SilentlyContinue
  Stop-Process -Name electron -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  $null = Start-AppInstance -Executable $ExePath -ProfileRoot $AppDataRoot
  $startupOnAuthWindow = $false
  if ($MasterPassword) {
    if (-not (Wait-ActivateWindow -Title "Vault Authenticator Unlock" -TimeoutSeconds 30)) {
      $results.detectedWindows = Get-AppWindowSnapshot
      throw "Auth window did not appear on startup."
    }
    $startupOnAuthWindow = $true
  }
  else {
    if (Wait-ActivateWindow -Title "Vault Authenticator Unlock" -TimeoutSeconds 8) {
      $startupOnAuthWindow = $true
    }
    elseif (-not (Wait-ActivateWindow -Title "Vault Authenticator" -TimeoutSeconds 30)) {
      $results.detectedWindows = Get-AppWindowSnapshot
      throw "No app window appeared on startup."
    }
  }
  $results.startupAuthWindow = $startupOnAuthWindow

  $needsPrimaryUnlock = $true

  if ($MasterPassword) {
    Send-KeysRepeated -Keys $MasterPassword -Count 1 -DelayMs 60
    Send-KeysRepeated -Keys "{ENTER}"

    if (Wait-ActivateWindow -Title "Vault Authenticator" -TimeoutSeconds 20) {
      $results.secondStartupLock = $false
      $results.masterPasswordUnlock = $true
      $results.primaryUnlock = $true
      $needsPrimaryUnlock = $false
    }
    else {
      if (-not (Wait-ActivateWindow -Title "Vault Authenticator Unlock" -TimeoutSeconds 20)) {
        throw "App lock stage did not appear after master password unlock."
      }
      $results.secondStartupLock = $true
      $results.masterPasswordUnlock = $true
    }
  }

  if ($needsPrimaryUnlock) {
    if ($Mode -eq "pin") {
      Send-KeysRepeated -Keys $Secret -Count 1 -DelayMs 60
    }
    else {
      Send-KeysRepeated -Keys $Secret -Count 1 -DelayMs 60
      Send-KeysRepeated -Keys "{ENTER}"
    }

    if (-not (Wait-ActivateWindow -Title "Vault Authenticator" -TimeoutSeconds 20)) {
      throw "Main window did not appear after primary unlock."
    }
    $results.primaryUnlock = $true
  }

  $notepad = Start-Process -FilePath notepad.exe -PassThru
  if (-not (Wait-ActivateWindow -Title "Untitled - Notepad" -TimeoutSeconds 10)) {
    throw "Could not focus Notepad for focus-loss lock test."
  }

  $null = Start-AppInstance -Executable $ExePath -ProfileRoot $AppDataRoot
  if (Wait-ActivateWindow -Title "Vault Authenticator Unlock" -TimeoutSeconds 10) {
    $results.focusLossRelock = "auth-window"
  }
  elseif (Wait-ActivateWindow -Title "Vault Authenticator" -TimeoutSeconds 10) {
    $results.focusLossRelock = "main-window"
  }
  else {
    throw "No locked app window was focused after relock/open." 
  }
  $results.lockedOpenFocus = $true

  if ($RecoveryCode) {
    Send-KeysRepeated -Keys "{TAB}" -Count 3
    Send-KeysRepeated -Keys "{ENTER}"
    Send-KeysRepeated -Keys "{TAB}" -Count 1
    Send-KeysRepeated -Keys "{ENTER}"
    Start-Sleep -Milliseconds 300
    Send-KeysRepeated -Keys $RecoveryCode -Count 1 -DelayMs 60
    Send-KeysRepeated -Keys "{TAB}" -Count 1
    Send-KeysRepeated -Keys "{ENTER}"

    if (-not (Wait-ActivateWindow -Title "Vault Authenticator" -TimeoutSeconds 20)) {
      throw "Main window did not appear after recovery-code unlock."
    }
    $results.recoveryUnlock = $true
  } else {
    if ($Mode -eq "pin") {
      Send-KeysRepeated -Keys $Secret -Count 1 -DelayMs 60
    } else {
      Send-KeysRepeated -Keys $Secret -Count 1 -DelayMs 60
      Send-KeysRepeated -Keys "{ENTER}"
    }

    if (-not (Wait-ActivateWindow -Title "Vault Authenticator" -TimeoutSeconds 20)) {
      throw "Main window did not appear after second primary unlock."
    }
  }

  if (-not (Wait-ActivateWindow -Title "Untitled - Notepad" -TimeoutSeconds 5)) {
    throw "Could not refocus Notepad before unlocked second-instance test."
  }
  $null = Start-AppInstance -Executable $ExePath -ProfileRoot $AppDataRoot
  if (-not (Wait-ActivateWindow -Title "Vault Authenticator" -TimeoutSeconds 10)) {
    throw "Appropriate window was not focused while unlocked."
  }
  $results.unlockedOpenFocus = $true

  $results.status = "passed"
  [pscustomobject]$results | ConvertTo-Json -Compress
}
catch {
  $results.status = "failed"
  $results.error = $_.Exception.Message
  [pscustomobject]$results | ConvertTo-Json -Compress
  exit 1
}
finally {
  Stop-Process -Name "Vault Authenticator" -ErrorAction SilentlyContinue
  Stop-Process -Name "notepad" -ErrorAction SilentlyContinue
}
