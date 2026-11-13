# One-time setup (and safe to re-run after an update) for the license reader on
# the AI laptop. Run from an administrator PowerShell in this folder:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# What it does:
#   1. Creates a Python virtual environment and installs the requirements.
#   2. Downloads the vision model into Ollama (one time, about 6 GB).
#   3. Registers the "LicenseReader" scheduled task so the service starts at boot.
#   4. Opens the port in Windows Firewall for the home network only.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.env')) { throw 'Create .env first (copy .env.example and set READER_TOKEN).' }
$cfg = @{}
Get-Content '.env' | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $cfg[$Matches[1]] = $Matches[2] } }
if (-not $cfg.READER_TOKEN) { throw 'READER_TOKEN is empty in .env.' }
$port = if ($cfg.PORT) { $cfg.PORT } else { '8090' }
$vision = if ($cfg.VISION_MODEL) { $cfg.VISION_MODEL } else { 'qwen2.5vl:7b' }

# 1. Python environment
if (-not (Test-Path '.venv')) { & py -3.12 -m venv .venv }
& '.venv\Scripts\python.exe' -m pip install --quiet --upgrade pip
& '.venv\Scripts\python.exe' -m pip install --quiet -r requirements.txt

# 2. Vision model (skipped if already downloaded)
$ollama = (Get-ScheduledTask -TaskName OllamaServe).Actions[0].Execute
if (-not ((& $ollama list) -match [regex]::Escape($vision))) { & $ollama pull $vision }

# 3. Start at boot, as SYSTEM, like OllamaServe. Restarts if it crashes.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\run.ps1`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'LicenseReader' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

# 4. Firewall: allow the port from the local network only.
if (-not (Get-NetFirewallRule -DisplayName 'HomeGuard License Reader' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'HomeGuard License Reader' -Direction Inbound -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Action Allow | Out-Null
}

# (Re)start the service now.
Stop-ScheduledTask -TaskName 'LicenseReader' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -match 'uvicorn main:app' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName 'LicenseReader'
Write-Output "License reader set up on port $port. Check: http://localhost:$port/health"
