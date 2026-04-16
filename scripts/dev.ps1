# Start Go API (:3000) first, then Next.js (:3001) in this window.
# Next rewrites /api -> http://127.0.0.1:3000; without Go you get ECONNREFUSED.
# Usage (repo root): .\scripts\dev.ps1
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

function Test-PortOpen([string]$HostName, [int]$Port, [int]$TimeoutSec = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $c = [System.Net.Sockets.TcpClient]::new()
            $iar = $c.BeginConnect($HostName, $Port, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(500, $false) -and $c.Connected) {
                $c.Close()
                return $true
            }
            $c.Close()
        } catch { }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

Write-Host "API:    http://127.0.0.1:3000  (Go)" -ForegroundColor Cyan
Write-Host "Web:    http://127.0.0.1:3001  (Next)" -ForegroundColor Cyan
Write-Host "Starting Go in a new window..." -ForegroundColor DarkGray

Start-Process powershell -WorkingDirectory $repoRoot -ArgumentList @(
    "-NoExit", "-Command", "Write-Host 'Go API on :3000' -ForegroundColor Green; go run main.go"
)

if (-not (Test-PortOpen "127.0.0.1" 3000 90)) {
    Write-Error "Timed out waiting for Go on 127.0.0.1:3000. Check the other window for errors."
    exit 1
}

Write-Host "Go is up. Starting Next (webpack dev)..." -ForegroundColor Green
Set-Location (Join-Path $repoRoot "web")
bun run dev
