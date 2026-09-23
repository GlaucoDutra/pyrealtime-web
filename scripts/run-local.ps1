[CmdletBinding()]
param(
    [string]$BackendPath = "",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"
$frontendPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BackendPath)) {
    $BackendPath = Join-Path $frontendPath "..\pyrealtime"
}
$resolvedBackendPath = (Resolve-Path $BackendPath).Path
$backendProject = Join-Path $resolvedBackendPath "pyproject.toml"
if (-not (Test-Path -LiteralPath $backendProject -PathType Leaf)) {
    throw "PyRealtime backend not found at $resolvedBackendPath"
}

function Test-PortAvailable([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        try { $listener.Stop() } catch { }
    }
}

function Wait-Http([string]$Url, [System.Diagnostics.Process]$Process, [string]$ErrorLog) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($Process.HasExited) {
            $details = if (Test-Path -LiteralPath $ErrorLog) { Get-Content -LiteralPath $ErrorLog -Raw } else { "No log output." }
            throw "A local service stopped during startup.`n$details"
        }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        }
        catch { }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for $Url"
}

function Stop-ProcessTree([System.Diagnostics.Process]$Process) {
    if ($null -eq $Process -or $Process.HasExited) { return }
    & taskkill.exe /PID $Process.Id /T /F *> $null
}

if (-not (Test-PortAvailable $BackendPort)) { throw "Port $BackendPort is already in use." }
if (-not (Test-PortAvailable $FrontendPort)) { throw "Port $FrontendPort is already in use." }

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
    Write-Host "Enter your OpenAI API key. It will remain only in these local process environments." -ForegroundColor Cyan
    $secureKey = Read-Host "OPENAI_API_KEY" -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
        $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
}
if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) { throw "OPENAI_API_KEY is required." }

$venvPath = Join-Path $frontendPath ".venv-prototype"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    Write-Host "Creating the local Python environment..." -ForegroundColor Cyan
    & python -m venv $venvPath
}

Write-Host "Installing the local backend..." -ForegroundColor Cyan
& $venvPython -m pip install --disable-pip-version-check --quiet -e "$resolvedBackendPath[api]"
if ($LASTEXITCODE -ne 0) { throw "Backend installation failed." }

if (-not (Test-Path -LiteralPath (Join-Path $frontendPath "node_modules") -PathType Container)) {
    Write-Host "Installing frontend packages..." -ForegroundColor Cyan
    Push-Location $frontendPath
    try { & npm.cmd ci }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Frontend installation failed." }
}

$logPath = Join-Path $frontendPath ".local"
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$backendOut = Join-Path $logPath "backend.out.log"
$backendErr = Join-Path $logPath "backend.err.log"
$frontendOut = Join-Path $logPath "frontend.out.log"
$frontendErr = Join-Path $logPath "frontend.err.log"

$env:PYREALTIME_ALLOW_ANONYMOUS = "true"
$env:APP_CORS_ORIGINS = "http://127.0.0.1:$FrontendPort"
$env:PYREALTIME_INSTRUCTIONS = @"
You are a concise, friendly realtime assistant running in the PyRealtime local prototype.
Use application tools when they are relevant. Avatar animations are nonverbal behavior:
invoke them only as structured function calls and never announce, describe, or confirm them.
"@

$backendProcess = $null
$frontendProcess = $null
try {
    Write-Host "Starting PyRealtime on http://127.0.0.1:$BackendPort ..." -ForegroundColor Cyan
    $backendProcess = Start-Process -FilePath $venvPython `
        -ArgumentList @("-m", "uvicorn", "examples.prototype_server:app", "--host", "127.0.0.1", "--port", "$BackendPort") `
        -WorkingDirectory $resolvedBackendPath -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr
    Wait-Http "http://127.0.0.1:$BackendPort/v1/health" $backendProcess $backendErr

    Write-Host "Starting the frontend on http://127.0.0.1:$FrontendPort ..." -ForegroundColor Cyan
    $frontendProcess = Start-Process -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$FrontendPort") `
        -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr
    Wait-Http "http://127.0.0.1:$FrontendPort" $frontendProcess $frontendErr

    Start-Process "http://127.0.0.1:$FrontendPort"
    Write-Host ""
    Write-Host "PyRealtime prototype is running." -ForegroundColor Green
    Write-Host "Try: 'What time is it?', 'Calculate 37 times 19', or 'Remember that my test worked.'"
    Write-Host "The API key stays on the Python backend. The local browser connects anonymously only on 127.0.0.1."
    Read-Host "Press Enter to stop both services"
}
finally {
    Stop-ProcessTree $frontendProcess
    Stop-ProcessTree $backendProcess
    $env:OPENAI_API_KEY = $null
    Write-Host "Local prototype stopped." -ForegroundColor Yellow
}
