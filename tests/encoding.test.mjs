import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,dirname,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('Windows desktop launcher decodes actual Chinese Node stdout and stderr as UTF-8', {skip:process.platform!=='win32'},async()=>{
  const source=await readFile('runtime/Desktop-Launch.ps1','utf8');
  const output=source.match(/\$taskInfo\.StandardOutputEncoding=\$taskUtf8/),error=source.match(/\$taskInfo\.StandardErrorEncoding=\$taskUtf8/);
  assert.ok(output&&error,'Both redirected streams require explicit UTF-8');
  const temp=await mkdtemp(join(tmpdir(),'jingchuang-encoding-'));
  try{
    // Exercise the same ProcessStartInfo stream configuration, without starting GPT or showing a dialog.
    const script=join(temp,'roundtrip.ps1');
    const emitter=join(temp,'emit.mjs');
    await writeFile(emitter,'process.stdout.write("景窗 · GPT背景：请保存工作并完全退出");process.stderr.write("启动提示：中文、标点与 Mini/后台");','utf8');
    await writeFile(script,`param([string]$Node,[string]$Emitter)\n$ErrorActionPreference='Stop'\n$taskUtf8=[Text.UTF8Encoding]::new($false)\n[Console]::OutputEncoding=$taskUtf8\n$taskInfo=[Diagnostics.ProcessStartInfo]::new($Node)\n$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true\n${output[0]};${error[0]}\n$taskInfo.Arguments='"'+$Emitter+'"'\n$taskProcess=[Diagnostics.Process]::new();$taskProcess.StartInfo=$taskInfo\n[void]$taskProcess.Start()\n$a=$taskProcess.StandardOutput.ReadToEndAsync();$b=$taskProcess.StandardError.ReadToEndAsync();$taskProcess.WaitForExit()\n@{stdout=$a.GetAwaiter().GetResult();stderr=$b.GetAwaiter().GetResult()}|ConvertTo-Json -Compress\n$taskProcess.Dispose()\n`,'utf8');
    const shell=process.env.SystemRoot+'\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const {stdout}=await exec(shell,['-NoProfile','-NonInteractive','-File',script,'-Node',process.execPath,'-Emitter',emitter],{encoding:'utf8',windowsHide:true});
    const result=JSON.parse(stdout.replace(/^\uFEFF/,''));
    assert.equal(result.stdout,'景窗 · GPT背景：请保存工作并完全退出');assert.equal(result.stderr,'启动提示：中文、标点与 Mini/后台');
    for(const file of ['runtime/Run.ps1','runtime/Bootstrap.ps1']){const text=await readFile(file,'utf8');assert.match(text,/\[Console\]::OutputEncoding=\$taskUtf8/);assert.match(text,/\[Console\]::InputEncoding=\$taskUtf8/);assert.doesNotMatch(text,/PowerShell 7 required/);}
  }finally{assert.equal(dirname(resolve(temp)).toLowerCase(),resolve(tmpdir()).toLowerCase());assert.match(basename(temp),/^jingchuang-encoding-/);await rm(temp,{recursive:true,force:true});}
});
