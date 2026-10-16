'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {AppService}=require('../src/services/app-service.cjs');
const {jsImports}=require('../src/services/architecture.cjs');
async function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aura-architecture-')),root=path.join(directory,'project');fs.mkdirSync(root);let service=new AppService({userDataDir:path.join(directory,'private')});await service.invoke('workspace:open',{path:root});t.after(async()=>{await service.dispose();assert(path.basename(directory).startsWith('aura-architecture-')&&path.dirname(directory)===os.tmpdir());await fs.promises.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});return {root,service,directory};}
test('compiler AST ignores commented imports and labels computed imports',()=>{
  const r=jsImports('test.ts',`// import fake from './fake';\nexport {a} from './a'; const d=import(variable); const c=require('./b');`);
  assert.deepEqual(r.imports.map(i=>i.specifier),['./a','<dynamic>','./b']);assert.equal(r.imports[1].kind,'dynamic');assert.deepEqual(r.exports,['a']);
});
test('static TS paths and cycles, persisted source hashes, no workspace execution',async t=>{
  const {root,service}=await fixture(t);fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@/*':['src/*']},moduleResolution:'bundler',module:'esnext'}}));
  fs.writeFileSync(path.join(root,'src/a.ts'),`import {b} from '@/b'; export const a=1;`);fs.writeFileSync(path.join(root,'src/b.ts'),`export {a} from './a'; export const b=2; import('external');`);
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{prepare:'SHOULD_NEVER_EXECUTE'}}));
  const result=await service.invoke('architecture:index',{});assert.equal(result.nodes.length,2);assert.deepEqual(result.cycles,[['src/a.ts','src/b.ts']]);assert(result.edges.some(e=>e.specifier==='external'&&e.status==='dynamic'));assert.equal(result.nodes[0].coupling,2);
  assert.equal((await service.invoke('architecture:get')).indexHash,result.indexHash);assert(result.scope.includes('Saved files'));
});
test('Python AST is opt-in, relative/from imports resolve without importing modules',async t=>{
  const {root,service}=await fixture(t);fs.mkdirSync(path.join(root,'pkg'));fs.writeFileSync(path.join(root,'pkg/__init__.py'),'');fs.writeFileSync(path.join(root,'pkg/a.py'),`from . import b\n# import fake\nraise RuntimeError('MUST NOT EXECUTE')\n`);fs.writeFileSync(path.join(root,'pkg/b.py'),'from .a import value\n');
  const unavailable=await service.invoke('architecture:index',{});assert.equal(unavailable.pythonStatus,'unavailable');
  const interpreter=process.env.AURA_PYTHON_TEST;if(!interpreter){t.skip('Explicit test interpreter not configured');return;}
  const result=await service.invoke('architecture:index',{confirmedParser:true,pythonInterpreter:interpreter});assert.equal(result.pythonStatus,'available');assert(result.cycles.some(c=>c.includes('pkg/a.py')&&c.includes('pkg/b.py')));assert(!result.edges.some(e=>e.specifier==='fake'));
});
