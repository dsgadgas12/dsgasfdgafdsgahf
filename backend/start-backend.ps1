$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

$env:DEV_MODE = "true"
$env:DATABASE_PATH = "backend/data/cloudegift.sqlite3"
$env:JWT_SECRET = "local-development-only-change-before-deploy"
$env:ADMIN_TG_IDS = "100000001"
$env:CORS_ORIGINS = "http://localhost:5173"
if (-not $env:BOT_TOKEN) { $env:BOT_TOKEN = "" }

$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
Write-Host "CloudeGift API starting on http://127.0.0.1:8000" -ForegroundColor Cyan
& $PythonExe -m uvicorn main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000 --app-dir backend
