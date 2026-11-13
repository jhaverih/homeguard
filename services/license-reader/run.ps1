# Starts the license reader. The LicenseReader scheduled task runs this at boot.
# It loads the settings from .env in this folder, then starts the web service.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Load KEY=value lines from .env into this process's environment.
Get-Content (Join-Path $PSScriptRoot '.env') | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$port = if ($env:PORT) { $env:PORT } else { '8090' }

# Output goes to reader.log so problems can be checked later. uvicorn writes
# its normal log lines to stderr, which Windows PowerShell would treat as a
# fatal error under 'Stop', so relax that for the server itself.
$ErrorActionPreference = 'Continue'
& (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') -m uvicorn main:app --host 0.0.0.0 --port $port *>> (Join-Path $PSScriptRoot 'reader.log')
exit $LASTEXITCODE
