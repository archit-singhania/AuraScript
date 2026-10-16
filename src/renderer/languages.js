const range=r=>({startLineNumber:r.start.line+1,startColumn:r.start.character+1,endLineNumber:r.end.line+1,endColumn:r.end.character+1});
export class LanguageTools{
  constructor(monaco,{invoke,workspace,files,addFile,notify}){
    Object.assign(this,{monaco,invoke,workspace,files,addFile,notify});this.active=new Set();this.marked=new Set();this.timers=new Map();this.versions=new Map();
    this.nativeModes=new Map();
    const language=model=>model.getLanguageId()==='python'?'python':['javascript','typescript','javascriptreact','typescriptreact'].includes(model.getLanguageId())?'typescript':null;
    this.language=language;
    const sync=model=>{const type=language(model);if(!this.active.has(type))return;clearTimeout(this.timers.get(model.uri.toString()));this.timers.set(model.uri.toString(),setTimeout(()=>this.sync(model).catch(e=>notify(e.message)),120));};
    const track=model=>{const listener=model.onDidChangeContent(()=>sync(model));model.onWillDispose(()=>{listener.dispose();clearTimeout(this.timers.get(model.uri.toString()));});};monaco.editor.onDidCreateModel(track);monaco.editor.getModels().forEach(track);
    const selector=['python','javascript','typescript','javascriptreact','typescriptreact'];
    const request=async(method,model,position,extra={})=>{
      if(!this.active.has(language(model)))return null;const version=model.getVersionId();await this.sync(model);const result=await invoke('language:request',{language:language(model),path:this.relative(model.uri),method,position:{line:position.lineNumber-1,character:position.column-1},...extra});if(model.getVersionId()!==version)throw new Error('Buffer changed during the language request; try again.');return result;
    };
    selector.forEach(id=>{
      monaco.languages.registerCompletionItemProvider(id,{triggerCharacters:['.'],provideCompletionItems:async(model,pos)=>{const r=await request('textDocument/completion',model,pos);if(!r)return {suggestions:[]};const items=Array.isArray(r)?r:r.items||[],word=model.getWordUntilPosition(pos);return {suggestions:items.slice(0,1000).map(i=>({label:i.label,detail:i.detail,kind:monaco.languages.CompletionItemKind.Text,insertText:i.textEdit?.newText||i.insertText||i.label,range:i.textEdit?.range?range(i.textEdit.range):{startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn},sortText:i.sortText,filterText:i.filterText,documentation:typeof i.documentation==='string'?i.documentation:i.documentation?.value}))};}});
      monaco.languages.registerHoverProvider(id,{provideHover:async(model,pos)=>{const r=await request('textDocument/hover',model,pos);if(!r)return null;const content=Array.isArray(r.contents)?r.contents:[r.contents];return {range:r.range?range(r.range):undefined,contents:content.filter(Boolean).map(c=>({value:typeof c==='string'?c:c.value||'',isTrusted:false,supportHtml:false}))};}});
      monaco.languages.registerDefinitionProvider(id,{provideDefinition:async(model,pos)=>{const rows=await request('textDocument/definition',model,pos)||[];for(const row of rows)await this.ensure(row.uri||row.targetUri);return rows.map(r=>({uri:monaco.Uri.parse(r.uri||r.targetUri),range:range(r.range||r.targetSelectionRange||r.targetRange)}));}});
      monaco.languages.registerReferenceProvider(id,{provideReferences:async(model,pos)=>{const rows=await request('textDocument/references',model,pos)||[];for(const row of rows)await this.ensure(row.uri);return rows.map(r=>({uri:monaco.Uri.parse(r.uri),range:range(r.range)}));}});
      monaco.languages.registerRenameProvider(id,{provideRenameEdits:async(model,pos,newName)=>{const result=await request('textDocument/rename',model,pos,{newName});if(!result)return null;const edits=[];
        for(const [uri,changes] of Object.entries(result.changes||{})){const target=await this.ensure(uri);for(const c of changes)edits.push({resource:monaco.Uri.parse(uri),versionId:target.getVersionId(),textEdit:{range:range(c.range),text:c.newText}});}
        for(const c of result.documentChanges||[]){const target=await this.ensure(c.textDocument.uri);for(const e of c.edits)edits.push({resource:monaco.Uri.parse(c.textDocument.uri),versionId:target.getVersionId(),textEdit:{range:range(e.range),text:e.newText}});}
        return {edits};}});
    });
    window.aura.onEvent(event=>{
      if(event.type==='language:stopped'){this.active.delete(event.language);this.native(event.language,false);for(const model of monaco.editor.getModels())if(language(model)===event.language)monaco.editor.setModelMarkers(model,'aura-lsp',[]);notify('Language server stopped. Lightweight diagnostics are available.');return;}
      if(event.type!=='language:diagnostics')return;const uri=monaco.Uri.parse(event.uri),model=monaco.editor.getModel(uri);if(!model)return;
      const state=this.versions.get(event.uri);if(event.version!==undefined&&event.version!==state?.version)return;
      if(state?.modelVersion!==model.getVersionId())return;
      monaco.editor.setModelMarkers(model,'aura-service',[]);monaco.editor.setModelMarkers(model,'aura-lsp',(event.diagnostics||[]).map(d=>({...range(d.range),message:d.message,severity:d.severity===2?monaco.MarkerSeverity.Warning:d.severity===3?monaco.MarkerSeverity.Info:monaco.MarkerSeverity.Error,source:d.source,code:d.code!==undefined?String(d.code):undefined})));this.marked.add(event.uri);
    });
  }
  relative(uri){const root=this.workspace().replaceAll('\\','/').replace(/\/$/,'')+'/',filename=uri.fsPath.replaceAll('\\','/');if(!filename.toLowerCase().startsWith(root.toLowerCase()))throw new Error('Language resource is outside this workspace');return filename.slice(root.length);}
  async ensure(uri){const parsed=this.monaco.Uri.parse(uri),existing=this.monaco.editor.getModel(parsed);if(existing)return existing;const data=await this.invoke('file:read',{path:this.relative(parsed)});return this.addFile(data,false).model;}
  async sync(model){const type=this.language(model);if(!this.active.has(type))return false;const uri=model.uri.toString(),previous=this.versions.get(uri),modelVersion=model.getVersionId();if(previous?.modelVersion===modelVersion)return true;const version=(previous?.version||0)+1;this.versions.set(uri,{version,modelVersion});try{await this.invoke('language:sync',{language:type,path:this.relative(model.uri),content:model.getValue(),version});}catch(e){this.versions.delete(uri);throw e;}return true;}
  has(model){return this.active.has(this.language(model));}
  native(type,active){if(type!=='typescript')return;for(const key of ['typescriptDefaults','javascriptDefaults']){const defaults=this.monaco.languages.typescript?.[key];if(!defaults)continue;if(active){if(!this.nativeModes.has(key))this.nativeModes.set(key,{...defaults.modeConfiguration});defaults.setModeConfiguration({...defaults.modeConfiguration,completionItems:false,hovers:false,definitions:false,references:false,rename:false,diagnostics:false});}else if(this.nativeModes.has(key)){defaults.setModeConfiguration(this.nativeModes.get(key));this.nativeModes.delete(key);}}}
  async start(type,trusted,pythonInterpreter){await this.invoke('language:start',{language:type,trusted,pythonInterpreter});this.active.add(type);this.native(type,true);for(const model of this.monaco.editor.getModels())if(this.language(model)===type){this.versions.delete(model.uri.toString());await this.sync(model);}}
  async stop(type){this.active.delete(type);await this.invoke('language:stop',{language:type});}
  async page(page){
    const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};const h=el('h1','Language services'),description=el('p','Completion, hover, definitions, references, rename and cross-file diagnostics for trusted Python and JavaScript/TypeScript workspaces. Servers read project configuration; startup never installs project dependencies.');
    const trust=el('input');trust.type='checkbox';const label=el('label');label.append(trust,document.createTextNode('I trust this workspace and approve starting its language services.'));
    const interpreter=el('input');interpreter.value='python';interpreter.setAttribute('aria-label','Selected Python interpreter');const status=el('p');status.setAttribute('role','status');const controls=el('section');controls.className='card architecture-controls';controls.append(label,interpreter);
    const add=(text,run)=>{const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await run();status.textContent='Service state updated.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};controls.append(b);};
    for(const [type,title] of [['python','Python · Pyright'],['typescript','JavaScript/TypeScript']]){add('Start '+title,()=>this.start(type,trust.checked,interpreter.value));add('Stop '+title,()=>this.stop(type));}
    controls.append(status);page.replaceChildren(h,description,controls);status.textContent=(await this.invoke('language:status')).map(s=>s.language+': '+(s.available?'running':'unavailable')).join(' · ')||'Services are stopped. Lightweight diagnostics remain available.';
  }
}
