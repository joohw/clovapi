param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [Parameter(Mandatory = $true)]
  [string]$Repo
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templateDir = Join-Path $scriptDir "templates"
$outDir = Join-Path $scriptDir "generated\clovapi.clovapi\$Version"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$tag = "v$Version"
$base = "https://github.com/$Repo/releases/download/$tag"

$values = @{
  "__VERSION__" = $Version
  "__URL_AMD64__" = "$base/clovapi_${tag}_windows_amd64.zip"
  "__URL_ARM64__" = "$base/clovapi_${tag}_windows_arm64.zip"
  "__SHA256_AMD64__" = "REPLACE_WITH_SHA256"
  "__SHA256_ARM64__" = "REPLACE_WITH_SHA256"
}

Get-ChildItem -Path $templateDir -File | ForEach-Object {
  $content = Get-Content -Path $_.FullName -Raw
  foreach ($k in $values.Keys) {
    $content = $content.Replace($k, $values[$k])
  }
  $outFile = Join-Path $outDir $_.Name
  Set-Content -Path $outFile -Value $content -NoNewline
}

Write-Host "Generated winget manifests in: $outDir"
