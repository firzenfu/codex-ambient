param([string]$CodexPath, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'
# This launcher never kills or restarts an existing conversation.
if (-not $CodexPath) {
    $package = Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1
    if ($package) {
        foreach ($name in @('ChatGPT.exe', 'Codex.exe')) {
            $candidate = Join-Path $package.InstallLocation "app/$name"
            if (Test-Path -LiteralPath $candidate) { $CodexPath = $candidate; break }
        }
    }
}
if (-not $CodexPath -or -not (Test-Path -LiteralPath $CodexPath -PathType Leaf)) {
    throw 'Codex was not found. Run this script with -CodexPath followed by the full app executable path.'
}
$resolvedApp = (Resolve-Path -LiteralPath $CodexPath).Path
$runningApp = Get-Process -Name 'ChatGPT','Codex' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $resolvedApp }
if ($runningApp) {
    Write-Host 'Codex is already running. Finish your work and completely quit Codex (including its tray icon), then run this launcher again.' -ForegroundColor Yellow
    if (-not $NonInteractive) { Read-Host 'Press Enter to close' }
    exit 1
}
$existingListener = Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue
if ($existingListener) { throw 'Port 9223 is already in use. Close the other debugging session first.' }
Write-Host 'Starting Codex with a local debugging connection on 127.0.0.1:9223.'
Write-Host 'To disable debugging, fully quit Codex and reopen it from its normal shortcut.'
Start-Process -FilePath $resolvedApp -ArgumentList '--remote-debugging-address=127.0.0.1','--remote-debugging-port=9223'
