$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  throw "Заполните .env: BOT_TOKEN, WEBAPP_URL и JWT_SECRET. Для Telegram Mini App нужен публичный HTTPS URL."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20+ is required." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm is unavailable." }
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) { py -3.12 -m venv (Join-Path $ProjectRoot ".venv") }
& $PythonExe -m pip install -r (Join-Path $ProjectRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
Push-Location (Join-Path $ProjectRoot "frontend")
try { npm ci; if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }; npm run build; if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." } } finally { Pop-Location }
Write-Host "CloudeGift API + Telegram bot; Mini App served from webapp" -ForegroundColor Green
Write-Host "WEBAPP_URL must point to a public HTTPS tunnel/domain configured in BotFather." -ForegroundColor Yellow
& $PythonExe (Join-Path $ProjectRoot "bot_host.py")
