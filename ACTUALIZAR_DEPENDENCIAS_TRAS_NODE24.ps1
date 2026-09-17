$ErrorActionPreference = 'Stop'

Write-Host '=== ProyectoStock · comprobacion Node 24 ===' -ForegroundColor Cyan

$nodeVersion = (& node -v).Trim()
$npmVersion = (& npm -v).Trim()
Write-Host "Node: $nodeVersion"
Write-Host "npm : $npmVersion"

if ($nodeVersion -ne 'v24.21.0') {
    throw "Se esperaba Node v24.21.0 y se ha encontrado $nodeVersion. Instala/activa Node 24.21.0 antes de continuar."
}

if (-not $npmVersion.StartsWith('11.')) {
    throw "Se esperaba npm 11.x y se ha encontrado $npmVersion."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host '\n=== Frontend ===' -ForegroundColor Cyan
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm ci
npm run runtime:check
npm run build

Write-Host '\n=== Backend ===' -ForegroundColor Cyan
Set-Location (Join-Path $root 'server')
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm ci
npm run runtime:check
npm run test:jornada
npm run db:jornada:check

Write-Host '\n✅ Reinstalacion y comprobaciones completadas.' -ForegroundColor Green
Write-Host 'Arranca ahora el backend con: cd server; npm start'
Write-Host 'Y el frontend desde la raiz con: npm run dev'
