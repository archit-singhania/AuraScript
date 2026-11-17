'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{fileURLToPath}=require('node:url');
const {atomicWrite}=require('./store.cjs');
const {execute}=require('./processes.cjs');
const {diskPath}=require('./runtime-path.cjs');
const {TraceMap,originalPositionFor}=require('@jridgewell/trace-mapping');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX=32*1024*1024;
function parseProfile(data,mode){
  let nodes,units,limitation;
  if(mode.startsWith('python-')){nodes=data.nodes;units=data.units;limitation=data.limitation;}
  else if(mode==='node-cpu'){
    if(!Array.isArray(data.nodes)||data.nodes.length>20000||!Array.isArray(data.samples)||data.samples.length>2000000)throw Error('Malformed or oversized CPU profile');
    const weights=new Map();const timed=Array.isArray(data.timeDeltas)&&data.timeDeltas.length===data.samples.length;
    data.samples.forEach((id,i)=>{const v=timed?data.timeDeltas[i]/1000:1;if(!Number.isFinite(v)||v<0)throw Error('Invalid sample duration');weights.set(id,(weights.get(id)||0)+v);});
    nodes=data.nodes.map(n=>({id:n.id,name:n.callFrame?.functionName||'(anonymous)',file:n.callFrame?.url||'',line:(n.callFrame?.lineNumber??-1)+1,column:(n.callFrame?.columnNumber??-1)+1,self:weights.get(n.id)||0,total:0,children:n.children||[]}));
    units=timed?'milliseconds sampled':'samples';limitation='Sampled CPU time is an estimate. Unmapped frames retain generated locations.';
  }else{
    nodes=[];const pending=[data.head];const seen=new Set();
    while(pending.length){const n=pending.pop();if(!n||seen.has(n.id)||nodes.length>=20000)throw Error('Malformed or oversized heap profile');seen.add(n.id);if(!Array.isArray(n.children))throw Error('Invalid heap children');nodes.push({id:n.id,name:n.callFrame?.functionName||'(anonymous)',file:n.callFrame?.url||'',line:(n.callFrame?.lineNumber??-1)+1,column:(n.callFrame?.columnNumber??-1)+1,self:n.selfSize,total:0,children:n.children.map(c=>c.id)});pending.push(...n.children);}
    units='sampled allocation bytes';limitation='Node heap sampling estimates live V8 allocations; it does not measure every native allocation.';
  }
  if(!Array.isArray(nodes)||nodes.length>20000)throw Error('Invalid profile nodes');
  const byId=new Map();for(const n of nodes){if(!Number.isInteger(n.id)||byId.has(n.id)||typeof n.name!=='string'||typeof n.file!=='string'||!Number.isFinite(n.self)||n.self<0||!Array.isArray(n.children)||n.children.length>20000)throw Error('Invalid profile node');byId.set(n.id,n);}
  for(const n of nodes)if(n.children.some(id=>!byId.has(id)))throw Error('Profile refers to an absent frame');
  if(!mode.startsWith('python-')){
    const visiting=new Set(),done=new Set();
    function total(id,depth){if(depth>256||visiting.has(id))throw Error('Profile tree is cyclic or too deep');if(done.has(id))return byId.get(id).total;visiting.add(id);const n=byId.get(id);n.total=n.self+n.children.reduce((s,c)=>s+total(c,depth+1),0);visiting.delete(id);done.add(id);return n.total;}
    nodes.forEach(n=>total(n.id,0));
  }
  for(const n of nodes)if(!Number.isFinite(n.total)||n.total<0)throw Error('Invalid profile total');
  return {version:1,nodes,units,limitation,runtime:data.runtime||'Node '+process.versions.node};
}
class Profiling{
  constructor(workspace,store,emit){this.workspace=workspace;this.store=store;this.emit=emit;this.active=new Map();this.directory=path.join(store.directory,'profiles');fs.mkdirSync(this.directory,{recursive:true});store.state.profileRuns||=[];for(const r of store.state.profileRuns)if(r.status==='running'){r.status='interrupted';r.error='Application stopped before profiling completed';}store.save();}
  list(){return this.store.state.profileRuns.filter(r=>r.root===this.workspace.root()).slice(0,50);}
  owned(id){const r=this.list().find(r=>r.id===id);if(!r)throw Error('Profile is not in this workspace');return r;}
  get({id}){const row=this.owned(id);const file=path.join(this.directory,row.id,'normalized.json');return {...row,report:fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null};}
  source({id,nodeId}){const node=this.get({id}).report?.nodes.find(n=>n.id===nodeId);if(!node?.path||!node.sourceHash)throw Error('No navigable workspace source is available');const file=this.workspace.resolve(node.path);if(hash(fs.readFileSync(file))!==node.sourceHash)throw Error('Source changed since profiling; re-run before navigating to this location.');return {path:node.path,line:Math.max(1,node.line||1)};}
  locations(report){
    for(const node of report.nodes){node.path=null;node.mapping='unavailable';try{
      let full=node.file.startsWith('file:')?fileURLToPath(node.file):node.file;
      if(!path.isAbsolute(full))continue;
      let relative=path.relative(this.workspace.root(),full);full=this.workspace.resolve(relative);if(!fs.statSync(full).isFile()||fs.statSync(full).size>4*1024*1024)continue;
      node.path=relative.replaceAll('\\','/');node.mapping='generated';
      if(/\.[cm]?js$/.test(full)&&fs.statSync(full).size<4*1024*1024){
        const source=fs.readFileSync(full,'utf8'),match=source.match(/\/\/# sourceMappingURL=([^\s]+)\s*$/);
        if(match&&!match[1].includes(':')){const mapPath=this.workspace.resolve(path.relative(this.workspace.root(),path.resolve(path.dirname(full),match[1])));if(fs.statSync(mapPath).size<2*1024*1024){const mapped=originalPositionFor(new TraceMap(JSON.parse(fs.readFileSync(mapPath,'utf8'))),{line:Math.max(1,node.line),column:Math.max(0,(node.column||1)-1)});if(mapped.source&&mapped.line){const original=this.workspace.resolve(path.relative(this.workspace.root(),path.resolve(path.dirname(mapPath),mapped.source)));if(fs.statSync(original).isFile()){node.path=this.workspace.rel(original);node.line=mapped.line;node.mapping='source-map';full=original;}}}}
      }
      node.sourceHash=hash(fs.readFileSync(full));
    }catch{node.mapping=node.path?'generated · source map unavailable':'unavailable';}}
    return report;
  }
  async start(p){
    if(p.trusted!==true||p.confirmed!==true)throw Error('Trust the workspace and explicitly approve this profiling launch; it executes project code.');
    if(this.active.size)throw Error('Stop the active profile before launching another.');
    if(!['python-cpu','python-memory','node-cpu','node-heap'].includes(p.mode))throw Error('Choose a supported profiler');
    const entry=this.workspace.resolve(p.path);if(!fs.statSync(entry).isFile()||fs.statSync(entry).size>4*1024*1024)throw Error('Choose a source entry smaller than 4 MB');
    if(!(p.mode.startsWith('python-')?/\.py$/i:/\.[cm]?js$/i).test(entry))throw Error('Use a Python file or compiled JavaScript entry. TypeScript navigation uses adjacent source maps.');
    const args=p.args||[];if(!Array.isArray(args)||args.length>100||args.some(a=>typeof a!=='string'||a.length>4096||a.includes('\0')))throw Error('Invalid script arguments');
    const duration=p.timeoutMs??30000;if(!Number.isInteger(duration)||duration<100||duration>120000)throw Error('Choose a time limit of 100–120000 ms');
    const id=crypto.randomUUID(),root=this.workspace.root(),dir=path.join(this.directory,id);fs.mkdirSync(dir);
    const output=path.join(dir,'raw.json');let program,launch;
    if(p.mode.startsWith('python-')){program=p.pythonInterpreter||'python';if(typeof program!=='string'||program.length>1024||program.includes('\0'))throw Error('Choose an installed Python interpreter');const request=path.join(dir,'request.json');atomicWrite(request,JSON.stringify({entry,args,mode:p.mode,output}));launch=['-I',diskPath(path.join(__dirname,'profile-python.py')),request];}
    else{program=process.execPath;const flag=p.mode==='node-cpu'?'cpu':'heap';launch=[`--${flag}-prof`,`--${flag}-prof-dir=${dir}`,`--${flag}-prof-name=raw.json`,...(flag==='heap'?['--heap-prof-interval=4096']:[]),'--enable-source-maps',entry,...args];}
    const configuration={mode:p.mode,path:p.path,args,timeoutMs:duration,interpreter:program};
    const row={id,root,environmentFingerprint:this.store.state.environmentReports[root]?.fingerprint||null,configuration,configurationHash:hash(JSON.stringify(configuration)),entryHash:hash(fs.readFileSync(entry)),startedAt:new Date().toISOString(),status:'running',output:''};
    const env={...process.env,ELECTRON_RUN_AS_NODE:'1',PYTHONDONTWRITEBYTECODE:'1'};delete env.NODE_OPTIONS;
    const child=spawn(program,launch,{cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env});
    const active={child,row,cancelled:false};this.active.set(id,active);this.store.state.profileRuns.unshift(row);this.store.save();
    const timer=setTimeout(()=>this.cancel({id,reason:'time limit'}).catch(e=>{row.error=e.message;}),duration);timer.unref();
    for(const stream of [child.stdout,child.stderr])stream.setEncoding('utf8').on('data',text=>{row.output=(row.output+text).slice(-256*1024);this.emit({type:'profile:data',id});});
    child.on('error',e=>{row.error='Profiler could not start: '+e.message;});
    active.done=new Promise(resolve=>child.on('close',code=>{clearTimeout(timer);row.code=code;row.finishedAt=new Date().toISOString();row.status=active.cancelled?'cancelled':code===0?'completed':'failed';try{if(!active.cancelled){if(!fs.existsSync(output)||fs.statSync(output).size>MAX)throw Error('Profile output is absent or exceeds 32 MB');const report=this.locations(parseProfile(JSON.parse(fs.readFileSync(output,'utf8')),p.mode));atomicWrite(path.join(dir,'normalized.json'),JSON.stringify(report));row.runtime=report.runtime;row.nodes=report.nodes.length;}}catch(e){row.error=row.error||e.message;row.status='failed';}this.active.delete(id);this.store.save();this.emit({type:'profile:finished',id,status:row.status});resolve();}));
    return {id,status:row.status};
  }
  async cancel({id,reason='user request'}){this.owned(id);const a=this.active.get(id);if(!a)throw Error('Profile is no longer active');a.cancelled=true;a.row.cancellationReason=reason;if(a.child.pid&&a.child.exitCode===null){if(process.platform==='win32'){const r=await execute('taskkill.exe',['/PID',String(a.child.pid),'/T','/F'],{timeout:10000});if(r.code!==0&&this.active.has(id)){a.cancelled=false;throw Error('Process termination failed; profiling remains active');}}else process.kill(-a.child.pid,'SIGKILL');}await a.done;return {cancelled:true};}
  async close(){await Promise.all([...this.active.keys()].map(id=>this.cancel({id})));}
}
module.exports={Profiling,parseProfile};

