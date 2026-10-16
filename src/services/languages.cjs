const {diskPath}=require('./runtime-path.cjs');
'use strict';
const path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL,fileURLToPath}=require('node:url');
const {contained}=require('./workspace.cjs');
const MAX=8*1024*1024;
class Rpc{
  constructor(child,onMessage){this.child=child;this.onMessage=onMessage;this.buffer=Buffer.alloc(0);this.next=1;this.pending=new Map();this.closed=false;
    child.stdout.on('data',chunk=>this.feed(chunk));child.stdin.on('error',()=>this.fail());child.on('error',()=>this.fail());child.on('close',()=>this.fail());child.stderr.on('data',()=>{});
  }
  feed(chunk){try{
    this.buffer=Buffer.concat([this.buffer,chunk]);if(this.buffer.length>MAX+8192)throw new Error('Oversized language message');
    for(;;){const boundary=this.buffer.indexOf('\r\n\r\n');if(boundary<0){if(this.buffer.length>8192)throw new Error('Malformed language header');return;}
      const header=this.buffer.subarray(0,boundary).toString('ascii'),matches=[...header.matchAll(/(?:^|\r\n)Content-Length:\s*(\d+)/gi)];if(matches.length!==1)throw new Error('Malformed language message');const length=Number(matches[0][1]);if(!Number.isSafeInteger(length)||length>MAX)throw new Error('Oversized language message');if(this.buffer.length<boundary+4+length)return;
      const message=JSON.parse(this.buffer.subarray(boundary+4,boundary+4+length).toString('utf8'));this.buffer=this.buffer.subarray(boundary+4+length);
      if(message.method)this.onMessage(message);
      else if(this.pending.has(message.id)){const pending=this.pending.get(message.id);this.pending.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(new Error(String(message.error.message||'Language request failed').slice(0,200))):pending.resolve(message.result);}
    }
  }catch{this.fail();this.child.kill();}}
  send(message){if(this.closed)throw new Error('Language server is unavailable');const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));if(body.length>MAX)throw new Error('Language request is too large');this.child.stdin.write(Buffer.concat([Buffer.from('Content-Length: '+body.length+'\r\n\r\n'),body]));}
  notify(method,params){this.send({method,params});}
  request(method,params){if(this.pending.size>=100)return Promise.reject(new Error('Too many language requests'));const id=this.next++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Language request timed out'));try{this.notify('$/cancelRequest',{id});}catch{}},20000);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  fail(){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Language server stopped; lightweight diagnostics remain available'));}this.pending.clear();this.onMessage({method:'aura/stopped'});}
}
class Languages{
  constructor(workspace,emit){this.workspace=workspace;this.emit=emit;this.sessions=new Map();}
  status(){return [...this.sessions.entries()].map(([language,s])=>({language,root:s.root,available:!s.rpc.closed,capabilities:s.capabilities}));}
  session(language){const s=this.sessions.get(language);if(!s||s.rpc.closed||s.root!==this.workspace.root())throw new Error('Start this workspace language server explicitly first');return s;}
  uri(relative){return pathToFileURL(this.workspace.resolve(relative)).href;}
  ownedUri(uri){try{const filename=fileURLToPath(uri);if(!contained(this.workspace.root(),filename))return false;this.workspace.resolve(path.relative(this.workspace.root(),filename));return true;}catch{return false;}}
  async start(payload){
    if(payload.trusted!==true)throw new Error('Workspace trust is required before starting language services. Project configuration and plugins may be read.');
    const language=payload.language;if(!['python','typescript'].includes(language))throw new Error('Choose Python or TypeScript/JavaScript');
    const root=this.workspace.root();await this.stop(language);
    const script=language==='python'?diskPath(require.resolve('pyright/langserver.index.js')):diskPath(path.join(path.dirname(require.resolve('typescript-language-server/package.json')),'lib/cli.mjs'));
    const child=spawn(process.execPath,[script,'--stdio'],{cwd:root,windowsHide:true,detached:process.platform!=='win32',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['pipe','pipe','pipe']});
    const session={root,child,buffers:new Map(),capabilities:null};
    const config=language==='python'?{python:{pythonPath:typeof payload.pythonInterpreter==='string'?payload.pythonInterpreter:'python',analysis:{autoSearchPaths:true,diagnosticMode:'workspace',typeCheckingMode:'basic'}}}:{};
    session.rpc=new Rpc(child,message=>{
      if(message.method==='aura/stopped'){this.emit({type:'language:stopped',language,root});return;}
      if(message.id!==undefined){
        if(message.method==='workspace/configuration')session.rpc.send({id:message.id,result:(message.params?.items||[]).map(i=>i.section==='python'?config.python:i.section==='python.analysis'?config.python?.analysis:{})});
        else if(message.method==='workspace/applyEdit')session.rpc.send({id:message.id,result:{applied:false,failureReason:'Workspace edits require explicit editor review.'}});
        else session.rpc.send({id:message.id,result:null});return;
      }
      if(message.method==='textDocument/publishDiagnostics'&&this.workspace.root()===root&&this.ownedUri(message.params?.uri))this.emit({type:'language:diagnostics',language,root,uri:message.params.uri,version:message.params.version,diagnostics:(message.params.diagnostics||[]).slice(0,2000)});
    });
    this.sessions.set(language,session);
    try{
      const result=await session.rpc.request('initialize',{processId:process.pid,rootUri:pathToFileURL(root).href,workspaceFolders:[{uri:pathToFileURL(root).href,name:path.basename(root)}],capabilities:{workspace:{configuration:true,workspaceFolders:true,applyEdit:false},textDocument:{synchronization:{dynamicRegistration:false},completion:{completionItem:{snippetSupport:false}},hover:{contentFormat:['markdown','plaintext']},definition:{linkSupport:true},publishDiagnostics:{versionSupport:true}}},initializationOptions:{disableAutomaticTypingAcquisition:true,tsserver:{path:diskPath(require.resolve('typescript/lib/tsserver.js')),maxTsServerMemory:1024}}});
      session.capabilities=result.capabilities;session.rpc.notify('initialized',{});session.rpc.notify('workspace/didChangeConfiguration',{settings:config});return {language,available:true,capabilities:session.capabilities};
    }catch(e){await this.stop(language);throw e;}
  }
  sync(payload){
    const s=this.session(payload.language),uri=this.uri(payload.path);if(typeof payload.content!=='string'||Buffer.byteLength(payload.content)>4*1024*1024)throw new Error('Language buffer limit: 4 MB');
    if(!Number.isInteger(payload.version)||payload.version<1)throw new Error('Supply a valid buffer version');
    const previous=s.buffers.get(uri);if(previous&&payload.version<=previous.version){if(payload.version===previous.version&&payload.content===previous.content)return {synced:true};throw new Error('Stale language buffer version');}
    const languageId=payload.language==='python'?'python':/\.(tsx|jsx)$/.test(payload.path)?(/\.tsx$/.test(payload.path)?'typescriptreact':'javascriptreact'):/\.[cm]?ts$/.test(payload.path)?'typescript':'javascript';
    if(!previous)s.rpc.notify('textDocument/didOpen',{textDocument:{uri,languageId,version:payload.version,text:payload.content}});
    else s.rpc.notify('textDocument/didChange',{textDocument:{uri,version:payload.version},contentChanges:[{text:payload.content}]});
    s.buffers.set(uri,{version:payload.version,content:payload.content});return {synced:true};
  }
  async request(payload){
    const allowed=['textDocument/completion','textDocument/hover','textDocument/definition','textDocument/references','textDocument/rename'];if(!allowed.includes(payload.method))throw new Error('Unsupported language operation');
    const s=this.session(payload.language),uri=this.uri(payload.path),position=payload.position;
    if(!position||!Number.isInteger(position.line)||!Number.isInteger(position.character)||position.line<0||position.character<0||position.line>1000000||position.character>1000000)throw new Error('Invalid language position');
    const params={textDocument:{uri},position};if(payload.method==='textDocument/references')params.context={includeDeclaration:true};
    if(payload.method==='textDocument/rename'){if(typeof payload.newName!=='string'||!payload.newName||payload.newName.length>200)throw new Error('Supply a rename identifier');params.newName=payload.newName;}
    const result=await s.rpc.request(payload.method,params);
    if(payload.method==='textDocument/definition'||payload.method==='textDocument/references')return (Array.isArray(result)?result:result?[result]:[]).filter(r=>this.ownedUri(r.uri||r.targetUri));
    if(payload.method==='textDocument/rename'&&result){
      if(result.documentChanges?.some(c=>!c.textDocument||!this.ownedUri(c.textDocument.uri))||Object.keys(result.changes||{}).some(u=>!this.ownedUri(u)))throw new Error('Rename touches external or unsupported resource operations; review manually');
    }return result;
  }
  async stop(language){const s=this.sessions.get(language);if(!s)return {stopped:true};this.sessions.delete(language);try{
    if(!s.rpc.closed){await Promise.race([s.rpc.request('shutdown',null),new Promise(r=>setTimeout(r,1000))]);s.rpc.notify('exit');}
    if(s.child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(resolve,1000);s.child.once('close',()=>{clearTimeout(timer);resolve();});});
  }catch{}finally{
    if(s.child.exitCode===null&&s.child.pid){
      if(process.platform==='win32'){try{await require('./processes.cjs').execute('taskkill.exe',['/PID',String(s.child.pid),'/T','/F'],{timeout:5000});}catch{s.child.kill();}}
      else{try{process.kill(-s.child.pid,'SIGTERM');}catch{s.child.kill();}}
    }s.rpc.fail();
  }return {stopped:true};}
  async close(){await Promise.allSettled([...this.sessions.keys()].map(l=>this.stop(l)));}
}
module.exports={Languages,Rpc};
