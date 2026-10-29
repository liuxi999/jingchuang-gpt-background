import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runtimeFiles} from './manifest.mjs';
export async function binding(root,app){
  if(!app.userSid||!app.version||app.signature!=='Valid OpenAI')throw Error('不能为未验证的应用或账户授权');
  const hash=createHash('sha256');for(const name of runtimeFiles){hash.update(name);hash.update(await readFile(join(root,name)));}
  return {schema:1,product:'jingchuang',userSid:app.userSid,version:app.version,family:app.family,exe:app.exe,codeHash:hash.digest('hex'),scope:'127.0.0.1 debugger until app fully exits'};
}
export function sameBinding(a,b){return !!a&&a.accepted===true&&['schema','product','userSid','version','family','exe','codeHash','scope'].every(k=>a[k]===b[k]);}
export async function hasConsent(root,app){const expected=await binding(root,app);try{return sameBinding(JSON.parse(await readFile(join(root,'local-consent.json'),'utf8')),expected);}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return false;throw e;}}
export async function remember(root,app){await writeFile(join(root,'local-consent.json'),JSON.stringify({...await binding(root,app),accepted:true,acceptedAt:new Date().toISOString()},null,2));}
export async function forget(root){try{const data=JSON.parse(await readFile(join(root,'local-consent.json'),'utf8'));if(data.product!=='jingchuang'||data.schema!==1)throw Error('拒绝删除未知授权文件');await unlink(join(root,'local-consent.json'));}catch(e){if(e.code!=='ENOENT')throw e;}}
