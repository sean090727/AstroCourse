$ErrorActionPreference = "Stop"

if (-not $env:VERCEL_TOKEN) {
  $env:VERCEL_TOKEN = Read-Host "Paste Vercel token"
}

if (-not $env:VERCEL_PROJECT_NAME) {
  $env:VERCEL_PROJECT_NAME = "astro-course"
}

$NodePath = "C:\Users\sihyu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path $NodePath)) {
  throw "Node runtime was not found at $NodePath"
}

& $NodePath "$PSScriptRoot\deploy-existing-project.js"
