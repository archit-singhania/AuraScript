import { reveal } from './motion.js';

export async function renderArchitecture(page,{invoke,openFile,notify}){
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,run)=>{const b=el('button',text);b.type='button';b.onclick=()=>Promise.resolve(run()).catch(e=>notify(e.message));return b;};
  const heading=el('div',undefined,'page-header architecture-heading');heading.append(el('h1','Architecture explorer'),el('p','Observed imports, source relationships and dependency cycles. Indexing reads saved files; unsaved editor buffers stay untouched.'));
  const controls=el('div',undefined,'card architecture-controls'),interpreter=el('input');interpreter.placeholder='Selected Python executable';interpreter.value='python';interpreter.setAttribute('aria-label','Python parser interpreter');
  const consent=el('input');consent.type='checkbox';const label=el('label',undefined,'check-field');label.append(consent,document.createTextNode('Approve this interpreter to run AuraScript’s bundled AST parser. No workspace code is executed.'));
  const results=el('div'),status=el('p');status.setAttribute('role','status');const filter=el('input');filter.type='search';filter.placeholder='Filter files';filter.setAttribute('aria-label','Filter architecture files');let index=null,selected=null;
  const paint=()=>{
    results.replaceChildren();if(!index){results.append(el('div','No saved index yet. Run an explicit scan to inspect this workspace.','empty-card'));return;}
    const meta=el('div',undefined,'card');meta.append(el('p',index.scope),el('p',`${index.nodes.length} files · ${index.cycles.length} cycles · ${index.createdAt}`));index.warnings.forEach(w=>meta.append(el('p',w)));if(index.truncated)meta.append(el('p','Partial index: scan limits were reached.'));results.append(meta);
    const cycles=el('section',undefined,'card');cycles.append(el('h2','Strongly connected cycles'));if(!index.cycles.length)cycles.append(el('p','No static cycle was observed in this index.'));index.cycles.forEach(group=>{const row=el('div');group.forEach(p=>row.append(button(p,()=>{selected=p;paint();})));cycles.append(row);});results.append(cycles);
    const layout=el('div',undefined,'architecture-split'),list=el('section',undefined,'card'),detail=el('section',undefined,'card');list.append(el('h2','Files · inbound / outbound'));
    const query=filter.value.toLowerCase();index.nodes.filter(n=>n.path.toLowerCase().includes(query)).forEach(n=>{const b=button(`${n.path} · ${n.inbound.length} / ${n.outbound.length}`,()=>{selected=n.path;paint();});b.className='architecture-node';b.setAttribute('aria-pressed',String(n.path===selected));list.append(b);});
    const node=index.nodes.find(n=>n.path===selected);if(node){detail.append(el('h2',node.path),button('Open source',()=>openFile(node.path)),el('p','Coupling: '+node.coupling));node.errors.forEach(e=>detail.append(el('p',`Parse error at line ${e.line}: ${e.message}`)));
      for(const [title,paths] of [['Inbound',node.inbound],['Outbound',node.outbound]]){detail.append(el('h3',title));paths.forEach(p=>detail.append(button(p,()=>{selected=p;paint();})));if(!paths.length)detail.append(el('p','None observed.'));}
      detail.append(el('h3','Import observations'));index.edges.filter(e=>e.source===node.path).forEach(e=>detail.append(el('p',`${e.line}: ${e.specifier} → ${e.target||'unresolved'} · ${e.status}`)));if(node.exports.length)detail.append(el('p','Exports: '+node.exports.join(', ')));
      // Compact visual graph around the selected node, with the same keyboard-accessible relationships above.
      const graph=el('div',undefined,'architecture-graph');graph.setAttribute('aria-label','Selected file dependency diagram');const column=(title,paths)=>{const c=el('div');c.append(el('strong',title));paths.slice(0,12).forEach(p=>c.append(button(p,()=>{selected=p;paint();})));if(paths.length>12)c.append(el('small','More relationships are listed above.'));return c;};graph.append(column('Depends on this file',node.inbound),column('Selected',[node.path]),column('This file depends on',node.outbound));detail.append(graph);
    }else detail.append(el('p','Select a file or cycle node to inspect relationships.'));
    layout.append(list,detail);results.append(layout);reveal(detail);
  };
  const scan=button('Index saved workspace',async()=>{scan.disabled=true;status.textContent='Parsing saved files…';try{index=await invoke('architecture:index',{confirmedParser:consent.checked,pythonInterpreter:interpreter.value});selected=index.nodes[0]?.path;paint();status.textContent='Index saved. Re-scan after changing files.';}finally{scan.disabled=false;}});
  controls.append(interpreter,label,scan,filter,status);filter.oninput=paint;page.replaceChildren(heading,controls,results);
  try{index=await invoke('architecture:get');selected=index?.nodes[0]?.path;paint();}catch(e){status.textContent=e.message;}
}
