$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

Write-Host "CloudeGift local launcher" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is missing. Install Node.js 20+." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm.cmd is missing. Repair the Node.js installation." }

$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Write-Host "Creating Python 3.11 virtual environment..."
    py -3.11 -m venv (Join-Path $ProjectRoot ".venv")
    if ($LASTEXITCODE -ne 0) { throw "Could not create Python 3.11 virtual environment." }
}

if (-not (Test-Path (Join-Path $ProjectRoot ".env"))) {
    @"
BOT_TOKEN=
WEBAPP_URL=http://localhost:5173
ADMIN_TG_IDS=100000001
VITE_ADMIN_IDS=100000001
JWT_SECRET=local-development-only-change-before-deploy
DEV_MODE=true
CORS_ORIGINS=http://localhost:5173
DATABASE_PATH=backend/data/cloudegift.sqlite3
DOMAIN=localhost
"@ | Set-Content -Encoding ASCII (Join-Path $ProjectRoot ".env")
}

$FrontendEnvPath = Join-Path $ProjectRoot "frontend/.env.local"
if (-not (Test-Path $FrontendEnvPath)) {
@"
VITE_API_URL=/api
VITE_DEMO_BALANCE=100000000000
VITE_ADMIN_IDS=100000001
VITE_DEMO_ADMIN=false
VITE_GRAM_WALLET_ADDRESS=PUT_PUBLIC_WALLET_ADDRESS_HERE
VITE_GRAM_JETTON_MASTER_ADDRESS=PUT_GRAM_JETTON_MASTER_ADDRESS_HERE
"@ | Set-Content -Encoding ASCII $FrontendEnvPath
} else {
    $FrontendEnv = Get-Content -Raw $FrontendEnvPath
    if ($FrontendEnv -notmatch '(?m)^VITE_API_URL=') { Add-Content -Encoding ASCII $FrontendEnvPath "`nVITE_API_URL=/api" }
    if ($FrontendEnv -notmatch '(?m)^VITE_DEMO_BALANCE=') {
        Add-Content -Encoding ASCII $FrontendEnvPath "`nVITE_DEMO_BALANCE=100000000000"
    } else {
        $FrontendEnv = [regex]::Replace($FrontendEnv, '(?m)^VITE_DEMO_BALANCE=.*$', 'VITE_DEMO_BALANCE=100000000000')
        Set-Content -Encoding ASCII $FrontendEnvPath $FrontendEnv
    }
    if ($FrontendEnv -notmatch '(?m)^VITE_GRAM_WALLET_ADDRESS=') { Add-Content -Encoding ASCII $FrontendEnvPath "`nVITE_GRAM_WALLET_ADDRESS=PUT_PUBLIC_WALLET_ADDRESS_HERE" }
    if ($FrontendEnv -notmatch '(?m)^VITE_GRAM_JETTON_MASTER_ADDRESS=') { Add-Content -Encoding ASCII $FrontendEnvPath "`nVITE_GRAM_JETTON_MASTER_ADDRESS=PUT_GRAM_JETTON_MASTER_ADDRESS_HERE" }
}

Write-Host "Installing backend requirements..."
& $PythonExe -m pip install -r (Join-Path $ProjectRoot "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }

$BackendScript = Join-Path $ProjectRoot "backend\start-backend.ps1"
$FrontendScript = Join-Path $ProjectRoot "frontend\start-frontend.ps1"

Write-Host "Starting API and Mini App in separate PowerShell windows..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit","-File","`"$BackendScript`"")
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit","-File","`"$FrontendScript`"")

Write-Host ""
Write-Host "Mini App: http://localhost:5173" -ForegroundColor Cyan
Write-Host "API:      http://127.0.0.1:8000/health" -ForegroundColor Cyan
Write-Host "Keep both server windows open. Local DEMO mode only."
Read-Host "Press Enter to close this launcher"
