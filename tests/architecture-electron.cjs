'use strict';
const { _electron:electron }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve('test-results/architecture-20261016'),workspace=path.join(root,'project');await fs.mkdir(workspace,{recursive:true});
  await fs.writeFile(path.join(workspace,'a.ts'),`import {b} from './b'; export const a=1;`);await fs.writeFile(path.join(workspace,'b.ts'),`export {a} from './a'; export const b=2; import(dynamicName);`);
  const executable=process.env.AURA_EXECUTABLE||path.resolve('node_modules/electron/dist/electron.exe');
  const app=await electron.launch({executablePath:executable,args:process.env.AURA_EXECUTABLE?[]:[path.resolve('.')],env:{...process.env,AURA_HEADLESS:'1',AURA_TEST_DATA:path.join(root,'private')}});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.aura&&document.querySelector('#nav-architecture'));
    await app.evaluate(({dialog},workspace)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[workspace]});},workspace);
    await page.evaluate(()=>window.aura.invoke('workspace:open',{}));await page.reload();await page.locator('#nav-architecture').click();
    await page.getByRole('button',{name:'Index saved workspace',exact:true}).click();await page.getByRole('heading',{name:'Strongly connected cycles',exact:true}).waitFor();
    const index=await page.evaluate(()=>window.aura.invoke('architecture:get'));assert.deepEqual(index.cycles,[['a.ts','b.ts']]);assert(index.edges.some(e=>e.status==='dynamic'));
    await page.getByRole('button',{name:'a.ts · 1 / 1',exact:true}).click();await page.getByRole('button',{name:'Open source',exact:true}).click();await page.locator('.monaco-editor').first().waitFor();
    // Returning to the explorer preserves editor models and source content.
    await page.locator('#nav-architecture').click();await page.getByRole('heading',{name:'Strongly connected cycles',exact:true}).waitFor();
    const dir='docs/architecture-2026-10-16';await fs.mkdir(dir,{recursive:true});await page.screenshot({path:dir+'/desktop.png',fullPage:true});
    assert.deepEqual(errors,[]);await fs.writeFile(dir+'/acceptance.json',JSON.stringify({date:new Date().toISOString(),staticCycle:true,dynamicLabeled:true,sourceNavigation:true,savedIndex:true,pageErrors:errors},null,2));console.log('Architecture Electron acceptance passed.');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
