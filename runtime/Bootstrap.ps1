param([ValidateSet('Start','Probe','InstallShortcut','RemoveShortcut','Restore','Forget','InstallProfile')][string]$Action='Start')
$ErrorActionPreference='Stop'
$taskUtf8=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$taskUtf8
[Console]::OutputEncoding=$taskUtf8
$OutputEncoding=$taskUtf8
try {
    $taskBundled=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
    $taskShell=$env:JINGCHUANG_POWERSHELL
    if(-not $taskShell -and (Test-Path -LiteralPath $taskBundled)){$taskShell=$taskBundled}
    if(-not $taskShell){$taskShell=Get-Command pwsh.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1}
    if(-not $taskShell){$taskShell=(Get-Process -Id $PID).Path}
    & $taskShell -NoProfile -File (Join-Path $PSScriptRoot 'Run.ps1') -Action $Action
    exit $LASTEXITCODE
}catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
