# Empaqueta TP Companion en un ZIP listo para distribuir.
# Uso (desde PowerShell, en la raíz del proyecto):
#   .\tools\pack.ps1
# Genera: dist\tp-companion-<version>.zip  (versión leída del manifest)

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content "$root\manifest.json" -Encoding UTF8 -Raw | ConvertFrom-Json
$ver = $manifest.version
$outDir = Join-Path $root "dist"
$out = Join-Path $outDir ("tp-companion-" + $ver + ".zip")
$staging = Join-Path $outDir "staging"

# Solo se incluye lo necesario para correr la extension.
# Quedan fuera: tools/, reference/, docs/, .claude/, .git/, dist/.
$include = @(
  "manifest.json",
  "background.js",
  "content",
  "panel",
  "studio",
  "lib",
  "data",
  "logos",
  "icons",
  "INSTALL.md"
)

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $out) { Remove-Item $out -Force }
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

foreach ($item in $include) {
  $src = Join-Path $root $item
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination (Join-Path $staging $item) -Recurse -Force
  }
}

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $out -Force
Remove-Item $staging -Recurse -Force

$size = "{0:N1} MB" -f ((Get-Item $out).Length / 1MB)
Write-Host ("OK  -> " + $out + "  (" + $size + ")")
