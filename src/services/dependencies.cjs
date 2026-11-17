'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
function parseNpm(text){
 const data=JSON.parse(text);if(![2,3].includes(data.lockfileVersion)||!data.packages)throw Error('Supported npm lock formats are package-lock/shrinkwrap versions 2 and 3.');
 const packages=[],warnings=[],all=object(data.packages),root=object(all['']),direct=new Set([...Object.keys(object(root.dependencies)),...Object.keys(object(root.devDependencies)),...Object.keys(object(root.optionalDependencies))]);
 if(Object.keys(all).length>10000)throw Error('Lockfile exceeds 10,000 package entries');
 for(const [location,entry] of Object.entries(all)){
  if(!location)continue;const value=object(entry),name=value.name||location.split('node_modules/').at(-1);
  if(value.link||typeof value.version!=='string'||!/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)){warnings.push('A workspace link or unresolved package entry was omitted.');continue;}
  packages.push({id:location,name,version:value.version,ecosystem:'npm',direct:direct.has(name)&&location==='node_modules/'+name,license:typeof value.license==='string'?value.license:'Unknown',dependencies:[],unresolved:[],declared: {...object(value.dependencies),...object(value.optionalDependencies)}});
 }
 const locations=new Set(packages.map(p=>p.id));
 for(const p of packages){for(const name of Object.keys(p.declared)){let base=p.id,target=null;while(true){const candidate=(base?base+'/':'')+'node_modules/'+name;if(locations.has(candidate)){target=candidate;break;}if(!base)break;const cut=base.lastIndexOf('/node_modules/');base=cut>=0?base.slice(0,cut):'';}if(target)p.dependencies.push(target);else p.unresolved.push(name);}delete p.declared;}
 return {packages,warnings:[...new Set(warnings)],coverage:'Lockfile declarations only; peer dependencies and runtime loading are not fully resolved.'};
}
function parseRequirements(text){
 const packages=[],warnings=[];const lines=text.split(/\r?\n/);if(lines.length>20000)throw Error('Requirements file exceeds 20,000 lines');
 lines.forEach((line,i)=>{line=line.trim();if(!line||line.startsWith('#'))return;const match=line.match(/^([a-z0-9][a-z0-9_.-]*)(?:\[[a-z0-9_,.-]+\])?==([a-z0-9][a-z0-9.!+_-]*)(?:\s*;([^#]+))?(?:\s+#.*)?$/i);if(!match){warnings.push(`Line ${i+1}: unsupported/unpinned requirement omitted; includes, URLs and install options are not executed.`);return;}packages.push({id:match[1].toLowerCase().replace(/[-_.]+/g,'-'),name:match[1],version:match[2],ecosystem:'PyPI',direct:null,license:'Unknown',dependencies:[],unresolved:[],condition:match[3]?.trim()||null});});
 if(new Set(packages.map(p=>p.id)).size!==packages.length)warnings.push('Duplicate requirement names exist; comparison keeps the last declaration.');
 return {packages,warnings,coverage:'Pinned declarations only. Transitive dependencies, licenses and environment-marker eligibility are unknown; no resolver runs.'};
}
function compare(before,after){const a=new Map(before.packages.map(p=>[p.id,p])),b=new Map(after.packages.map(p=>[p.id,p]));return [...new Set([...a.keys(),...b.keys()])].flatMap(id=>{const old=a.get(id),next=b.get(id);if(!old)return [{id,kind:'added',after:next}];if(!next)return [{id,kind:'removed',before:old}];if(old.version!==next.version||old.license!==next.license||JSON.stringify(old.dependencies)!==JSON.stringify(next.dependencies))return [{id,kind:'changed',before:old,after:next}];return [];});}
class Dependencies{
 constructor(workspace,store,fetcher=fetch){this.workspace=workspace;this.store=store;this.fetcher=fetcher;store.state.dependencySnapshots||={};store.state.advisories||={};}
 list(){return this.store.state.dependencySnapshots[this.workspace.root()]||[];}
 inspect({path:filename}){const full=this.workspace.resolve(filename),stat=fs.statSync(full);if(!stat.isFile()||stat.size>4*1024*1024)throw Error('Choose a dependency file smaller than 4 MB');const name=path.basename(filename);const text=fs.readFileSync(full,'utf8');let parsed;if(['package-lock.json','npm-shrinkwrap.json'].includes(name))parsed=parseNpm(text);else if(/^requirements[^/]*\.txt$/i.test(name))parsed=parseRequirements(text);else throw Error('Choose package-lock.json, npm-shrinkwrap.json or requirements*.txt');const row={id:crypto.randomUUID(),path:filename,hash:digest(text),createdAt:new Date().toISOString(),...parsed};const prior=this.list().find(r=>r.path===filename);row.changes=prior?compare(prior,row):[];row.comparedTo=prior?.id||null;this.store.state.dependencySnapshots[this.workspace.root()]=[row,...this.list()].slice(0,20);this.store.save();return row;}
 cached(){const out={};for(const p of this.list()[0]?.packages||[]){const key=this.key(p);if(this.store.state.advisories[key])out[p.id]=this.store.state.advisories[key];}return out;}
 key(p){return `${p.ecosystem}/${p.name.toLowerCase()}/${p.version}`;}
 async lookup(p){
  if(p.confirmed!==true)throw Error('Approve sending selected package names and versions to OSV.');
  const latest=this.list()[0];if(!latest||latest.id!==p.snapshotId)throw Error('Dependency snapshot changed; review the latest snapshot.');
  if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>100)throw Error('Select 1–100 package entries');const selected=p.ids.map(id=>{const row=latest.packages.find(x=>x.id===id);if(!row)throw Error('Package is absent from this snapshot');return row;});
  const checkedAt=new Date().toISOString();let results;
  try{const response=await this.fetcher('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries:selected.map(x=>({package:{name:x.name,ecosystem:x.ecosystem},version:x.version}))}),signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw Error('Advisory service HTTP '+response.status);const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('Advisory response exceeds 2 MB');chunks.push(Buffer.from(chunk));}results=JSON.parse(Buffer.concat(chunks).toString('utf8')).results;if(!Array.isArray(results)||results.length!==selected.length||results.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Unexpected advisory response');}
  catch(e){for(const row of selected){const prior=this.store.state.advisories[this.key(row)];this.store.state.advisories[this.key(row)]={...prior,lastAttempt:checkedAt,error:e.message,status:prior?.checkedAt?'cached · latest lookup failed':'unavailable'};}this.store.save();return this.cached();}
  selected.forEach((row,i)=>{const result=results[i];const ids=Array.isArray(result.vulns)?result.vulns.map(v=>v.id).filter(id=>typeof id==='string').slice(0,1000):[];this.store.state.advisories[this.key(row)]={checkedAt,lastAttempt:checkedAt,status:result.next_page_token?'partial':'queried',ids,coverage:result.next_page_token?'More results available; this response is partial.':'No returned advisory is not proof of safety.'};});this.store.save();return this.cached();
 }
}
module.exports={Dependencies,parseNpm,parseRequirements,compare};
