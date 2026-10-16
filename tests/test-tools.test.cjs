'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {AppService}=require('../src/services/app-service.cjs');
async function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aura-test-tools-')),root=path.join(dir,'project');fs.mkdirSync(root);const events=[],service=new AppService({userDataDir:path.join(dir,'private'),emit:e=>events.push(e)});await service.invoke('workspace:open',{path:root});t.after(async()=>{await service.dispose();assert(path.basename(dir).startsWith('aura-test-tools-')&&path.dirname(dir)===os.tmpdir());await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});return {root,service,events};}
async function finished(service,id){const deadline=Date.now()+30000;while(Date.now()<deadline){const r=(await service.invoke('test:list')).find(r=>r.id===id);if(r.status!=='running')return r;await new Promise(r=>setTimeout(r,100));}throw new Error('Test adapter did not finish');}
test('pytest discovery, selected actual failure, stdout and real coverage',async t=>{
  const {root,service,events}=await fixture(t);fs.writeFileSync(path.join(root,'test_example.py'),'def test_pass():\n    assert 1 == 1\n\ndef test_fail():\n    assert 1 == 2\n');
  const pythonInterpreter=process.env.AURA_PYTHON_TEST;if(!pythonInterpreter){t.skip('Selected QA interpreter required');return;}
  await assert.rejects(service.invoke('test:start',{runner:'pytest',mode:'discover',pythonInterpreter}),/trust/);
  const discovery=await service.invoke('test:start',{runner:'pytest',mode:'discover',pythonInterpreter,trusted:true});const d=await finished(service,discovery.id);assert.equal(d.status,'completed');assert.equal(d.cases.length,2);
  const run=await service.invoke('test:start',{runner:'pytest',mode:'run',pythonInterpreter,trusted:true,ids:[d.cases.find(c=>c.id.endsWith('test_fail')).id],coverage:true});const result=await finished(service,run.id);assert.equal(result.status,'failed');assert.equal(result.results.length,1);assert.equal(result.results[0].status,'failed');assert(result.results[0].failure_line>0);assert(result.coverage.files.some(r=>r.path==='test_example.py'));assert(events.some(e=>e.type==='test:data'));
  await assert.rejects(service.invoke('test:start',{runner:'pytest',mode:'run',pythonInterpreter,trusted:true,ids:['../outside.py::hack']}),/not discovered/);
});
test('Vitest discovery and selected TypeScript test execute actual results',async t=>{
  const {root,service}=await fixture(t);fs.writeFileSync(path.join(root,'sample.test.ts'),`import { test, expect } from 'vitest';\ntest('pass fixture', () => expect(2).toBe(2));\ntest('fail fixture', () => expect(2).toBe(3));\n`);
  const discovery=await service.invoke('test:start',{runner:'vitest',mode:'discover',trusted:true});const d=await finished(service,discovery.id);assert.equal(d.status,'completed',d.output);assert.equal(d.cases.length,2,JSON.stringify(d));
  const run=await service.invoke('test:start',{runner:'vitest',mode:'run',trusted:true,ids:[d.cases.find(c=>c.name==='pass fixture').id]});const result=await finished(service,run.id);assert.equal(result.status,'completed',result.output);assert(result.results.some(r=>r.name==='pass fixture'&&r.status==='passed'));assert(!result.results.some(r=>r.name==='fail fixture'&&r.status==='failed'));
});
test('coverage imports reject outside files and expose actual lines',async t=>{
  const {root,service}=await fixture(t);fs.writeFileSync(path.join(root,'source.ts'),'const a=1;\nconst b=2;\n');fs.writeFileSync(path.join(root,'coverage.json'),JSON.stringify({'source.ts':{path:'source.ts',statementMap:{0:{start:{line:1},end:{line:1}},1:{start:{line:2},end:{line:2}}},s:{0:1,1:0}}}));const coverage=await service.invoke('coverage:import',{path:'coverage.json'});assert.deepEqual(coverage.files[0].covered,[1]);assert.deepEqual(coverage.files[0].uncovered,[2]);
  fs.writeFileSync(path.join(root,'invalid.json'),JSON.stringify({files:{'../outside.py':{executed_lines:[1],missing_lines:[]}}}));await assert.rejects(service.invoke('coverage:import',{path:'invalid.json'}),/escapes/);
});
test('pytest cancellation stops a live test and persists cancellation',async t=>{
  const {root,service}=await fixture(t);const pythonInterpreter=process.env.AURA_PYTHON_TEST;if(!pythonInterpreter){t.skip('Explicit interpreter unavailable');return;}
  fs.writeFileSync(path.join(root,'test_slow.py'),'import time\ndef test_slow():\n    time.sleep(20)\n');const d=await service.invoke('test:start',{runner:'pytest',mode:'discover',trusted:true,pythonInterpreter});const catalog=await finished(service,d.id);
  const run=await service.invoke('test:start',{runner:'pytest',mode:'run',trusted:true,pythonInterpreter,ids:[catalog.cases[0].id]});await new Promise(r=>setTimeout(r,500));await service.invoke('test:cancel',{id:run.id});assert.equal((await finished(service,run.id)).status,'cancelled');
});
