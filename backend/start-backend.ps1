$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot
if (-not (Test-Path ".env")) { throw "Create .env from .env.example and set BOT_TOKEN and JWT_SECRET." }
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
Write-Host "CloudeGift API — Telegram authentication required" -ForegroundColor Cyan
& $PythonExe -m uvicorn main:app --reload --reload-dir backend --host 0.0.0.0 --port 8000 --app-dir backend
