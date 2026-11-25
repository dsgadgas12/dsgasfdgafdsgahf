$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "CloudeGift Mini App frontend" -ForegroundColor Cyan
if (-not (Test-Path "package.json")) { throw "frontend/package.json not found. Extract the full project archive." }

Write-Host "Installing frontend packages in: $PSScriptRoot"
npm.cmd install
if ($LASTEXITCODE -ne 0) { throw "npm install failed in frontend folder." }

Write-Host "Vite starting on http://localhost:5173" -ForegroundColor Green
npm.cmd run dev -- --host 127.0.0.1
