$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$Frontend = Join-Path $ProjectRoot "frontend"
Set-Location -LiteralPath $Frontend
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js 20+ first." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm is unavailable." }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
Set-Location -LiteralPath $ProjectRoot
py -3 package_for_bothost.py
if ($LASTEXITCODE -ne 0) { throw "Bot-Hosting archive packaging failed." }
