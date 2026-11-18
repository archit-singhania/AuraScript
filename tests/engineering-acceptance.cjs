'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {AppService}=require('../src/services/app-service.cjs');
(async()=>{
 const packaged=!!process.env.AURA_EXECUTABLE;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aura-engineering-ui-')),root=path.join(dir,'workspace'),userData=path.join(dir,'private');
 const output=path.resolve(process.env.AURA_ACCEPTANCE_OUTPUT || path.join(os.tmpdir(),'aura-engineering-evidence-'+new Date().toISOString().replace(/[:.]/g,'-')));fs.mkdirSync(root);fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{'':{dependencies:{example:'1.0.0'}},'node_modules/example':{version:'1.0.0',license:'MIT'}}}));
 const seed=new AppService({userDataDir:userData});await seed.invoke('workspace:open',{path:root});await seed.invoke('settings:update',{theme:'dark',reducedMotion:true});await seed.dispose();let app;
 try{
  app=await electron.launch({executablePath:path.resolve(process.env.AURA_EXECUTABLE||'node_modules/electron/dist/electron.exe'),args:packaged?[]:[path.resolve('.')],env:{...process.env,AURA_TEST_DATA:userData,AURA_HEADLESS:'1'},timeout:60000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#nav-dependencies').click();await page.getByRole('button',{name:'Inspect saved dependencies',exact:true}).click();await page.getByRole('cell',{name:'MIT',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'dependencies-dark.png')});
  await page.locator('#nav-environment').click();await page.getByLabel('Environment manifest JSON').fill(JSON.stringify({schemaVersion:1,pythonInterpreter:'python',runtimes:{},tools:[],setup:[]}));
  await page.getByRole('button',{name:'Save environment manifest',exact:true}).click();await page.getByText('Manifest saved. No setup commands executed.',{exact:true}).waitFor();
  await page.reload();await page.locator('#nav-environment').click();assert.deepEqual(JSON.parse(await page.getByLabel('Environment manifest JSON').inputValue()).setup,[]);
  for(const [nav,title] of [['impact','Choose tests with evidence.'],['refactoring','Refactor with a reviewable boundary.']]){await page.locator('#nav-'+nav).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();}
  await page.evaluate(()=>window.aura.invoke('settings:update',{theme:'light',reducedMotion:true}));await page.reload();await page.locator('#nav-dependencies').click();await page.getByRole('cell',{name:'MIT',exact:true}).waitFor();await page.screenshot({path:path.join(output,'dependencies-light.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify({checkedAt:new Date().toISOString(),packaged,scope:'Electron: dependency inspection and persisted snapshot; environment save/reload; impact/refactoring empty states; light/dark captures. Service journeys are covered separately by regression tests.',errors},null,2));
  console.log('Engineering acceptance evidence:',output);
 }finally{if(app)await app.close();assert(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('aura-engineering-ui-'));await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
