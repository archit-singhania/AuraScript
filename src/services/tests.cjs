'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {atomicWrite}=require('./store.cjs');
const {execute}=require('./processes.cjs');
class TestTools{
  constructor(workspace,store,emit){this.workspace=workspace;this.store=store;this.emit=emit;this.active=new Map();this.directory=path.join(store.directory,'test-adapters');fs.mkdirSync(this.directory,{recursive:true});this.store.state.testRuns||=[];
    for(const r of this.store.state.testRuns)if(r.status==='running'){r.status='interrupted';r.finishedAt=new Date().toISOString();}store.save();
  }
  list(){const root=this.workspace.root();return this.store.state.testRuns.filter(r=>r.root===root).slice(0,50);}
  owned(id){const row=this.list().find(r=>r.id===id);if(!row)throw new Error('This test run is not in the current workspace');return row;}
  async start(payload){
    if(payload.trusted!==true)throw new Error('Workspace trust is required: discovery and tests may execute project configuration, fixtures and code.');
    if(!['pytest','vitest'].includes(payload.runner)||!['discover','run'].includes(payload.mode))throw new Error('Choose pytest or Vitest discovery/run');
    const root=this.workspace.root(),id=crypto.randomUUID(),output=path.join(this.directory,id+'.json'),coverageOutput=path.join(this.directory,id+'.coverage.json');
    const selection=payload.ids||[];if(!Array.isArray(selection)||selection.length>5000||selection.some(s=>typeof s!=='string'||s.length>2000))throw new Error('Invalid test selection');
    let catalog=[];
    if(payload.mode==='run'){
      const discovery=this.list().find(r=>r.runner===payload.runner&&r.mode==='discover'&&r.status==='completed');if(!discovery)throw new Error('Discover tests before running a selection');catalog=discovery.cases||[];
      if(selection.some(i=>!catalog.some(c=>c.id===i)))throw new Error('Selected test was not discovered');
      for(const c of catalog)this.workspace.resolve(c.path);
      if(!selection.length&&payload.confirmAll!==true)throw new Error('Confirm running the full discovered suite or select tests');
      if(!catalog.length)throw new Error('No discovered workspace tests are available');
    }
    let program,args;
    if(payload.runner==='pytest'){
      program=payload.pythonInterpreter||'python';if(typeof program!=='string'||!program||program.length>1024)throw new Error('Select an installed Python interpreter');
      const request=path.join(this.directory,id+'.request.json');atomicWrite(request,JSON.stringify({root,mode:payload.mode,ids:payload.mode==='run'?(selection.length?selection:catalog.map(c=>c.id)):[],coverage:payload.coverage===true,coverage_data:path.join(this.directory,id+'.coverage'),coverage_output:coverageOutput,output}));args=['-I',path.join(__dirname,'pytest-adapter.py'),request];
    }else{
      program=process.execPath;const cli=path.join(path.dirname(require.resolve('vitest/package.json')),'vitest.mjs');
      args=[cli,payload.mode==='discover'?'list':'run','--root',root,'--maxWorkers=1'];
      if(payload.mode==='discover')args.push('--json='+output);
      else{
        args.push('--reporter=json','--reporter=default','--outputFile='+output);
        if(selection.length){const selected=catalog.filter(c=>selection.includes(c.id));args.push(...[...new Set(selected.map(c=>c.path))]);const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');args.push('--testNamePattern=^(?:'+selected.map(c=>escape(c.name)).join('|')+')$');}
        if(payload.coverage)throw new Error('Import an existing Istanbul report. This release does not install coverage providers automatically.');
      }
    }
    const row={id,root,runner:payload.runner,mode:payload.mode,status:'running',startedAt:new Date().toISOString(),selectedIds:selection,cases:[],results:[],output:'',coverageRequested:payload.coverage===true};
    const child=spawn(program,args,{cwd:root,windowsHide:true,detached:process.platform!=='win32',env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
    const active={row,child,cancelled:false};this.active.set(id,active);this.store.state.testRuns.unshift(row);this.store.state.testRuns=this.store.state.testRuns.slice(0,100);this.store.save();
    const timer=setTimeout(()=>this.cancel({id}).catch(()=>{}),10*60*1000);timer.unref();
    for(const [stream,pipe] of [['stdout',child.stdout],['stderr',child.stderr]])pipe.setEncoding('utf8').on('data',text=>{row.output=(row.output+text).slice(-2*1024*1024);this.emit({type:'test:data',id,stream,data:text});});
    child.on('error',error=>{row.output+='\nRunner unavailable: '+error.code+'. Install pytest/coverage into the selected interpreter explicitly.';});
    active.done=new Promise(resolve=>child.on('close',async(code)=>{
      clearTimeout(timer);this.active.delete(id);row.code=code;row.finishedAt=new Date().toISOString();row.status=active.cancelled?'cancelled':'failed';
      try{
        if(!active.cancelled&&fs.existsSync(output)){
          const stat=await fsp.stat(output);if(stat.size>16*1024*1024)throw new Error('Test report exceeds size limit');const data=JSON.parse(await fsp.readFile(output,'utf8'));
          if(payload.runner==='pytest'){row.cases=data.cases||[];row.results=data.results||[];row.status=code===0?'completed':'failed';}
          else if(payload.mode==='discover'){
            if(!Array.isArray(data))throw new Error('Unexpected Vitest discovery report');row.cases=data.map(c=>{const filename=path.isAbsolute(c.file)?path.relative(root,c.file):c.file;this.workspace.resolve(filename);return {id:filename+'::'+c.name,path:filename.replaceAll('\\','/'),name:c.name,line:c.location?.line||1};}).slice(0,5000);row.status=code===0?'completed':'failed';
          }else{
            row.results=(data.testResults||[]).flatMap(suite=>(suite.assertionResults||[]).map(c=>({id:path.relative(root,suite.name).replaceAll('\\','/')+'::'+c.fullName,path:path.relative(root,suite.name).replaceAll('\\','/'),name:c.fullName,status:c.status,duration:c.duration||0,message:(c.failureMessages||[]).join('\n').slice(0,20000),failure_line:c.location?.line||1}))).slice(0,5000);row.cases=catalog;row.status=code===0?'completed':'failed';
          }
          if(payload.coverage&&fs.existsSync(coverageOutput))row.coverage=this.parseCoverage(JSON.parse(await fsp.readFile(coverageOutput,'utf8')),root);
        }
      }catch(error){row.status='failed';row.output+='\n'+error.message;}
      this.store.save();this.emit({type:'test:finished',id,status:row.status});resolve();
    }));
    return {id,status:row.status};
  }
  parseCoverage(data,root=this.workspace.root()){
    const rows=[];
    const relative=filename=>{const name=path.isAbsolute(filename)?path.relative(root,filename):filename;this.workspace.resolve(name);return name.replaceAll('\\','/');};
    if(data.files){for(const [filename,value] of Object.entries(data.files)){const filenameRelative=relative(filename);rows.push({path:filenameRelative,covered:(value.executed_lines||[]).filter(Number.isInteger),uncovered:(value.missing_lines||[]).filter(Number.isInteger)});}}
    else for(const [filename,value] of Object.entries(data)){if(!value.statementMap||!value.s)continue;const covered=new Set(),uncovered=new Set();for(const [id,statement] of Object.entries(value.statementMap)){if(!Number.isInteger(statement.start?.line)||!Number.isInteger(statement.end?.line)||statement.end.line-statement.start.line>100000)throw new Error('Invalid coverage range');for(let line=statement.start.line;line<=statement.end.line;line++)(value.s[id]>0?covered:uncovered).add(line);}rows.push({path:relative(value.path||filename),covered:[...covered],uncovered:[...uncovered].filter(l=>!covered.has(l))});}
    if(!rows.length)throw new Error('No supported workspace coverage entries were found');
    if(rows.length>5000||rows.some(r=>r.covered.length+r.uncovered.length>1000000||[...r.covered,...r.uncovered].some(l=>l<1)))throw new Error('Coverage report exceeds supported bounds');return {version:1,createdAt:new Date().toISOString(),files:rows};
  }
  async importCoverage(payload){const file=this.workspace.resolve(payload.path),stat=await fsp.stat(file);if(stat.size>16*1024*1024)throw new Error('Coverage limit: 16 MB');const result=this.parseCoverage(JSON.parse(await fsp.readFile(file,'utf8')));this.store.state.coverageReports||={};this.store.state.coverageReports[this.workspace.root()]=result;this.store.save();return result;}
  coverage(){return this.store.state.coverageReports?.[this.workspace.root()]||null;}
  async cancel(payload){const row=this.active.get(payload.id);if(!row)throw new Error('Test run is no longer active');this.owned(payload.id);row.cancelled=true;if(row.child.exitCode===null&&row.child.pid){if(process.platform==='win32'){const result=await execute('taskkill.exe',['/PID',String(row.child.pid),'/T','/F'],{timeout:10000});if(result.code!==0&&this.active.has(payload.id)){row.cancelled=false;throw new Error('Windows refused test-process termination; the run is still active');}}else process.kill(-row.child.pid,'SIGTERM');}await row.done;return {cancelled:true};}
  async close(){await Promise.allSettled([...this.active.keys()].map(id=>this.cancel({id})));}
}
module.exports={TestTools};
