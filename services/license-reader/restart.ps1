# Restarts the license reader after its files are updated (no reinstall needed).
#   powershell -ExecutionPolicy Bypass -File restart.ps1
Stop-ScheduledTask -TaskName 'LicenseReader' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
  Where-Object { $_.CommandLine -match 'uvicorn main:app' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName 'LicenseReader'
Start-Sleep -Seconds 8
"LicenseReader: " + (Get-ScheduledTask -TaskName 'LicenseReader').State
