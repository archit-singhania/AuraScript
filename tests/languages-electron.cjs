'use strict';
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve('test-results/languages-20261016-'+Date.now()),workspace=path.join(root,'project');await fs.mkdir(workspace,{recursive:true});await fs.writeFile(path.join(workspace,'sample.ts'),'export const answer = 42;\n');
  const executable=process.env.AURA_EXECUTABLE||path.resolve('node_modules/electron/dist/electron.exe'),app=await electron.launch({executablePath:executable,args:process.env.AURA_EXECUTABLE?[]:[path.resolve('.')],env:{...process.env,AURA_HEADLESS:'1',AURA_TEST_DATA:path.join(root,'private')}});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept().catch(()=>{}));await page.waitForFunction(()=>window.aura&&document.querySelector('#nav-languages'));
    await app.evaluate(({dialog},workspace)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[workspace]});},workspace);await page.locator('#open-workspace').click();await page.getByText('sample.ts',{exact:true}).first().waitFor();await page.getByText('sample.ts',{exact:true}).first().dblclick();
    await page.locator('#nav-languages').click();await page.getByRole('button',{name:'Start JavaScript/TypeScript',exact:true}).click();await page.getByText(/Workspace trust is required/).waitFor();
    await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start JavaScript/TypeScript',exact:true}).click();await page.getByText('Service state updated.',{exact:true}).waitFor();
    await page.evaluate(()=>{const m=window.monaco.editor.getModels().find(m=>m.uri.path.endsWith('/sample.ts'));if(!m)throw new Error('Source model unavailable');m.setValue('export const answer: string = 42;\n');});
    await page.waitForFunction(()=>window.monaco.editor.getModelMarkers({owner:'aura-lsp'}).some(m=>m.message.includes('not assignable')),{},{timeout:20000});
    assert.equal(await page.evaluate(()=>window.monaco.editor.getModelMarkers({owner:'aura-service'}).length),0);
    assert.equal(await fs.readFile(path.join(workspace,'sample.ts'),'utf8'),'export const answer = 42;\n');
    const dir='docs/languages-2026-10-16';await fs.mkdir(dir,{recursive:true});await page.screenshot({path:dir+'/desktop.png',fullPage:true});
    await page.getByRole('button',{name:'Stop JavaScript/TypeScript',exact:true}).click();await page.waitForFunction(()=>window.monaco.editor.getModelMarkers({owner:'aura-lsp'}).length===0);assert.deepEqual(errors,[]);
    await fs.writeFile(dir+'/acceptance.json',JSON.stringify({date:new Date().toISOString(),trustRequired:true,realServer:true,unsavedDiagnostic:true,duplicateMarkers:0,diskUnchanged:true,stopClearedMarkers:true,pageErrors:errors},null,2));console.log('Language services Electron acceptance passed.');
  }finally{await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();}).catch(()=>{});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
