'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {AppService}=require('../src/services/app-service.cjs');
async function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aura-language-')),root=path.join(dir,'project');fs.mkdirSync(root);const events=[],service=new AppService({userDataDir:path.join(dir,'private'),emit:e=>events.push(e)});await service.invoke('workspace:open',{path:root});t.after(async()=>{await service.dispose();assert(path.basename(dir).startsWith('aura-language-')&&path.dirname(dir)===os.tmpdir());await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});return {root,service,events};}
test('trusted TypeScript server navigates and renames cross-file unsaved buffers',async t=>{
  const {root,service,events}=await fixture(t);fs.writeFileSync(path.join(root,'a.ts'),'export const answer = 42;\n');fs.writeFileSync(path.join(root,'b.ts'),`import { answer } from './a';\nconsole.log(answer);\n`);
  await assert.rejects(service.invoke('language:start',{language:'typescript'}),/trust/);
  await service.invoke('language:start',{language:'typescript',trusted:true});
  await service.invoke('language:sync',{language:'typescript',path:'a.ts',version:1,content:'export const answer = 43;\n'});
  await service.invoke('language:sync',{language:'typescript',path:'b.ts',version:1,content:`import { answer } from './a';\nconsole.log(answer);\n`});
  const base={language:'typescript',path:'b.ts',position:{line:1,character:13}};
  const definition=await service.invoke('language:request',{...base,method:'textDocument/definition'});assert(definition.some(d=>(d.uri||d.targetUri).endsWith('/a.ts')));
  const hover=await service.invoke('language:request',{...base,method:'textDocument/hover'});assert(hover?.contents);
  const rename=await service.invoke('language:request',{...base,path:'a.ts',position:{line:0,character:14},method:'textDocument/rename',newName:'result'});assert(Object.keys(rename.changes||{}).length>=2||rename.documentChanges?.length>=2);
  await assert.rejects(service.invoke('language:sync',{language:'typescript',path:'a.ts',version:1,content:'STALE'}),/Stale/);
  await assert.rejects(service.invoke('language:request',{...base,path:'../private/outside.ts',method:'textDocument/hover'}),/escapes/);
  assert.equal(fs.readFileSync(path.join(root,'a.ts'),'utf8'),'export const answer = 42;\n');
  await service.invoke('language:stop',{language:'typescript'});await assert.rejects(service.invoke('language:request',{...base,method:'textDocument/hover'}),/Start/);
});
test('real Pyright definition and diagnostics without executing Python source',async t=>{
  const {root,service,events}=await fixture(t);fs.writeFileSync(path.join(root,'sample.py'),`def greet(name: str) -> str:\n    return name\nvalue = greet(42)\nraise RuntimeError('MUST NOT EXECUTE')\n`);
  await service.invoke('language:start',{language:'python',trusted:true,pythonInterpreter:process.env.AURA_PYTHON_TEST||'python'});
  await service.invoke('language:sync',{language:'python',path:'sample.py',version:1,content:fs.readFileSync(path.join(root,'sample.py'),'utf8')});
  const d=await service.invoke('language:request',{language:'python',path:'sample.py',method:'textDocument/definition',position:{line:2,character:10}});assert(d.length);
  const deadline=Date.now()+20000;while(Date.now()<deadline&&!events.some(e=>e.type==='language:diagnostics'&&e.diagnostics.some(d=>d.message.includes('not assignable'))))await new Promise(r=>setTimeout(r,100));
  assert(events.some(e=>e.type==='language:diagnostics'&&e.diagnostics.some(d=>d.message.includes('not assignable'))));
});
