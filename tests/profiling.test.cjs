'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {AppService}=require('../src/services/app-service.cjs');
const {parseProfile}=require('../src/services/profiling.cjs');
async function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aura-profile-')),root=path.join(dir,'project');fs.mkdirSync(root);const service=new AppService({userDataDir:path.join(dir,'private')});await service.invoke('workspace:open',{path:root});t.after(async()=>{await service.dispose();assert(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('aura-profile-'));await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});return {service,root,dir};}
async function completed(service,id){for(let i=0;i<300;i++){const row=await service.invoke('profile:get',{id});if(row.status!=='running')return row;await new Promise(r=>setTimeout(r,100));}throw Error('Profiling timed out');}
test('profile parsers reject malformed, cyclic and nonfinite records',()=>{
  assert.throws(()=>parseProfile({nodes:[]},'node-cpu'),/Malformed/);
  assert.throws(()=>parseProfile({nodes:[{id:1,callFrame:{},children:[1]}],samples:[1]},'node-cpu'),/cyclic/);
  assert.throws(()=>parseProfile({head:{id:1,selfSize:NaN,children:[],callFrame:{}}},'node-heap'),/Invalid/);
});
test('trusted Node CPU and heap launches persist real hotspots and reject stale navigation',async t=>{
  const {service,root,dir}=await fixture(t);
  fs.writeFileSync(path.join(root,'slow.js'),'function slow(){let n=0;for(let i=0;i<30000000;i++)n+=Math.sqrt(i);return n;} console.log(slow());global.keep=Array.from({length:20000},(_,i)=>({text:String(i).repeat(100)}));');
  await assert.rejects(service.invoke('profile:start',{mode:'node-cpu',path:'slow.js'}),/Trust/);
  await assert.rejects(service.invoke('profile:start',{mode:'node-cpu',path:'../escape.js',trusted:true,confirmed:true}),/escapes/);
  for(const mode of ['node-cpu','node-heap']){
    const run=await service.invoke('profile:start',{mode,path:'slow.js',trusted:true,confirmed:true});const row=await completed(service,run.id);
    assert.equal(row.status,'completed',row.error+' '+row.output);assert(row.report.nodes.some(n=>n.self>0));assert(row.report.nodes.some(n=>n.path==='slow.js'));assert(row.configurationHash);
    if(mode==='node-cpu'){const slow=row.report.nodes.find(n=>n.name==='slow');assert(slow&&slow.total>0);const loc=await service.invoke('profile:source',{id:run.id,nodeId:slow.id});assert.equal(loc.path,'slow.js');}
  }
  const row=service.profiling.list()[0],node=service.profiling.get({id:row.id}).report.nodes.find(n=>n.path==='slow.js');fs.appendFileSync(path.join(root,'slow.js'),'\n// changed');await assert.rejects(service.invoke('profile:source',{id:row.id,nodeId:node.id}),/changed/);
  const second=path.join(dir,'other');fs.mkdirSync(second);await service.invoke('workspace:open',{path:second});assert.deepEqual(await service.invoke('profile:list'),[]);await assert.rejects(service.invoke('profile:get',{id:row.id}),/not in/);
});
test('TypeScript source maps resolve saved source and cancellation cleans active processes',async t=>{
  const {service,root}=await fixture(t);const ts=require('typescript');const input='function burn(n:number){let x=0;for(let i=0;i<n;i++)x+=Math.sqrt(i);return x;} console.log(burn(30000000));';
  const output=ts.transpileModule(input,{fileName:'slow.ts',compilerOptions:{sourceMap:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}});fs.writeFileSync(path.join(root,'slow.ts'),input);fs.writeFileSync(path.join(root,'slow.js'),output.outputText);fs.writeFileSync(path.join(root,'slow.js.map'),output.sourceMapText);
  let run=await service.invoke('profile:start',{mode:'node-cpu',path:'slow.js',trusted:true,confirmed:true});let row=await completed(service,run.id);assert.equal(row.status,'completed',row.error);assert(row.report.nodes.some(n=>n.name==='burn'&&n.path==='slow.ts'&&n.mapping==='source-map'));
  fs.writeFileSync(path.join(root,'wait.js'),'setInterval(()=>{},1000)');run=await service.invoke('profile:start',{mode:'node-cpu',path:'wait.js',trusted:true,confirmed:true});await service.invoke('profile:cancel',{id:run.id});row=await completed(service,run.id);assert.equal(row.status,'cancelled');assert.equal(service.profiling.active.size,0);
});
test('Python cProfile and tracemalloc produce real measurements with selected interpreter',async t=>{
  const interpreter=process.env.AURASCRIPT_TEST_PYTHON;if(!interpreter){t.skip('Set AURASCRIPT_TEST_PYTHON to test an installed interpreter');return;}
  const {service,root}=await fixture(t);fs.writeFileSync(path.join(root,'slow.py'),'import math\ndef slow():\n    return sum(math.sqrt(i) for i in range(100000))\nresult=slow()\nretained=[bytearray(1000) for _ in range(1000)]\n');
  for(const mode of ['python-cpu','python-memory']){const run=await service.invoke('profile:start',{mode,path:'slow.py',pythonInterpreter:interpreter,trusted:true,confirmed:true});const row=await completed(service,run.id);assert.equal(row.status,'completed',row.error+' '+row.output);assert(row.report.nodes.some(n=>n.path==='slow.py'&&n.self>0));if(mode==='python-cpu')assert(row.report.nodes.some(n=>n.name==='slow'&&n.total>0));}
});
test('time limits, missing interpreters and restart states are reported truthfully',async t=>{
  const {service,root,dir}=await fixture(t);fs.writeFileSync(path.join(root,'wait.js'),'setInterval(()=>{},1000)');
  const run=await service.invoke('profile:start',{mode:'node-cpu',path:'wait.js',trusted:true,confirmed:true,timeoutMs:150});const row=await completed(service,run.id);assert.equal(row.status,'cancelled');assert.equal(row.cancellationReason,'time limit');
  fs.writeFileSync(path.join(root,'missing.py'),'print(1)');const missing=await service.invoke('profile:start',{mode:'python-cpu',path:'missing.py',pythonInterpreter:path.join(dir,'no-python.exe'),trusted:true,confirmed:true});assert.equal((await completed(service,missing.id)).status,'failed');
  service.store.state.profileRuns[0].status='running';service.store.save();await service.dispose();
  const reopened=new AppService({userDataDir:path.join(dir,'private')});try{assert.equal((await reopened.invoke('profile:list'))[0].status,'interrupted');}finally{await reopened.dispose();}
});
