param([ValidateSet('Inspect','Listener','Port')][string]$Action='Inspect',[int]$Port=0,[string]$Executable='',[int]$ExpectedPid=0,[int]$WaitMilliseconds=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if($Action -eq 'Port') {
    $taskListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
    try {$taskListener.Start(); Write-Output $taskListener.LocalEndpoint.Port} finally {$taskListener.Stop()}
    exit
}
if($Action -eq 'Listener') {
    if($Port -lt 1024 -or $Port -gt 65535 -or -not [IO.Path]::IsPathRooted($Executable) -or $ExpectedPid -lt 0 -or $WaitMilliseconds -lt 0 -or $WaitMilliseconds -gt 30000){throw 'Invalid expected listener identity'}
    $taskDeadline=[DateTime]::UtcNow.AddMilliseconds($WaitMilliseconds)
    do {
        $taskRows=@()
        foreach($taskLine in (& "$env:SystemRoot\System32\netstat.exe" -ano -p tcp)) {
            $taskMatch=[regex]::Match($taskLine,'^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if($taskMatch.Success -and $taskMatch.Groups[1].Value.EndsWith((':'+$Port),[StringComparison]::Ordinal)) {
                $taskRows+=@{LocalAddress=$taskMatch.Groups[1].Value;OwningProcess=[int]$taskMatch.Groups[2].Value}
            }
        }
        if($taskRows.Count -gt 0){break}
        if([DateTime]::UtcNow -ge $taskDeadline){throw 'Listener not ready'}
        Start-Sleep -Milliseconds 50
    } while($true)
    foreach($taskRow in $taskRows) {
        if($taskRow.LocalAddress -ne ('127.0.0.1:'+$Port)){throw 'Listener is not loopback-only; refusing connection'}
        if($ExpectedPid -gt 0 -and $taskRow.OwningProcess -ne $ExpectedPid){throw 'Listener process does not match the process started by this launcher'}
        $taskProcess=Get-Process -Id $taskRow.OwningProcess -ErrorAction Stop
        if(-not [string]::Equals($taskProcess.Path,$Executable,[StringComparison]::OrdinalIgnoreCase)){throw 'Listener process does not match the validated Codex executable'}
        if($ExpectedPid -eq 0) {
            $taskProcessInfo=Get-CimInstance Win32_Process -Filter "ProcessId = $($taskRow.OwningProcess)"
            $taskOwner=Invoke-CimMethod -InputObject $taskProcessInfo -MethodName GetOwnerSid
            $taskCurrentSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
            if($taskOwner.ReturnValue -ne 0 -or $taskOwner.Sid -ne $taskCurrentSid){throw 'Listener owner does not match the current user'}
        }
    }
    @{verified=$true;port=$Port;pid=[int]$taskRows[0].OwningProcess} | ConvertTo-Json -Compress
    exit
}
$taskPackage=Get-AppxPackage -Name OpenAI.Codex | Where-Object {$_.PackageFamilyName -eq 'OpenAI.Codex_2p2nqsd0c76g0'} | Select-Object -First 1
if(-not $taskPackage){throw 'Official OpenAI.Codex Windows package was not found'}
if([string]$taskPackage.Status -ne 'Ok' -and [int]$taskPackage.Status -ne 0){throw 'Official package status is not healthy'}
$taskExe=Join-Path $taskPackage.InstallLocation 'app\ChatGPT.exe'
if(-not (Test-Path -LiteralPath $taskExe -PathType Leaf)){throw 'Official GUI executable was not found'}
$taskSignature=Get-AuthenticodeSignature -LiteralPath $taskExe
if($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'OpenAI OpCo, LLC'){throw 'Official OpenAI executable signature verification failed'}
$taskProcesses=@(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" | Where-Object {[string]::Equals($_.ExecutablePath,$taskExe,[StringComparison]::OrdinalIgnoreCase)} | Select-Object -ExpandProperty ProcessId)
$taskBundledNode=Join-Path $taskPackage.InstallLocation 'app\resources\cua_node\bin\node.exe'
@{version=[string]$taskPackage.Version;exe=$taskExe;family=$taskPackage.PackageFamilyName;signature='Valid OpenAI';running=@($taskProcesses);bundledNode=$taskBundledNode;userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value} | ConvertTo-Json -Compress
