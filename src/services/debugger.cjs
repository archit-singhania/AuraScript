const {diskPath}=require('./runtime-path.cjs');
'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {execute}=require('./processes.cjs');
const {TraceMap,generatedPositionFor,originalPositionFor,LEAST_UPPER_BOUND}=require('@jridgewell/trace-mapping');
class Dap{
  constructor(input,output,onMessage){this.input=input;this.output=output;this.onMessage=onMessage;this.buffer=Buffer.alloc(0);this.seq=1;this.pending=new Map();this.closed=false;input.on('data',c=>this.feed(c));input.on('close',()=>this.fail());input.on('error',()=>this.fail());output.on('error',()=>this.fail());}
  feed(chunk){try{this.buffer=Buffer.concat([this.buffer,chunk]);if(this.buffer.length>8*1024*1024+8192)throw new Error();for(;;){const boundary=this.buffer.indexOf('\r\n\r\n');if(boundary<0){if(this.buffer.length>8192)throw new Error();return;}const match=this.buffer.subarray(0,boundary).toString('ascii').match(/Content-Length:\s*(\d+)/i);if(!match)throw new Error();const length=Number(match[1]);if(!Number.isSafeInteger(length)||length>8*1024*1024)throw new Error();if(this.buffer.length<boundary+4+length)return;const msg=JSON.parse(this.buffer.subarray(boundary+4,boundary+4+length).toString('utf8'));this.buffer=this.buffer.subarray(boundary+4+length);if(msg.type==='response'&&this.pending.has(msg.request_seq)){const p=this.pending.get(msg.request_seq);this.pending.delete(msg.request_seq);clearTimeout(p.timer);msg.success?p.resolve(msg.body||{}):p.reject(new Error(String(msg.message||'Debugger request failed').slice(0,300)));}else this.onMessage(msg);}}catch{this.fail();}}
  send(msg){if(this.closed)throw new Error('Debugger connection closed');const body=Buffer.from(JSON.stringify({seq:this.seq++,...msg}));if(body.length>8*1024*1024)throw new Error('Debugger request too large');this.output.write(Buffer.concat([Buffer.from('Content-Length: '+body.length+'\r\n\r\n'),body]));}
  request(command,args={}){if(this.pending.size>100)return Promise.reject(new Error('Too many debugger requests'));const seq=this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(seq);reject(new Error('Debugger request timed out'));},20000);this.pending.set(seq,{resolve,reject,timer});try{this.send({type:'request',command,arguments:args});}catch(e){this.pending.delete(seq);clearTimeout(timer);reject(e);}});}
  respond(request,success,body={}){this.send({type:'response',request_seq:request.seq,command:request.command,success,body});}
  fail(){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Debugger disconnected'));}this.pending.clear();this.onMessage({type:'event',event:'auraDisconnected'});}
}
class Debugger{
  constructor(workspace,store,emit){this.workspace=workspace;this.store=store;this.emit=emit;this.sessions=new Map();this.store.state.debugWorkspaces||={};}
  settings(){return this.store.state.debugWorkspaces[this.workspace.root()]||{version:1,configurations:[],breakpoints:[]};}
  save(payload){const root=this.workspace.root(),configurations=payload.configurations,breakpoints=payload.breakpoints;
    if(!Array.isArray(configurations)||configurations.length>30||!Array.isArray(breakpoints)||breakpoints.length>200)throw new Error('Invalid debugger settings');
    for(const c of configurations)this.validate(c);for(const b of breakpoints){this.workspace.resolve(b.path);if(!Array.isArray(b.lines)||b.lines.length>200||b.lines.some(l=>!Number.isInteger(l)||l<1||l>1000000))throw new Error('Invalid breakpoint lines');}
    this.store.state.debugWorkspaces[root]={version:1,configurations,breakpoints};this.store.save();return this.settings();
  }
  validate(c){if(!c||!['python','node'].includes(c.language)||typeof c.name!=='string'||!c.name||c.name.length>100)throw new Error('Choose a named Python or Node launch configuration');this.workspace.resolve(c.program);if(c.args!==undefined&&(!Array.isArray(c.args)||c.args.length>50||c.args.some(a=>typeof a!=='string'||a.length>2000)))throw new Error('Invalid launch arguments');for(const key of ['pythonInterpreter','nodeExecutable'])if(c[key]!==undefined&&(typeof c[key]!=='string'||c[key].length>1024))throw new Error('Invalid runtime executable');}
  localMap(config){
    if(config.language!=='node')return null;const program=this.workspace.resolve(config.program);if(fs.statSync(program).size>4*1024*1024)throw new Error('Debugger program exceeds 4 MB');const code=fs.readFileSync(program,'utf8'),match=[...code.matchAll(/[#@]\s*sourceMappingURL=([^\s]+)/g)].at(-1);if(!match||/^https?:|^data:/i.test(match[1]))return null;
    const filename=path.resolve(path.dirname(program),decodeURIComponent(match[1]));this.workspace.resolve(path.relative(this.workspace.root(),filename));if(!fs.existsSync(filename))return null;if(fs.statSync(filename).size>8*1024*1024)throw new Error('Source map exceeds 8 MB');const json=JSON.parse(fs.readFileSync(filename,'utf8')),trace=new TraceMap(json),sources=[];
    for(const source of trace.sources){if(/^[a-z]+:/i.test(source)||/^[a-z]+:/i.test(json.sourceRoot||''))continue;const file=path.resolve(path.dirname(filename),json.sourceRoot||'',source);try{this.workspace.resolve(path.relative(this.workspace.root(),file));sources.push({source,file});}catch{}}
    return {program,trace,sources};
  }
  list(){return [...this.sessions.values()].filter(s=>s.root===this.workspace.root()).map(s=>({id:s.id,name:s.name,language:s.language,status:s.status,threadId:s.threadId,output:s.output,capabilities:s.capabilities}));}
  owned(id){const s=this.sessions.get(id);if(!s||s.root!==this.workspace.root())throw new Error('Debugger session not found in this workspace');return s;}
  async adapter(language,config){
    const root=this.workspace.root();let child,rpc,port;
    if(language==='python'){
      child=spawn(config.pythonInterpreter||'python',['-m','debugpy.adapter'],{cwd:root,windowsHide:true,detached:process.platform!=='win32',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});return {child,input:child.stdout,outputPipe:child.stdin};
    }
    const script=diskPath(path.join(__dirname,'../adapters/js-debug/src/dapDebugServer.js'));if(!fs.existsSync(script))throw new Error('Bundled JavaScript debug adapter is missing');
    child=spawn(process.execPath,[script,'0','127.0.0.1'],{cwd:root,windowsHide:true,detached:process.platform!=='win32',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe']});
    try{port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('JavaScript adapter did not open its local endpoint')),15000);child.on('error',()=>{clearTimeout(timer);reject(new Error('JavaScript adapter unavailable'));});child.once('close',()=>{clearTimeout(timer);reject(new Error('JavaScript adapter stopped before startup'));});child.stdout.setEncoding('utf8').on('data',c=>{text=(text+c).slice(-8192);const m=text.match(/Debug server listening at 127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});});}
    catch(e){child.kill();throw e;}
    const socket=await new Promise((resolve,reject)=>{const s=net.createConnection({host:'127.0.0.1',port});s.once('connect',()=>resolve(s));s.once('error',reject);});return {child,socket,port,input:socket,outputPipe:socket};
  }
  async launch(payload){
    if(payload.trusted!==true)throw new Error('Trust and explicit launch approval are required: debugging executes project code and evaluates watches');
    const config=payload.configuration;this.validate(config);const map=this.localMap(config),root=this.workspace.root(),adapter=await this.adapter(config.language,config),id=crypto.randomUUID();
    const s={id,root,name:config.name,language:config.language,config,map,status:'starting',output:'',children:[],...adapter};this.sessions.set(id,s);
    s.child.stderr.setEncoding('utf8').on('data',text=>{s.output=(s.output+text).slice(-100000);this.emit({type:'debug:output',id,data:text});});s.child.on('error',()=>{s.status='failed';this.emit({type:'debug:state',id,status:s.status});});
    try{await this.initialize(s,false);return this.list().find(row=>row.id===id);}catch(e){await this.stop({id});throw e;}
  }
  async initialize(s,childConfiguration){
    let initialized;const ready=new Promise(resolve=>initialized=resolve);s.rpc=new Dap(s.input,s.outputPipe,(message)=>{});
    // Output stream is separate from the human-readable output field.
    return this.configureConnection(s,childConfiguration,ready,initialized);
  }
  async configureConnection(s,childConfiguration,ready,initialized){
    s.rpc.onMessage=message=>{
      if(message.type==='request'){
        if(message.command==='startDebugging'&&s.language==='node')this.childSession(s,message).catch(()=>{try{s.rpc.respond(message,false);}catch{}});
        else s.rpc.respond(message,false,{error:{id:1,format:'Only internal-console debugging is supported'}});return;
      }
      if(message.type!=='event')return;
      if(message.event==='initialized')initialized();
      else if(message.event==='stopped'){s.status='paused';s.threadId=message.body?.threadId;this.emit({type:'debug:stopped',id:s.id,threadId:s.threadId,reason:message.body?.reason});}
      else if(message.event==='continued'){s.status='running';this.emit({type:'debug:state',id:s.id,status:s.status});}
      else if(message.event==='output'){if(message.body?.category==='telemetry')return;const text=String(message.body?.output||'');s.output=(s.output+text).slice(-100000);this.emit({type:'debug:output',id:s.id,data:text});}
      else if(['terminated','exited','auraDisconnected'].includes(message.event)){s.status=message.event==='auraDisconnected'?'disconnected':'terminated';this.emit({type:'debug:state',id:s.id,status:s.status});}
    };
    const response=await s.rpc.request('initialize',{clientID:'aurascript',adapterID:s.language==='python'?'debugpy':'pwa-node',pathFormat:'path',linesStartAt1:true,columnsStartAt1:true,supportsRunInTerminalRequest:false,supportsStartDebuggingRequest:true,supportsVariableType:true,supportsVariablePaging:true});s.capabilities=response;
    const c=s.config;const launch=childConfiguration||{name:c.name,type:s.language==='python'?'python':'pwa-node',request:'launch',program:this.workspace.resolve(c.program),cwd:s.root,args:c.args||[],console:'internalConsole',...(s.language==='python'?{python:c.pythonInterpreter||'python',justMyCode:false}:{runtimeExecutable:c.nodeExecutable||'node',env:{ELECTRON_RUN_AS_NODE:undefined},sourceMaps:true,pauseForSourceMap:true,__workspaceFolder:s.root,outFiles:[s.root.replaceAll('\\','/')+'/**/*.js'],resolveSourceMapLocations:['**','!**/node_modules/**'],autoAttachChildProcesses:false,skipFiles:['<node_internals>/**']})};
    const launched=s.rpc.request(childConfiguration?'attach':'launch',launch);
    launched.catch(()=>{});let timer;
    try{await Promise.race([ready,launched.then(()=>ready),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Debugger initialization timed out')),15000))]);}finally{clearTimeout(timer);}
    await this.setBreakpoints(s);if(s.capabilities.supportsConfigurationDoneRequest!==false)await s.rpc.request('configurationDone',{});await launched;if(s.status==='starting')s.status='running';return s;
  }
  async childSession(parent,request){
    const socket=await new Promise((resolve,reject)=>{const s=net.createConnection({host:'127.0.0.1',port:parent.port});s.once('connect',()=>resolve(s));s.once('error',reject);});
    const child={id:crypto.randomUUID(),root:parent.root,name:parent.name+' · target',language:'node',config:parent.config,map:parent.map,status:'starting',output:'',input:socket,outputPipe:socket,socket,port:parent.port,children:[],parent:parent.id};this.sessions.set(child.id,child);parent.children.push(child.id);
    await this.initialize(child,request.arguments.configuration);parent.rpc.respond(request,true);this.emit({type:'debug:state',id:child.id,status:child.status});
  }
  async setBreakpoints(s){
    const groups=new Map(),results=[];
    for(const entry of this.settings().breakpoints){const filename=this.workspace.resolve(entry.path),mapped=s.map?.sources.find(source=>source.file===filename),target=mapped?s.map.program:filename;if(!groups.has(target))groups.set(target,[]);
      for(const line of entry.lines){const generated=mapped?generatedPositionFor(s.map.trace,{source:mapped.source,line,column:0,bias:LEAST_UPPER_BOUND}):null;groups.get(target).push({path:entry.path,originalLine:line,line:generated?.line||line,column:generated?.column!==undefined?generated.column+1:undefined,mapped:!!mapped});}
    }
    for(const [target,items] of groups){const result=await s.rpc.request('setBreakpoints',{source:{path:target},breakpoints:items.map(({line,column})=>({line,column})),sourceModified:false});items.forEach((item,i)=>{const record={...(result.breakpoints?.[i]||{verified:false}),line:item.originalLine,...(item.mapped?{generatedPath:this.workspace.rel(target),generatedLine:item.line}:{} )};let row=results.find(r=>r.path===item.path);if(!row){row={path:item.path,breakpoints:[]};results.push(row);}row.breakpoints.push(record);});}
    for(const row of results)this.emit({type:'debug:breakpoints',id:s.id,...row});return results;
  }
  async request(payload){
    const s=this.owned(payload.id),command=payload.command;
    if(command==='setBreakpoints')return this.setBreakpoints(s);
    const allowed=['threads','stackTrace','scopes','variables','evaluate','pause','continue','next','stepIn','stepOut'];if(!allowed.includes(command))throw new Error('Unsupported debug command');
    const args={};for(const key of ['threadId','frameId','variablesReference','start','count'])if(payload[key]!==undefined){if(!Number.isInteger(payload[key])||payload[key]<0)throw new Error('Invalid debugger reference');args[key]=payload[key];}
    if(command==='stackTrace'){args.threadId??=s.threadId;args.startFrame=0;args.levels=100;}
    if(['pause','continue','next','stepIn','stepOut'].includes(command))args.threadId??=s.threadId;
    if(command==='evaluate'){if(typeof payload.expression!=='string'||!payload.expression||payload.expression.length>2000)throw new Error('Supply a watch expression');args.expression=payload.expression;args.context='watch';}
    const result=await s.rpc.request(command,args);
    if(command==='stackTrace')for(const frame of result.stackFrames||[]){if(s.map&&frame.source?.path&&(process.platform==='win32'?path.resolve(frame.source.path).toLowerCase()===s.map.program.toLowerCase():path.resolve(frame.source.path)===s.map.program)){const original=originalPositionFor(s.map.trace,{line:frame.line,column:Math.max(0,(frame.column||1)-1)}),source=s.map.sources.find(r=>r.source===original.source);if(source&&original.line){frame.source={...frame.source,path:source.file,name:path.basename(source.file)};frame.line=original.line;frame.column=(original.column||0)+1;}}
      if(frame.source?.path){try{const relative=path.relative(s.root,frame.source.path);this.workspace.resolve(relative);frame.source.relativePath=relative.replaceAll('\\','/');}catch{frame.source={name:frame.source.name,sourceReference:0};}}}
    return result;
  }
  async stop(payload){const s=this.owned(payload.id);for(const id of s.children)if(this.sessions.has(id))await this.stop({id});try{if(s.rpc&&!s.rpc.closed)await Promise.race([s.rpc.request('disconnect',{terminateDebuggee:true}),new Promise(r=>setTimeout(r,2000))]);}catch{}
    s.socket?.destroy();if(s.child&&s.child.exitCode===null&&s.child.pid){if(process.platform==='win32'){try{await execute('taskkill.exe',['/PID',String(s.child.pid),'/T','/F'],{timeout:10000});}catch{s.child.kill();}}else{try{process.kill(-s.child.pid,'SIGTERM');}catch{s.child.kill();}}}s.rpc?.fail();this.sessions.delete(s.id);return {stopped:true};}
  async close(){await Promise.allSettled([...this.sessions.keys()].map(id=>this.sessions.has(id)?this.stop({id}):null));}
}
module.exports={Debugger,Dap};
