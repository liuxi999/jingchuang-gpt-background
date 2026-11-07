import test from 'node:test';
import assert from 'node:assert/strict';
import {disposeAppearance,monitorAppearance} from '../runtime/monitor.mjs';

const port=13579,stopToken='current-session';
const target=(id,route='/')=>({id,type:'page',url:'app://-/index.html?initialRoute='+route,webSocketDebuggerUrl:`ws://127.0.0.1:${port}/devtools/page/${id}`});
const first=target('first'),second=target('second'),mini=target('mini','/mini');

function mockMonitor(){
  const scenario={targets:[first,mini],hidden:new Set(),alive:true,enabled:true};
  const installed=new Set(),calls=[],events=new Map();
  let tick=0;
  return {
    scenario,calls,installed,
    restore(id,payload){events.get(id)({method:'Runtime.bindingCalled',params:{name:'__jingchuangStopWatcher',payload}});},
    run(advance){
      return monitorAppearance({
        port,stopToken,source:startup=>startup?'installStartup()':'installBackground()',
        async verify(){calls.push('verify');},
        isAlive:()=>scenario.alive,isEnabled:async()=>scenario.enabled,onReady:()=>calls.push('ready')
      },{
        targets:async()=>scenario.targets,
        now:()=>tick*1000,
        async sleep(){advance(++tick);assert.ok(tick<12,'monitor should have stopped');},
        async connect(url,event){
          const id=url.split('/').pop();events.set(id,event);calls.push('connect:'+id);
          return {
            async call(method,{expression}){
              if(method==='Runtime.addBinding')return {};
              if(expression===disposeAppearance){installed.delete(id);calls.push('dispose:'+id);return {};}
              if(expression.includes('installStartup()')||expression.includes('installBackground()')){
                installed.add(id);calls.push((expression.includes('installStartup()')?'intro:':'background:')+id);
                return {result:{value:{installed:true}}};
              }
              const mounted=installed.has(id);
              return {result:{value:{visible:!scenario.hidden.has(id),body:true,root:true,width:800,height:600,active:mounted,mounted,presented:mounted}}};
            },
            close(){calls.push('close:'+id);events.delete(id);}
          };
        }
      });
    }
  };
}

test('monitor reinstalls after same-target reload and target replacement without replaying the intro',async()=>{
  const app=mockMonitor();
  await app.run(tick=>{
    if(tick===2)app.installed.delete('first');
    if(tick===3){app.scenario.targets=[second,mini];app.scenario.hidden.add('second');}
    if(tick===4)app.scenario.hidden.delete('second');
    if(tick===5)app.scenario.alive=false;
  });
  assert.deepEqual(app.calls,[
    'verify','connect:first','intro:first','ready','verify','background:first','close:first',
    'verify','connect:second','verify','background:second','close:second'
  ]);
});

test('a replacement can take over from a hidden main window, while two visible candidates remain ambiguous',async()=>{
  const app=mockMonitor();
  await app.run(tick=>{
    if(tick===2)app.scenario.targets=[first,second,mini];
    if(tick===3){assert.deepEqual([...app.installed],['first']);app.scenario.hidden.add('first');}
    if(tick===4){assert.deepEqual([...app.installed],['second']);app.scenario.enabled=false;}
  });
  assert.deepEqual(app.calls,[
    'verify','connect:first','intro:first','ready','verify','connect:second','dispose:first',
    'verify','background:second','dispose:second','close:first','close:second'
  ]);
});

test('restore binding stops the session even if a different main target appears',async()=>{
  const app=mockMonitor();
  await app.run(tick=>{
    if(tick===1)app.restore('first','wrong-session');
    if(tick===2){app.restore('first',stopToken);app.scenario.targets=[second];}
  });
  assert.deepEqual(app.calls,['verify','connect:first','intro:first','ready','dispose:first','close:first']);
  assert.equal(app.installed.size,0);
});

test('command restore stops the watcher while main-target discovery is ambiguous',async()=>{
  const app=mockMonitor();
  await app.run(tick=>{
    if(tick===2)app.scenario.targets=[first,second];
    if(tick===3)app.scenario.enabled=false;
  });
  assert.deepEqual(app.calls,['verify','connect:first','intro:first','ready','verify','connect:second','dispose:first','close:first','close:second']);
  assert.equal(app.installed.size,0);
});
