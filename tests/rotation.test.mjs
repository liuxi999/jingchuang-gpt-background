import test from 'node:test';
import assert from 'node:assert/strict';
import {createRotationClock} from '../runtime/rotation.mjs';
function time(){let now=0,id=0;const jobs=new Map();return {win:{Date:{now:()=>now},setTimeout(fn,delay){jobs.set(++id,{at:now+delay,fn});return id;},clearTimeout(id){jobs.delete(id);}},async advance(ms){const end=now+ms;for(;;){const entry=[...jobs.entries()].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;jobs.delete(entry[0]);await entry[1].fn();}now=end;},count:()=>jobs.size};}
test('rotation is off by default, pauses with remainder and resumes without catchup',async()=>{
  const t=time();let count=0;const clock=createRotationClock(t.win,()=>count++);clock.hold(false);await t.advance(600000);assert.equal(count,0);clock.configure(1);await t.advance(20000);clock.hold(true);await t.advance(300000);assert.equal(count,0);clock.hold(false);await t.advance(39999);assert.equal(count,0);await t.advance(1);assert.equal(count,1);await t.advance(60000);assert.equal(count,2);clock.dispose();assert.equal(t.count(),0);
});
test('changing interval and reset replace pending timers, disposal never rotates',async()=>{
  const t=time();let count=0;const clock=createRotationClock(t.win,()=>count++);clock.configure(1);clock.hold(false);await t.advance(30000);clock.configure(5);await t.advance(299999);assert.equal(count,0);clock.reset();await t.advance(300000);assert.equal(count,1);clock.dispose();await t.advance(1000000);assert.equal(count,1);
});
