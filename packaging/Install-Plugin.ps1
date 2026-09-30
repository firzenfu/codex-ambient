param([string]$CodexCli)
$ErrorActionPreference = 'Stop'
if (-not $CodexCli) {
    $installedCommand = Get-Command codex -ErrorAction SilentlyContinue
    if ($installedCommand) { $CodexCli = $installedCommand.Source }
}
if (-not $CodexCli) {
    $candidates = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin') -Filter codex.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    if ($candidates) { $CodexCli = $candidates[0].FullName }
}
if (-not $CodexCli -or -not (Test-Path -LiteralPath $CodexCli -PathType Leaf)) { throw 'Codex CLI not found. Supply -CodexCli with the full path to codex.exe.' }
$pluginManifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'plugins\codex-ambient\.codex-plugin\plugin.json') | ConvertFrom-Json
if ($pluginManifest.name -ne 'codex-ambient' -or $pluginManifest.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid Ambient plugin package.' }
$destination = Join-Path $env:LOCALAPPDATA ('CodexAmbient\plugins\' + $pluginManifest.version)
if ([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -ne [IO.Path]::GetFullPath($destination).TrimEnd('\')) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Get-ChildItem -LiteralPath $PSScriptRoot -Force | Copy-Item -Destination $destination -Recurse -Force
}
& $CodexCli plugin marketplace add $destination --json
if ($LASTEXITCODE -ne 0) { throw 'Could not register the Ambient marketplace.' }
& $CodexCli plugin add 'codex-ambient@codex-ambient-local' --json
if ($LASTEXITCODE -ne 0) { throw 'Could not install Ambient. The local marketplace is available for troubleshooting.' }
Write-Host 'Codex Ambient plugin installed. Restart Codex when your work is saved, then find Codex Ambient in Plugins.'
Write-Host 'Background mode is still required to change the main window. Installing this plugin does not restart Codex or enable debugging.'
