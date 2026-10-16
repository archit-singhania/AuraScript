'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const ts=require('typescript');
const OMIT=new Set(['.git','node_modules','.venv','venv','__pycache__','dist','build','.next','.dart_tool','coverage','.idea']);
const SOURCE=/\.(py|[cm]?js|jsx|[cm]?ts|tsx)$/i;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function jsImports(filename,text){
  const file=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true),imports=[],exports=[];
  const add=(specifier,node,kind)=>imports.push({specifier:specifier&&ts.isStringLiteralLike(specifier)?specifier.text:'<dynamic>',line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,kind});
  const visit=node=>{
    if(ts.isImportDeclaration(node))add(node.moduleSpecifier,node,'import');
    if(ts.isExportDeclaration(node)){if(node.moduleSpecifier)add(node.moduleSpecifier,node,'export');if(node.exportClause&&ts.isNamedExports(node.exportClause))exports.push(...node.exportClause.elements.map(x=>x.name.text));}
    if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference))add(node.moduleReference.expression,node,'import');
    if(ts.isCallExpression(node)){
      if(node.expression.kind===ts.SyntaxKind.ImportKeyword)add(node.arguments[0],node,'dynamic');
      else if(ts.isIdentifier(node.expression)&&node.expression.text==='require')add(node.arguments[0],node,'require');
    }
    if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&node.name?.text)exports.push(node.name.text);
    ts.forEachChild(node,visit);
  };visit(file);
  return {imports,exports:[...new Set(exports)],errors:(file.parseDiagnostics||[]).map(d=>({line:file.getLineAndCharacterOfPosition(d.start||0).line+1,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}))};
}
function cycles(nodes,edges){
  const adjacency=new Map(nodes.map(n=>[n.path,[]]));for(const e of edges)if(e.target)adjacency.get(e.source)?.push(e.target);
  let index=0;const stack=[],on=new Set(),indices=new Map(),low=new Map(),components=[];
  function visit(v){indices.set(v,index);low.set(v,index++);stack.push(v);on.add(v);
    for(const w of adjacency.get(v)||[]){if(!indices.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));}else if(on.has(w))low.set(v,Math.min(low.get(v),indices.get(w)));}
    if(low.get(v)===indices.get(v)){const group=[];let w;do{w=stack.pop();on.delete(w);group.push(w);}while(w!==v);if(group.length>1||(adjacency.get(v)||[]).includes(v))components.push(group.sort());}
  }for(const n of nodes)if(!indices.has(n.path))visit(n.path);return components;
}
function pythonParse(rows,interpreter){
  return new Promise((resolve,reject)=>{
    if(typeof interpreter!=='string'||!interpreter||interpreter.length>1024)throw new Error('Select a Python interpreter.');
    const child=spawn(interpreter,['-I',path.join(__dirname,'python-architecture.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',error='',finished=false;const timer=setTimeout(()=>{child.kill();reject(new Error('Python parser timed out.'));},15000);
    child.stdout.on('data',b=>{output+=b.toString();if(output.length>16*1024*1024)child.kill();});child.stderr.on('data',b=>{error=(error+b.toString()).slice(-2000);});
    child.on('error',e=>{clearTimeout(timer);reject(new Error('Selected Python interpreter is unavailable.'));});
    child.on('close',code=>{clearTimeout(timer);if(finished)return;finished=true;if(code!==0)return reject(new Error('Python AST parser failed. Check the interpreter.'));try{resolve(JSON.parse(output));}catch{reject(new Error('Python parser returned invalid output.'));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(rows));
  });
}
class Architecture{
  constructor(workspace,store){this.workspace=workspace;this.store=store;this.running=false;}
  get(){return this.store.state.architectureIndexes?.[this.workspace.root()]||null;}
  async index(payload={}){
    if(this.running)throw new Error('An architecture scan is already running.');this.running=true;
    try{return await this.scan(payload);}finally{this.running=false;}
  }
  async scan(payload){
    const root=this.workspace.root(),rows=[],configs=new Map(),warnings=[];let bytes=0,truncated=false;
    const walk=async(relative='',depth=0)=>{
      if(depth>40){warnings.push('Directory depth limit reached.');return;}
      for(const entry of (await fs.readdir(this.workspace.resolve(relative,true),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
        if(entry.isSymbolicLink()||OMIT.has(entry.name))continue;
        const rel=relative?relative+'/'+entry.name:entry.name;
        if(entry.isDirectory()){await walk(rel,depth+1);continue;}
        if(!entry.isFile())continue;
        if(!SOURCE.test(entry.name)&&!['tsconfig.json','jsconfig.json','pyrightconfig.json'].includes(entry.name))continue;
        if(rows.length>=1500||bytes>=12*1024*1024){truncated=true;return;}
        try{const source=await this.workspace.read({path:rel});bytes+=Buffer.byteLength(source.content);if(SOURCE.test(entry.name))rows.push(source);else configs.set(source.path,source.content);}catch{warnings.push('Skipped unreadable or binary source: '+rel);}
      }
    };await walk();
    const files=new Set(rows.map(r=>path.resolve(root,r.path))),byPath=new Map(rows.map(r=>[r.path,r]));
    const safe=filename=>{try{return this.workspace.resolve(path.relative(root,filename),true);}catch{return null;}};
    const host={fileExists:f=>files.has(path.resolve(f)),readFile:f=>undefined,directoryExists:d=>!!safe(d),getCurrentDirectory:()=>root,realpath:f=>f};
    const optionsCache=new Map();
    const optionsFor=(rel)=>{
      let dir=path.posix.dirname(rel);
      for(;;){const prefix=dir==='.'?'':dir+'/';const key=['tsconfig.json','jsconfig.json'].map(n=>prefix+n).find(n=>configs.has(n));
        if(key){if(!optionsCache.has(key)){const parsed=ts.parseConfigFileTextToJson(key,configs.get(key));
          if(parsed.error){warnings.push('Malformed config: '+key);optionsCache.set(key,{});}
          else{if(parsed.config.extends)warnings.push('Config extends is not followed: '+key);const converted=ts.convertCompilerOptionsFromJson(parsed.config.compilerOptions||{},path.resolve(root,prefix));optionsCache.set(key,converted.options);}}
          return optionsCache.get(key);}
        if(dir==='.')break;dir=path.posix.dirname(dir);
      }return {allowJs:true,moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext};
    };
    const pythonRows=rows.filter(r=>r.language==='python');let python={},pythonStatus='not needed';
    if(pythonRows.length){
      if(payload.confirmedParser!==true){pythonStatus='unavailable';warnings.push('Python files require an explicitly approved selected interpreter.');}
      else{python=await pythonParse(pythonRows.map(r=>({path:r.path,content:r.content})),payload.pythonInterpreter||'python');pythonStatus='available';}
    }
    const pythonRoots=['','src'];const pyconfig=configs.get('pyrightconfig.json');if(pyconfig){try{const c=ts.parseConfigFileTextToJson('pyrightconfig.json',pyconfig).config;for(const rel of c?.extraPaths||[]){if(typeof rel==='string'&&!path.isAbsolute(rel)&&safe(path.resolve(root,rel)))pythonRoots.push(rel.replaceAll('\\','/'));}}catch{warnings.push('Malformed Python configuration.');}}
    const pyResolve=(source,specifier,level)=>{
      const module=specifier.replaceAll('.','/');const roots=level?[path.posix.dirname(source)]:pythonRoots;
      if(level){for(let i=1;i<level;i++)roots[0]=path.posix.dirname(roots[0]);}
      for(const prefix of roots){const stem=path.posix.normalize(path.posix.join(prefix,module));for(const candidate of [stem+'.py',stem+'/__init__.py'])if(byPath.has(candidate))return candidate;}
      return null;
    };
    const nodes=[],edges=[];
    for(const row of rows){
      const parsed=row.language==='python'?(python[row.path]||{imports:[],error:null}):jsImports(row.path,row.content);
      nodes.push({path:row.path,language:row.language,revision:row.revision,exports:parsed.exports||[],errors:parsed.error?[parsed.error]:parsed.errors||[]});
      for(const item of parsed.imports){let target=null;
        if(row.language==='python')target=item.kind==='dynamic'?null:pyResolve(row.path,item.specifier,item.level);
        else if(item.specifier!=='<dynamic>'){const resolved=ts.resolveModuleName(item.specifier,path.resolve(root,row.path),optionsFor(row.path),host).resolvedModule;const absolute=resolved&&path.resolve(resolved.resolvedFileName);if(absolute&&files.has(absolute))target=path.relative(root,absolute).replaceAll('\\','/');}
        edges.push({source:row.path,target,specifier:item.specifier,line:item.line,kind:item.kind,status:item.kind==='dynamic'?'dynamic':target?'resolved':'unresolved'});
        if(row.language==='python'&&item.kind==='from')for(const name of item.names||[]){if(name==='*')continue;const child=pyResolve(row.path,[item.specifier,name].filter(Boolean).join('.'),item.level);if(child&&child!==target)edges.push({source:row.path,target:child,specifier:[item.specifier,name].filter(Boolean).join('.'),line:item.line,kind:'from',status:'resolved'});}
      }
    }
    const observed=edges.filter(e=>e.target&&e.status==='resolved');
    for(const node of nodes){node.inbound=[...new Set(observed.filter(e=>e.target===node.path).map(e=>e.source))];node.outbound=[...new Set(observed.filter(e=>e.source===node.path).map(e=>e.target))];node.coupling=node.inbound.length+node.outbound.length;}
    const result={version:1,createdAt:new Date().toISOString(),root,nodes,edges,cycles:cycles(nodes,observed),warnings:[...new Set(warnings)],truncated,pythonStatus,scope:'Saved files only. Static workspace dependencies; unresolved/external and dynamic imports are labeled. No runtime dependency inference.'};
    result.indexHash=hash(JSON.stringify(nodes.map(n=>[n.path,n.revision])));
    if(this.workspace.root()!==root)throw new Error('Workspace changed during indexing.');
    this.store.state.architectureIndexes||={};this.store.state.architectureIndexes[root]=result;
    const keys=Object.keys(this.store.state.architectureIndexes);for(const k of keys.slice(0,Math.max(0,keys.length-5)))delete this.store.state.architectureIndexes[k];this.store.save();return result;
  }
}
module.exports={Architecture,jsImports,cycles};
