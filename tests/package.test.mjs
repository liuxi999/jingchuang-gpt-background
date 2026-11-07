import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {packageRelease} from '../scripts/package.mjs';

const exec=promisify(execFile);

test('release packaging produces one clean Windows archive and one checksum', {skip:process.platform!=='win32'}, async()=>{
  const temp=await mkdtemp(join(tmpdir(),'jingchuang-package-'));
  try{
    const result=await packageRelease({output:temp});
    const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
    const archiveName=`jingchuang-${version}-win-x64.zip`;
    assert.equal(result.version,version);
    assert.equal(result.archives.length,1);
    assert.equal(basename(result.archives[0]),archiveName);
    const files=await readdir(temp);
    assert.deepEqual(files.sort(),['SHA256SUMS.txt',archiveName]);
    const sum=await readFile(result.checksums,'utf8');
    const archiveHash=createHash('sha256').update(await readFile(result.archives[0])).digest('hex');
    assert.equal(sum,`${archiveHash}  ${archiveName}\n`);
    const {stdout}=await exec('tar.exe',['-tf',result.archives[0]],{encoding:'utf8'});
    assert.match(stdout,/Install\.cmd/);assert.match(stdout,/runtime\/manifest\.mjs/);assert.match(stdout,/scripts\/install\.mjs/);
    assert.doesNotMatch(stdout,/(local-consent|session\.json|launcher\.log|\.(?:png|jpe?g|webp|mp4|webm)$)/i);
  }finally{
    assert.equal(dirname(resolve(temp)).toLowerCase(),resolve(tmpdir()).toLowerCase());
    assert.match(basename(temp),/^jingchuang-package-/);
    await rm(temp,{recursive:true,force:true});
  }
});
