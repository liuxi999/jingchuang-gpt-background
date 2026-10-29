param([ValidateSet('Start','Probe','InstallShortcut','RemoveShortcut','Restore','Forget','InstallProfile')][string]$Action='Start')
$ErrorActionPreference='Stop'
$taskUtf8=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$taskUtf8
[Console]::OutputEncoding=$taskUtf8
$OutputEncoding=$taskUtf8
try {
    $taskNode=$env:JINGCHUANG_NODE
    if(-not $taskNode){
        $taskPackage=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
        if($taskPackage){$taskCandidate=Join-Path $taskPackage.InstallLocation 'app\resources\cua_node\bin\node.exe';if(Test-Path -LiteralPath $taskCandidate){$taskNode=$taskCandidate}}
    }
    if(-not $taskNode){$taskCandidate=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe';if(Test-Path -LiteralPath $taskCandidate){$taskNode=$taskCandidate}}
    if(-not $taskNode){$taskNode=Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1}
    if(-not $taskNode){throw 'Node.js 22.3+ required: https://nodejs.org/en/download'}
    $taskVersion=[version]((& $taskNode --version).Trim().TrimStart('v'))
    if($taskVersion -lt [version]'22.3.0'){throw 'Node.js 22.3+ required; set JINGCHUANG_NODE to a supported node.exe'}
    $env:JINGCHUANG_NODE=$taskNode
    $env:JINGCHUANG_POWERSHELL=(Get-Process -Id $PID).Path
    switch($Action){
        'Start' {& $taskNode (Join-Path $PSScriptRoot 'launcher.mjs') --interactive}
        'Probe' {Write-Host ('Node '+$taskVersion+' | PowerShell '+$PSVersionTable.PSVersion); & $taskNode (Join-Path $PSScriptRoot 'launcher.mjs') --probe}
        'InstallShortcut' {& $taskNode (Join-Path $PSScriptRoot 'shortcut.mjs') --install}
        'RemoveShortcut' {& $taskNode (Join-Path $PSScriptRoot 'shortcut.mjs') --remove}
        'Restore' {& $taskNode (Join-Path $PSScriptRoot 'launcher.mjs') --restore}
        'Forget' {& $taskNode (Join-Path $PSScriptRoot 'launcher.mjs') --forget-risk}
        'InstallProfile' {& $taskNode (Join-Path $PSScriptRoot '..\scripts\install.mjs')}
    }
    exit $LASTEXITCODE
}catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
