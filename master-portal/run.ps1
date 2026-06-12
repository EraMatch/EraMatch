# EraMatch Master Portal — Windows startup script
# Usage: .\run.ps1
# Starts backend (port 8002) and frontend (port 5175) in separate windows

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting EraMatch Master Portal..." -ForegroundColor Cyan

# ── Backend ──────────────────────────────────────────────────────────────────
$backendPath = Join-Path $Root "backend"

if (-not (Test-Path (Join-Path $backendPath ".venv"))) {
    Write-Host "[Backend] Creating virtual environment..." -ForegroundColor Yellow
    Set-Location $backendPath
    python -m venv .venv
    & ".venv\Scripts\pip" install -r requirements.txt
}

Write-Host "[Backend] Starting FastAPI on http://localhost:8002 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$backendPath'; .\.venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8002 --reload"

# ── Frontend ──────────────────────────────────────────────────────────────────
$frontendPath = Join-Path $Root "frontend"

if (-not (Test-Path (Join-Path $frontendPath "node_modules"))) {
    Write-Host "[Frontend] Installing npm packages..." -ForegroundColor Yellow
    Set-Location $frontendPath
    npm install
}

Write-Host "[Frontend] Starting Vite on http://localhost:5175 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$frontendPath'; npm run dev"

Write-Host ""
Write-Host "Master Portal is starting up:" -ForegroundColor Cyan
Write-Host "  Frontend : http://localhost:5175" -ForegroundColor White
Write-Host "  Backend  : http://localhost:8002" -ForegroundColor White
Write-Host "  API Docs : http://localhost:8002/docs" -ForegroundColor White
Write-Host ""
Write-Host "Default credentials: admin / 1234" -ForegroundColor Yellow
