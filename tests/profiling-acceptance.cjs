'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {AppService}=require('../src/services/app-service.cjs');
(async()=>{
 const packaged=!!process.env.AURA_EXECUTABLE;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aura-profile-ui-')),root=path.join(dir,'workspace'),userData=path.join(dir,'private'),output=path.resolve('docs/screenshots/profiling-2026-10-29'+(packaged?'-packaged':''));fs.mkdirSync(root);fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(root,'slow.js'),'function slow(){let x=0;for(let i=0;i<30000000;i++)x+=Math.sqrt(i);return x;}console.log(slow());');
 fs.writeFileSync(path.join(root,'slow.py'),'def slow():\n    return sum(i*i for i in range(100000))\nprint(slow())\n');
 const seed=new AppService({userDataDir:userData});await seed.invoke('workspace:open',{path:root});await seed.invoke('settings:update',{theme:'dark',reducedMotion:true});await seed.dispose();let app;
 try{
  app=await electron.launch({executablePath:path.resolve(process.env.AURA_EXECUTABLE||'node_modules/electron/dist/electron.exe'),args:packaged?[]:[path.resolve('.')],env:{...process.env,AURA_TEST_DATA:userData,AURA_HEADLESS:'1'},timeout:60000});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#nav-profiling').click();await page.getByLabel('Saved entry path',{exact:true}).fill('slow.js');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Launch approved profile',exact:true}).click();
  await page.getByRole('heading',{name:'Hotspots',exact:true}).waitFor({timeout:30000});assert(await page.getByRole('cell',{name:'slow',exact:true}).count()>0);
  await page.getByRole('heading',{name:'Hotspots',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'desktop-dark.png')});
  const rows=await page.evaluate(()=>window.aura.invoke('profile:list'));assert.equal(rows[0].status,'completed');
  await page.evaluate(()=>window.aura.invoke('settings:update',{theme:'light',reducedMotion:true}));await page.reload();await page.locator('#nav-profiling').click();await page.getByRole('heading',{name:'Hotspots',exact:true}).waitFor();await page.getByRole('heading',{name:'Hotspots',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'desktop-light.png')});
  let pythonChecked=false;
  if(process.env.AURASCRIPT_TEST_PYTHON){await page.getByLabel('Profiler',{exact:true}).selectOption('python-cpu');await page.getByLabel('Saved entry path',{exact:true}).fill('slow.py');await page.getByLabel('Python interpreter',{exact:true}).fill(process.env.AURASCRIPT_TEST_PYTHON);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Launch approved profile',exact:true}).click();for(let i=0;i<100;i++){const all=await page.evaluate(()=>window.aura.invoke('profile:list'));if(all[0]?.configuration.mode==='python-cpu'&&all[0].status!=='running'){assert.equal(all[0].status,'completed',all[0].error);pythonChecked=true;break;}await new Promise(r=>setTimeout(r,100));}assert(pythonChecked,'Python launch must finish');}
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify({checkedAt:new Date().toISOString(),packaged,scope:'Electron: approved Node CPU profile, real hotspots, saved run after renderer reload, light/dark captures',pythonChecked,status:rows[0].status,errors},null,2));
 }finally{if(app)await app.close();assert(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('aura-profile-ui-'));await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
