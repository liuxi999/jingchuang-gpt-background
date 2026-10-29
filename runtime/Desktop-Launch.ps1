param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$taskUtf8=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=$taskUtf8
$OutputEncoding=$taskUtf8
$taskRoot=$PSScriptRoot
try {
$env:JINGCHUANG_POWERSHELL=(Get-Process -Id $PID).Path
$taskNode=$env:JINGCHUANG_NODE
if(-not $taskNode){
    $taskPackage=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
    if($taskPackage){$taskNode=Join-Path $taskPackage.InstallLocation 'app\resources\cua_node\bin\node.exe'}
}
if(-not(Test-Path -LiteralPath $taskNode -PathType Leaf)){$taskNode=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'}
if(-not(Test-Path -LiteralPath $taskNode -PathType Leaf)){$taskNode=Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1}
if(-not(Test-Path -LiteralPath $taskNode -PathType Leaf)){throw 'Node.js 22+ required. Use Start-GPT.cmd for diagnostics.'}
if([version]((& $taskNode --version).Trim().TrimStart('v')) -lt [version]'22.3.0'){throw 'Node.js 22.3+ required'}
if($CheckOnly){& $taskNode (Join-Path $taskRoot 'launcher.mjs') --check-consent;exit $LASTEXITCODE}
$taskLog=Join-Path $taskRoot 'launcher.log'
$taskInfo=[Diagnostics.ProcessStartInfo]::new($taskNode)
$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true
$taskInfo.StandardOutputEncoding=$taskUtf8;$taskInfo.StandardErrorEncoding=$taskUtf8
$taskInfo.WorkingDirectory=$taskRoot;$taskInfo.Arguments='"'+(Join-Path $taskRoot 'launcher.mjs')+'" --desktop'
$taskProcess=[Diagnostics.Process]::new();$taskProcess.StartInfo=$taskInfo
[void]$taskProcess.Start()
$taskOut=$taskProcess.StandardOutput.ReadToEndAsync();$taskErr=$taskProcess.StandardError.ReadToEndAsync();$taskProcess.WaitForExit()
$taskOutput=@($taskOut.GetAwaiter().GetResult(),$taskErr.GetAwaiter().GetResult());$taskCode=$taskProcess.ExitCode;$taskProcess.Dispose()
$taskOutput | Out-File -LiteralPath $taskLog -Encoding utf8
if($taskCode -eq 2){
    # New account, app version, or code: interactive FIRST consent, never auto-YES.
    Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c',('""'+(Join-Path $taskRoot 'Start-GPT.cmd')+'""')) -WorkingDirectory $taskRoot -WindowStyle Normal
}elseif($taskCode -ne 0){
    Add-Type -AssemblyName PresentationFramework
    [void][Windows.MessageBox]::Show(($taskOutput -join [Environment]::NewLine),'景窗 · GPT背景启动提示')
}
}catch{
    Add-Type -AssemblyName PresentationFramework
    [void][Windows.MessageBox]::Show($_.Exception.Message,'景窗 · GPT背景启动提示')
    exit 1
}
