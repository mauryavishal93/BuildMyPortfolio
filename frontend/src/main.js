(()=>{'use strict';
const $=id=>document.getElementById(id),deep=x=>JSON.parse(JSON.stringify(x)),uid=()=>Math.random().toString(36).slice(2,10);
const clamp=(v,min,max,def)=>{v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):def};
const PAGE_W=794,PAGE_H=1122,DEFAULT_MARGIN=32,FONTS=['Arial','Georgia','Verdana','Trebuchet MS','Times New Roman','Courier New'];
const KNOWN_TYPES=['summary','experience','education','skills','projects','certifications','custom'];
const templateDefs=[
{id:'classic',name:'Classic',sub:'ATS-friendly',accent:'#31547a',cls:'layout-classic',layout:'single'},
{id:'modern',name:'Modern',sub:'Two-column',accent:'#344b67',cls:'layout-modern',layout:'two',banner:true},
{id:'minimal',name:'Minimal',sub:'Clean type',accent:'#202a3a',cls:'layout-minimal',layout:'single'},
{id:'creative',name:'Creative',sub:'Color accents',accent:'#6b4eff',cls:'layout-creative',layout:'single'},
{id:'compact',name:'Compact',sub:'Space-saving',accent:'#2c5260',cls:'layout-compact',layout:'single'},
{id:'elegant',name:'Elegant',sub:'Editorial',accent:'#7a5947',cls:'layout-elegant',layout:'single'},
{id:'tech',name:'Tech',sub:'Engineering',accent:'#166b73',cls:'layout-tech',layout:'single'},
{id:'executive',name:'Executive',sub:'Leadership',accent:'#27364d',cls:'layout-executive',layout:'single'},
{id:'photo',name:'Photo Sidebar',sub:'Portrait layout',accent:'#215e69',cls:'layout-photo',layout:'two',banner:true,photo:true,photoPos:'right'},
{id:'timeline',name:'Timeline',sub:'Career milestones',accent:'#8b4b37',cls:'layout-timeline',layout:'single'},
{id:'pastel',name:'Soft Pastel',sub:'Warm palette',accent:'#9b5878',cls:'layout-pastel',layout:'single',banner:true},
{id:'bold',name:'Bold Split',sub:'High contrast',accent:'#b45309',cls:'layout-bold',layout:'two',banner:true},
{id:'student',name:'Graduate',sub:'Early career',accent:'#18756d',cls:'layout-student',layout:'single'},
{id:'portrait',name:'Portrait Left',sub:'Photo + rule',accent:'#2f4a7a',cls:'layout-portrait',layout:'single',photo:true,photoPos:'left'},
{id:'card',name:'Centered Card',sub:'Photo on top',accent:'#6a4c7d',cls:'layout-card',layout:'single',photo:true,photoPos:'center'},
{id:'photobanner',name:'Photo Banner',sub:'Banner + photo',accent:'#1f5d73',cls:'layout-photobanner',layout:'two',banner:true,photo:true,photoPos:'right'},
{id:'studio',name:'Studio',sub:'Serif + frame',accent:'#8a4b2d',cls:'layout-studio',layout:'single',banner:true,photo:true,photoPos:'right'}
];
const makeSections=()=>[
{id:uid(),type:'summary',title:'Professional Summary',visible:true,content:'Quality Engineering professional with experience in test automation, scalable test frameworks, and delivering reliable software. Skilled at collaborating across teams to improve product quality and release confidence.'},
{id:uid(),type:'experience',title:'Work Experience',visible:true,entries:[{role:'Senior QA Automation Engineer',company:'Example Technology Company',date:'2022 — Present',details:'Designed and maintained scalable UI and API automation suites.\nImproved regression reliability and reduced repetitive manual effort.\nCollaborated with developers and product teams to resolve release risks.'},{role:'QA Engineer',company:'Previous Company',date:'2019 — 2022',details:'Built automated tests and reusable test utilities.\nReported defects with clear reproduction steps and impact analysis.'}]},
{id:uid(),type:'skills',title:'Technical Skills',visible:true,content:'Playwright, Selenium, JavaScript, TypeScript, API Testing, CI/CD, SQL, Git, Test Strategy'},
{id:uid(),type:'education',title:'Education',visible:true,entries:[{role:'Bachelor of Engineering',company:'University Name',date:'2015 — 2019',details:'Relevant coursework, projects or academic achievements.'}]},
{id:uid(),type:'projects',title:'Selected Projects',visible:true,entries:[{role:'Automation Framework Modernization',company:'Personal / Professional Project',date:'2024',details:'Created reusable automation components and reporting workflows.\nIntegrated test execution into a repeatable CI process.'}]},
{id:uid(),type:'certifications',title:'Certifications',visible:true,content:'Add relevant certifications, courses, or professional training.'}
];
const fresh=()=>({version:3,docName:'Untitled resume',template:'classic',layout:'single',mode:'flow',profile:{name:'Vishal Maurya',headline:'QA Automation Engineer',email:'mauryavishal93@gmail.com',phone:'+91 98765 43210',location:'Bengaluru, India',website:'linkedin.com/in/vimaurya/',photo:''},design:{accent:'#31547a',font:'Arial',fontSize:12,headingSize:15,margin:DEFAULT_MARGIN,marginY:DEFAULT_MARGIN,pageNumbers:true,headerAlign:'',photoAlign:''},sections:makeSections(),positions:{}});
const str=v=>typeof v==='string'?v:'';
/* Validates + upgrades any project (import or autosave). Throws on files that are not projects. */
function normalizeState(d){
 if(!d||typeof d!=='object'||!d.profile||typeof d.profile!=='object'||!Array.isArray(d.sections)||!d.design||typeof d.design!=='object')throw Error('This is not a valid BuildMyPortfolio project.');
 const base=fresh(),ver=Number(d.version)||1,out={...base,version:3};
 out.docName=str(d.docName).trim()?str(d.docName).slice(0,120):base.docName;
 out.template=templateDefs.some(t=>t.id===d.template)?d.template:base.template;
 out.layout=d.layout==='two'?'two':'single';out.mode=d.mode==='free'?'free':'flow';
 out.profile={...base.profile};for(const k of Object.keys(base.profile))if(typeof d.profile[k]==='string')out.profile[k]=d.profile[k];
 if(out.profile.photo&&!/^data:image\//.test(out.profile.photo))out.profile.photo='';
 const ds=d.design;let mx=clamp(ds.margin,0,100,DEFAULT_MARGIN),my=clamp(ds.marginY!==undefined?ds.marginY:ds.margin,0,100,DEFAULT_MARGIN);
 if(ver<3){if(mx===56)mx=DEFAULT_MARGIN;if(my===56)my=DEFAULT_MARGIN}   /* old 56px default -> new tighter default */
 out.design={accent:/^#[0-9a-f]{6}$/i.test(str(ds.accent))?ds.accent:base.design.accent,font:FONTS.includes(ds.font)?ds.font:'Arial',fontSize:clamp(ds.fontSize,8,24,12),headingSize:clamp(ds.headingSize,10,28,15),margin:mx,marginY:my,pageNumbers:ds.pageNumbers!==false,headerAlign:['left','center','right'].includes(ds.headerAlign)?ds.headerAlign:'',photoAlign:['left','center','right'].includes(ds.photoAlign)?ds.photoAlign:''};
 const seen=new Set();
 out.sections=d.sections.filter(s=>s&&typeof s==='object').map(s=>{
  const type=KNOWN_TYPES.includes(s.type)?s.type:'custom';let id=str(s.id)||uid();while(seen.has(id))id=uid();seen.add(id);
  const n={id,type,title:str(s.title).trim()?str(s.title):'Untitled section',visible:s.visible!==false};
  if(['experience','education','projects'].includes(type)||Array.isArray(s.entries))n.entries=(Array.isArray(s.entries)?s.entries:[]).filter(e=>e&&typeof e==='object').map(e=>({role:str(e.role),company:str(e.company),date:str(e.date),details:str(e.details)}));
  else n.content=str(s.content);
  return n});
 out.positions={};const pos=d.positions||d.freePositions;
 if(pos&&typeof pos==='object')for(const [k,p] of Object.entries(pos)){if(!seen.has(k)||!p||typeof p!=='object')continue;const x=Number(p.x),y=Number(p.y),w=Number(p.w);if(![x,y,w].every(Number.isFinite))continue;if(ver<3&&x===0&&w===610)continue;out.positions[k]={x:clamp(x,0,PAGE_W,0),y:clamp(y,0,PAGE_H,0),w:clamp(w,120,PAGE_W,610)}}
 return out;
}
let state=fresh(),selectedId=null,zoom=1,history=[],draggingId=null,saveTimer=null,panelWidth=300,collapsed=false,leftWidth=260,leftCollapsed=false,leftTab='templates',rightTab='design';
const $esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=v=>String(v||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2300)}
function saveLocal(){ $('saveState').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('resumeStudioV2',JSON.stringify(state));$('saveState').textContent='Saved in this browser'}catch(e){$('saveState').textContent='Local save unavailable'}},250)}
function transact(fn){history.push(deep(state));if(history.length>50)history.shift();fn();render();saveLocal()}
function undo(){if(!history.length){toast('Nothing to undo');return}state=history.pop();if(!state.sections.some(s=>s.id===selectedId))selectedId=null;render();saveLocal();toast('Undo complete')}
function activeTemplate(){return templateDefs.find(t=>t.id===state.template)||templateDefs[0]}
function sectionById(id){return state.sections.find(s=>s.id===id)}
function websiteHref(value){
 const raw=String(value||'').trim();if(!raw)return '';
 try{const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}
}
function renderTemplates(){
 $('templates').innerHTML=templateDefs.map(t=>`<button class="template ${state.template===t.id?'active':''}" data-template="${t.id}" aria-pressed="${state.template===t.id}"><div class="mini" style="background:${t.id==='pastel'?'#fbf1f6':t.id==='bold'?'#fff7ed':'#f8f9fc'}">${t.photo&&t.id!=='photo'?`<span class="mini-photo" style="${t.photoPos==='left'?'left':'right'}:${t.photoPos==='center'?'calc(50% - 7px)':'8px'};${t.photoPos==='center'?'left:calc(50% - 7px);right:auto':''}"></span>`:''}<div class="mini-main">${t.layout==='two'?`<div style="float:left;width:30%;height:100%;background:${t.accent};margin-right:5px">${t.id==='photo'?'<div style="width:16px;height:16px;border-radius:50%;background:#eee;margin:8px auto"></div>':''}</div>`:''}<div class="mini-head" style="background:${t.accent}"></div><div class="mini-line" style="width:85%"></div><div class="mini-line" style="width:68%"></div><div class="mini-head" style="height:6px;width:60%;margin-top:10px;background:${t.accent}"></div><div class="mini-line"></div><div class="mini-line" style="width:75%"></div></div></div><strong>${t.name}</strong><small>${t.sub}</small></button>`).join('');
}
function renderSectionList(){
 $('sectionList').innerHTML=state.sections.map(s=>`<div class="section-row ${s.id===selectedId?'active':''}" draggable="true" data-section-row="${s.id}"><span class="grip">⠿</span><span class="sect-name">${$esc(s.title)}</span><button class="vis" data-toggle="${s.id}" title="${s.visible?'Hide':'Show'} section">${s.visible?'◉':'○'}</button></div>`).join('');
}

/* ---------- Sheet construction ---------- */
function sheetHTML(index,cols){
 const p=state.profile,tmpl=activeTemplate();
 const hasPhoto=!!(p.photo&&tmpl.photo),photoPos=['left','center','right'].includes(state.design.photoAlign)?state.design.photoAlign:(tmpl.photoPos||'right');
 const contact=[p.email?`<a href="mailto:${$esc(p.email)}">${$esc(p.email)}</a>`:'',p.phone,p.location,p.website?(websiteHref(p.website)?`<a href="${$esc(websiteHref(p.website))}" target="_blank" rel="noopener noreferrer">${$esc(p.website)}</a>`:$esc(p.website)):''].filter(Boolean).join(' · ');
 const head=index===0?`<header class="resume-header${hasPhoto?' has-photo':''}"${hasPhoto?` data-photo-pos="${photoPos}"`:''}>${hasPhoto?`<img class="photo" src="${$esc(p.photo)}" alt="Profile photo">`:''}<div class="header-text"><h1 class="name">${$esc(p.name||'Your Name')}</h1><div class="headline">${$esc(p.headline||'Professional Title')}</div><div class="contact">${contact}</div></div></header>`:`<div class="continuation">${$esc(p.name||'Resume')} · Continued</div>`;
 return `<div class="sheet-inner">${head}<div class="sections-area">${cols?'<div class="section-columns"><div class="section-column"></div><div class="section-column"></div></div>':''}</div></div><div class="page-number"></div>`;
}
function createSheet(index,tmpl,cols){
 const d=state.design,el=document.createElement('article'),set=(k,v)=>el.style.setProperty(k,v);
 el.className=`sheet ${tmpl.cls}`;el.dataset.page=String(index+1);
 set('--resume-accent',d.accent||tmpl.accent);set('--resume-font',d.font||'Arial');
 set('--resume-size',clamp(d.fontSize,8,24,12)+'px');set('--resume-heading',clamp(d.headingSize,10,28,15)+'px');
 set('--mx',clamp(d.margin,0,100,DEFAULT_MARGIN)+'px');set('--mt',clamp(d.marginY,0,100,DEFAULT_MARGIN)+'px');set('--mb',clamp(d.marginY,0,100,DEFAULT_MARGIN)+'px');
 el.dataset.halign=['left','center','right'].includes(d.headerAlign)?d.headerAlign:'';set('--page-no-h',d.pageNumbers?'26px':'0px');set('--area-pt',(tmpl.banner&&index===0)?'16px':'0px');
 el.innerHTML=sheetHTML(index,cols);return el;
}

/* ---------- Content is split into small "atoms" so pages/columns can be filled precisely ---------- */
function splitLongLine(text,limit){
 const words=String(text||'').split(/\s+/).filter(Boolean),out=[];let part='';
 for(const w of words){if(!part)part=w;else if((part+' '+w).length<=limit)part+=' '+w;else{out.push(part);part=w}}
 if(part)out.push(part);return out.length?out:[''];
}
function splitParagraph(text,max=320){
 if(text.length<=max)return [text];
 const sentences=text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)||[text],out=[];let cur='';
 for(const s of sentences){if(cur&&(cur+s).length>max){out.push(cur.trim());cur=s}else cur+=s}
 if(cur.trim())out.push(cur.trim());
 return out.flatMap(p=>p.length>max*2?splitLongLine(p,max):[p]);
}
function sectionAtoms(s){
 const a=[];
 if(s.entries){for(const e of s.entries){const ls=lines(e.details);a.push({k:'entry',e,first:ls[0]});ls.slice(1).forEach(t=>a.push({k:'li',e,t}))}}
 else if(s.type==='skills')String(s.content||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean).forEach(t=>a.push({k:'chip',t}));
 else lines(s.content).forEach(par=>splitParagraph(par).forEach((t,i)=>a.push({k:'p',t,cont:i>0})));
 if(!a.length)a.push({k:'p',t:'',cont:false});
 return a;
}
function makeShell(s,cont){
 const sec=document.createElement('section');sec.className='resume-section'+(selectedId===s.id?' selected':'');sec.dataset.resumeSection=s.id;
 sec.innerHTML=`<h2 class="section-heading">${$esc(s.title)}${cont?' <span class="cont-tag">(continued)</span>':''}</h2><div class="section-body"></div>`;return sec;
}
/* Appends one atom and returns the element it created (so a failed fit can be undone). */
function appendAtom(shell,a,st){
 const body=shell.lastElementChild;let el;
 if(a.k==='entry'){
  el=document.createElement('div');el.className='entry';
  el.innerHTML=`<div class="entry-top"><span class="entry-title">${$esc(a.cont?a.e.role+' (continued)':a.e.role)}</span>${a.cont?'':`<span class="entry-date">${$esc(a.e.date)}</span>`}</div>${!a.cont&&a.e.company?`<div class="entry-sub">${$esc(a.e.company)}</div>`:''}${a.first?`<ul><li>${$esc(a.first)}</li></ul>`:''}`;
  body.appendChild(el);st.ul=el.querySelector('ul');
 }else if(a.k==='li'){
  if(!st.ul){const last=body.lastElementChild;st.ul=document.createElement('ul');(last||body).appendChild(st.ul)}
  el=document.createElement('li');el.textContent=a.t;st.ul.appendChild(el);
 }else if(a.k==='chip'){
  let l=body.querySelector('.skill-list');if(!l){l=document.createElement('div');l.className='skill-list';body.appendChild(l)}
  el=document.createElement('span');el.className='skill';el.textContent=a.t;l.appendChild(el);
 }else{el=document.createElement('p');if(a.cont)el.className='cont';el.textContent=a.t;body.appendChild(el)}
 return el;
}
function renderWhole(s){const shell=makeShell(s,false),st={};sectionAtoms(s).forEach(a=>appendAtom(shell,a,st));return shell}

/* ---------- Structured (flow) layout ----------
   Single column: one stream of content.  Two columns: two independent streams (wide / narrow),
   each filled top-to-bottom and continued on the next page. A section goes to its preferred column,
   then the other column, and only then to a new page. Everything is measured, never estimated. */
const MAIN_TYPES=new Set(['summary','experience']),SIDE_TYPES=new Set(['skills','education','certifications']);
function flowSections(root,tmpl){
 const two=state.layout==='two',pages=[],streams=Array.from({length:two?2:1},()=>({page:0}));
 const addPage=()=>{const p=createSheet(pages.length,tmpl,two);root.appendChild(p);pages.push(p);return p};
 addPage();
 const colOf=(si,pi)=>two?pages[pi].querySelectorAll('.section-column')[si]:pages[pi].querySelector('.sections-area');
 const limitOf=pi=>{const a=pages[pi].querySelector('.sections-area');return a.getBoundingClientRect().bottom-parseFloat(getComputedStyle(a).paddingBottom)};
 const fits=(si,pi)=>{const l=colOf(si,pi).lastElementChild;return !l||l.getBoundingClientRect().bottom<=limitOf(pi)+.5};
 const fill=si=>{const st=streams[si],c=colOf(si,st.page),l=c.lastElementChild;return st.page*10000+(l?l.getBoundingClientRect().bottom-c.getBoundingClientRect().top:0)};
 const attempt=(si,pi,s,cont,first,force)=>{
  const shell=makeShell(s,cont),st={};colOf(si,pi).appendChild(shell);appendAtom(shell,first,st);
  if(fits(si,pi)||force)return {si,pi,shell,st};
  shell.remove();return null;
 };
 for(const s of state.sections.filter(x=>x.visible)){
  const atoms=sectionAtoms(s);let i=0,cont=false,cur=null,lastSi=0;
  const pref=!two?0:MAIN_TYPES.has(s.type)?0:SIDE_TYPES.has(s.type)?1:(fill(0)<=fill(1)?0:1);
  while(i<atoms.length){
   const a=atoms[i];
   if(cur){
    const el=appendAtom(cur.shell,a,cur.st);
    if(fits(cur.si,cur.pi)){i++;continue}
    el.remove();lastSi=cur.si;cur=null;cont=true;
   }
   const first=a.k==='li'?{k:'entry',e:a.e,first:a.t,cont:true}:a;
   let placed=null;
   if(!cont){
    const order=two?[pref,1-pref]:[0];
    for(const si of order){placed=attempt(si,streams[si].page,s,false,first,false);if(placed)break}
    lastSi=pref;
   }
   if(!placed){
    const si=lastSi;streams[si].page++;if(streams[si].page>=pages.length)addPage();
    placed=attempt(si,streams[si].page,s,cont,first,true);   /* forced: a single block taller than a page is kept, never dropped */
   }
   cur=placed;i++;
  }
 }
}
function renderFree(root,tmpl){
 const page=createSheet(0,tmpl,false);root.appendChild(page);
 const area=page.querySelector('.sections-area'),mx=clamp(state.design.margin,0,100,DEFAULT_MARGIN),defW=PAGE_W-2*mx;
 let cursor=area.offsetTop+parseFloat(getComputedStyle(area).paddingTop);
 state.sections.filter(s=>s.visible).forEach(s=>{
  const node=renderWhole(s),pos=state.positions[s.id];
  node.style.cssText+=`;position:absolute;margin:0;z-index:2;left:${pos?pos.x:mx}px;top:${pos?pos.y:cursor}px;width:${pos?pos.w:defW}px`;
  area.appendChild(node);
  if(!pos){state.positions[s.id]={x:mx,y:cursor,w:defW};cursor+=node.offsetHeight+14}
 });
}
function renderSheets(){
 const root=$('sheets'),tmpl=activeTemplate();root.innerHTML='';
 if(state.mode==='free')renderFree(root,tmpl);else flowSections(root,tmpl);
 const all=[...root.querySelectorAll('.sheet')];
 all.forEach((sh,i)=>{
  sh.querySelector('.page-number').textContent=state.design.pageNumbers?`Page ${i+1} of ${all.length}`:'';
  sh.style.transform=zoom===1?'':`scale(${zoom})`;sh.style.marginBottom=zoom===1?'':((zoom-1)*PAGE_H)+'px';
 });
 $('hint').textContent=state.mode==='free'?'Free position mode: drag sections on the sheet. Pagination is manual in this mode.':all.length>1?`${all.length} A4 pages · page breaks shown between sheets`:'A4 sheet · select any section to edit';
 $('zoomLabel').textContent=Math.round(zoom*100)+'%';
}

/* ---------- Inspector ---------- */
function field(label,key,value,type='text',extra=''){return `<div class="field"><label>${label}</label><input data-profile="${key}" type="${type}" value="${$esc(value)}" ${extra}></div>`}
function renderInspector(){
 const s=sectionById(selectedId),d=state.design,tmplHasPhoto=!!activeTemplate().photo;let h=`<div class="inspector-head"><h2>Design & properties</h2><button class="size-btn" data-panel-size="-24" title="Decrease panel width">−</button><button class="size-btn" data-panel-size="24" title="Increase panel width">＋</button><button class="size-btn" id="collapsePanel" title="Collapse / expand">⇥</button></div>
 <div class="tabs rtabs" role="tablist" aria-label="Properties"><button class="tab ${rightTab==='design'?'active':''}" role="tab" aria-selected="${rightTab==='design'}" data-rtab="design">Design & properties</button><button class="tab ${rightTab==='section'?'active':''}" role="tab" aria-selected="${rightTab==='section'}" data-rtab="section">Selected section</button></div>
 ${rightTab==='design'?`<div class="field"><label>Name & header alignment</label><div class="seg" role="group" aria-label="Header alignment">${[['','Template'],['left','Left'],['center','Center'],['right','Right']].map(([v,l])=>`<button type="button" data-halign="${v}" class="${(d.headerAlign||'')===v?'active':''}" aria-pressed="${(d.headerAlign||'')===v}">${l}</button>`).join('')}</div></div>
 <div class="rule"></div>
 <div class="eyebrow">Profile</div>
 <div class="field"><label>Full name</label><input data-profile="name" value="${$esc(state.profile.name)}"></div>
 <div class="field"><label>Professional title</label><input data-profile="headline" value="${$esc(state.profile.headline)}"></div>
 <div class="field-row">${field('Email','email',state.profile.email,'email')}${field('Phone','phone',state.profile.phone)}</div>
 <div class="field"><label>Location</label><input data-profile="location" value="${$esc(state.profile.location)}"></div>
 <div class="field"><label>Website / LinkedIn</label><input data-profile="website" value="${$esc(state.profile.website)}"></div>
 <div class="field"><label>Profile photo ${tmplHasPhoto?'':'(this template has no photo slot — pick a photo template)'}</label><input id="photoInput" type="file" accept="image/*"></div>${state.profile.photo?'<button class="btn soft small" id="removePhoto">Remove photo</button>':''}
 <div class="field" style="margin-top:12px"><label>Photo position</label><div class="seg" role="group" aria-label="Photo position">${[['','Template'],['left','Left'],['center','Center'],['right','Right']].map(([v,l])=>`<button type="button" data-palign="${v}" class="${(d.photoAlign||'')===v?'active':''}" aria-pressed="${(d.photoAlign||'')===v}">${l}</button>`).join('')}</div></div>
 <div class="rule"></div><div class="eyebrow">Global design</div>
 <div class="field-row"><div class="field"><label>Accent color</label><input data-design="accent" type="color" value="${$esc(d.accent)}"></div><div class="field"><label>Font</label><select data-design="font">${FONTS.map(f=>`<option ${d.font===f?'selected':''}>${f}</option>`).join('')}</select></div></div>
 <div class="field-row"><div class="field"><label>Body size (px)</label><input data-design="fontSize" type="number" min="8" max="24" value="${d.fontSize}"></div><div class="field"><label>Heading size (px)</label><input data-design="headingSize" type="number" min="10" max="28" value="${d.headingSize}"></div></div>
 <div class="field-row"><div class="field"><label>Left/right margin (px)</label><input data-design="margin" type="number" min="0" max="100" value="${d.margin}"></div><div class="field"><label>Top/bottom margin (px)</label><input data-design="marginY" type="number" min="0" max="100" value="${d.marginY}"></div></div>
 <div class="field"><label><input type="checkbox" data-design="pageNumbers" ${d.pageNumbers?'checked':''}>Show page numbers (reserves a small footer)</label></div>
 <div class="small-note">Page size is A4 (210 × 297 mm). The same margins drive the preview, print and PDF. Your draft is saved in this browser. Export JSON for a backup.</div>`:''}`;
 if(rightTab==='section'&&s){
   h+=`<div class="eyebrow">Selected section</div><div class="field"><label>Section title</label><input id="sectionTitle" value="${$esc(s.title)}"></div>`;
   if(s.entries){
     h+=s.entries.map((e,i)=>`<div style="border:1px solid var(--line);border-radius:8px;padding:9px;margin-bottom:9px"><b style="font-size:11px">Entry ${i+1}</b><div class="field"><label>Role / qualification</label><input data-entry="role" data-index="${i}" value="${$esc(e.role)}"></div><div class="field"><label>Company / institution</label><input data-entry="company" data-index="${i}" value="${$esc(e.company)}"></div><div class="field"><label>Date</label><input data-entry="date" data-index="${i}" value="${$esc(e.date)}"></div><div class="field"><label>Details (one bullet per line)</label><textarea data-entry="details" data-index="${i}">${$esc(e.details)}</textarea></div><button class="btn danger small" data-remove-entry="${i}">Remove entry</button></div>`).join('');
     h+='<button class="btn outline small" id="addEntry">＋ Add entry</button>';
   }else h+=`<div class="field"><label>Content (use new lines for paragraphs; comma-separated skills work too)</label><textarea id="sectionContent">${$esc(s.content||'')}</textarea></div>`;
   h+='<div class="field-row" style="margin-top:12px"><button class="btn outline small" id="duplicateSection">Duplicate section</button><button class="btn danger small" id="deleteSection">Delete section</button></div>';
 }else if(rightTab==='section')h+='<div class="small-note">Choose a section in the list or click a section on the resume to edit its content.</div>';
 $('inspector').innerHTML=h;
 $('inspector').querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('change',()=>transact(()=>state.profile[el.dataset.profile]=el.value)));
 $('inspector').querySelectorAll('[data-design]').forEach(el=>el.addEventListener('change',()=>{
  const k=el.dataset.design;let v;
  if(el.type==='checkbox')v=el.checked;
  else if(el.type==='number'){v=Number(el.value);if(el.value===''||!Number.isFinite(v)){renderInspector();return}v=clamp(v,Number(el.min),Number(el.max),state.design[k])}
  else v=el.value;
  transact(()=>{state.design[k]=v});
 }));
 const photo=$('photoInput');photo?.addEventListener('change',()=>{const f=photo.files&&photo.files[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>8*1024*1024){toast('Choose an image under 8 MB');return}const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const scale=Math.min(1,500/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,im.width*scale);c.height=Math.max(1,im.height*scale);c.getContext('2d').drawImage(im,0,0,c.width,c.height);transact(()=>state.profile.photo=c.toDataURL('image/jpeg',.84))};im.onerror=()=>toast('That image could not be read');im.src=String(r.result)};r.readAsDataURL(f)});
 $('removePhoto')?.addEventListener('click',()=>transact(()=>state.profile.photo=''));
 $('sectionTitle')?.addEventListener('change',e=>transact(()=>{const x=sectionById(selectedId);if(x)x.title=e.target.value.trim()||'Untitled section'}));
 $('sectionContent')?.addEventListener('change',e=>transact(()=>{const x=sectionById(selectedId);if(x)x.content=e.target.value}));
 $('inspector').querySelectorAll('[data-entry]').forEach(el=>el.addEventListener('change',()=>transact(()=>{const x=sectionById(selectedId);if(x&&x.entries[+el.dataset.index])x.entries[+el.dataset.index][el.dataset.entry]=el.value})));
 $('inspector').querySelectorAll('[data-remove-entry]').forEach(el=>el.addEventListener('click',()=>transact(()=>{const x=sectionById(selectedId);if(x)x.entries.splice(+el.dataset.removeEntry,1)})));
 $('addEntry')?.addEventListener('click',()=>transact(()=>{const x=sectionById(selectedId);if(x)x.entries.push({role:'New role',company:'Organization',date:'Year',details:'Add details here.'})}));
 $('duplicateSection')?.addEventListener('click',()=>transact(()=>{const i=state.sections.findIndex(x=>x.id===selectedId);if(i>=0){const n=deep(state.sections[i]);n.id=uid();n.title+=' (copy)';state.sections.splice(i+1,0,n);selectedId=n.id}}));
 $('deleteSection')?.addEventListener('click',()=>{if(confirm('Delete this section?'))transact(()=>{state.sections=state.sections.filter(x=>x.id!==selectedId);delete state.positions[selectedId];selectedId=null})});
 $('inspector').querySelectorAll('[data-panel-size]').forEach(b=>b.addEventListener('click',()=>resizePanel(+b.dataset.panelSize)));
 $('collapsePanel')?.addEventListener('click',togglePanel);
 $('inspector').querySelectorAll('[data-rtab]').forEach(b=>b.addEventListener('click',()=>setRightTab(b.dataset.rtab)));
 $('inspector').querySelectorAll('[data-palign]').forEach(b=>b.addEventListener('click',()=>transact(()=>{state.design.photoAlign=b.dataset.palign})));
 $('inspector').querySelectorAll('[data-halign]').forEach(b=>b.addEventListener('click',()=>transact(()=>{state.design.headerAlign=b.dataset.halign})));
}
const LW=[200,420],RW=[235,480];
function applyPanels(){const L=$('layout'),r=document.documentElement.style;L.classList.toggle('collapsed-l',leftCollapsed);L.classList.toggle('collapsed-r',collapsed);r.setProperty('--lw',(leftCollapsed?36:leftWidth)+'px');r.setProperty('--rw',(collapsed?36:panelWidth)+'px');
 const cl=$('collapseLeft');if(cl)cl.textContent=leftCollapsed?'⇥':'⇤'}
function resizePanel(delta){collapsed=false;panelWidth=Math.max(RW[0],Math.min(RW[1],panelWidth+delta));applyPanels();savePrefs()}
function togglePanel(){collapsed=!collapsed;applyPanels();savePrefs()}
function toggleLeft(){leftCollapsed=!leftCollapsed;applyPanels();savePrefs()}
function setTab(t){leftTab=t==='sections'?'sections':'templates';leftCollapsed=false;for(const k of ['templates','sections']){const on=k===leftTab;$('pane'+k[0].toUpperCase()+k.slice(1)).hidden=!on;const b=$('tab'+k[0].toUpperCase()+k.slice(1));b.classList.toggle('active',on);b.setAttribute('aria-selected',on)}applyPanels();savePrefs()}
function setRightTab(t){rightTab=t==='section'?'section':'design';renderInspector();savePrefs()}
function savePrefs(){try{localStorage.setItem('resumeStudioUI',JSON.stringify({leftWidth,panelWidth,leftCollapsed,collapsed,leftTab,rightTab}))}catch(e){}}
function loadPrefs(){try{const u=JSON.parse(localStorage.getItem('resumeStudioUI')||'null');if(u){leftWidth=clamp(u.leftWidth,LW[0],LW[1],260);panelWidth=clamp(u.panelWidth,RW[0],RW[1],300);leftCollapsed=!!u.leftCollapsed;collapsed=!!u.collapsed;leftTab=u.leftTab==='sections'?'sections':'templates';rightTab=u.rightTab==='section'?'section':'design'}}catch(e){}}
function render(){renderTemplates();renderSectionList();renderSheets();renderInspector();$('docName').value=state.docName;$('pageLayout').value=state.layout;$('editMode').value=state.mode}
/* Selecting only toggles highlight classes: no re-layout, so the page never jumps while you click around. */
function selectSection(id){selectedId=id;rightTab='section';renderSectionList();document.querySelectorAll('[data-resume-section]').forEach(el=>el.classList.toggle('selected',el.dataset.resumeSection===id));renderInspector()}
function addSection(type,title,content){const s={id:uid(),type,title:title||type.charAt(0).toUpperCase()+type.slice(1),visible:true};if(['experience','education','projects'].includes(type))s.entries=[{role:type==='education'?'Degree / qualification':type==='projects'?'Project name':'Job title',company:'Organization',date:'Year',details:'Add one detail per line.'}];else s.content=content||(type==='skills'?'Skill one, Skill two, Skill three':'Add your content here.');state.sections.push(s);selectedId=s.id}
function download(filename,blob){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function exportJSON(){download((state.docName||'resume').replace(/[^a-z0-9-_]+/gi,'-')+'.json',new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));toast('JSON project saved')}
function importJSON(file){const r=new FileReader();r.onload=()=>{try{const next=normalizeState(JSON.parse(r.result));transact(()=>{state=next;selectedId=null});toast('Project loaded')}catch(e){alert('Could not load project: '+(e instanceof SyntaxError?'the file is not valid JSON.':e.message))}};r.onerror=()=>alert('Could not read that file.');r.readAsText(file)}
function addSelectableText(doc,sheet){
 const bounds=sheet.getBoundingClientRect(),scale=210/bounds.width,range=document.createRange(),walker=document.createTreeWalker(sheet,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  const text=node.nodeValue||'';if(!text.trim())continue;
  const style=getComputedStyle(node.parentElement),fontSize=parseFloat(style.fontSize)||12,family=style.fontFamily.toLowerCase();
  const font=/courier|monospace/.test(family)?'courier':/georgia|times/.test(family)?'times':'helvetica';
  const bold=Number.parseInt(style.fontWeight,10)>=600||style.fontWeight==='bold',italic=style.fontStyle==='italic';
  doc.setFont(font,bold?(italic?'bolditalic':'bold'):(italic?'italic':'normal'));
  doc.setFontSize(fontSize*scale*72/25.4);
  let line='',lineTop=null,lineLeft=0;
  const flush=()=>{
   const visibleLine=line.replace(/\s+$/,'');
   if(visibleLine.trim())doc.text(visibleLine,(lineLeft-bounds.left)*scale,(lineTop-bounds.top+fontSize*.86)*scale,{renderingMode:'invisible'});
   line='';lineTop=null;
  };
  for(let offset=0;offset<text.length;){
   const codePoint=text.codePointAt(offset),character=String.fromCodePoint(codePoint),length=character.length;
   if(character==='\n'||character==='\r'){flush();offset+=length;continue}
   range.setStart(node,offset);range.setEnd(node,offset+length);
   const rect=range.getBoundingClientRect();
   if(rect.width||rect.height){
    if(lineTop!==null&&Math.abs(rect.top-lineTop)>Math.max(2,fontSize*.35))flush();
    if(lineTop===null){lineTop=rect.top;lineLeft=rect.left}
    line+=character;
   }else if(/\s/.test(character)&&lineTop!==null)line+=character;
   offset+=length;
  }
  flush();
 }
}
function addPDFLinks(doc,sheet){
 const bounds=sheet.getBoundingClientRect(),scaleX=210/bounds.width,scaleY=297/bounds.height;
 sheet.querySelectorAll('.contact a[href]').forEach(anchor=>{
  for(const rect of anchor.getClientRects()){
   if(!rect.width||!rect.height)continue;
   doc.link((rect.left-bounds.left)*scaleX,(rect.top-bounds.top)*scaleY,rect.width*scaleX,rect.height*scaleY,{url:anchor.href});
  }
 });
}
async function exportPDF(){
 const sheets=[...$('sheets').querySelectorAll('.sheet')];if(!sheets.length)return;
 const btn=$('pdfBtn'),oldZoom=sheets.map(x=>x.style.transform);
 try{
  btn.disabled=true;btn.textContent='Creating PDF…';
  $('sheets').classList.add('exporting');sheets.forEach(sheet=>sheet.style.transform='none');
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
  {
   const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
   for(let i=0;i<sheets.length;i++){
    const canvas=await html2canvas(sheets[i],{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,scrollX:0,scrollY:0});
    if(i>0)doc.addPage('a4','portrait');
    doc.addImage(canvas.toDataURL('image/jpeg',.96),'JPEG',0,0,210,297,undefined,'FAST');
    addSelectableText(doc,sheets[i]);
    addPDFLinks(doc,sheets[i]);
   }
   doc.save((state.docName||'resume').replace(/[^a-z0-9-_]+/gi,'-')+'.pdf');toast('PDF exported');
  }
 }catch(e){console.error(e);alert('PDF export failed. Please use Print → Save as PDF.')}
 finally{$('sheets').classList.remove('exporting');btn.disabled=false;btn.textContent='Export PDF';renderSheets()}
}
$('templates').addEventListener('click',e=>{const b=e.target.closest('[data-template]');if(!b)return;transact(()=>{state.template=b.dataset.template;const t=activeTemplate();state.layout=t.layout;state.design.accent=t.accent;selectedId=null});toast('Applied '+activeTemplate().name)});
$('sectionList').addEventListener('click',e=>{const toggle=e.target.closest('[data-toggle]');if(toggle){transact(()=>{const s=sectionById(toggle.dataset.toggle);if(s)s.visible=!s.visible});return}const row=e.target.closest('[data-section-row]');if(row)selectSection(row.dataset.sectionRow)});
$('sectionList').addEventListener('dragstart',e=>{const row=e.target.closest('[data-section-row]');if(!row)return;draggingId=row.dataset.sectionRow;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggingId);row.style.opacity='.5'});
$('sectionList').addEventListener('dragend',e=>{const row=e.target.closest('[data-section-row]');if(row)row.style.opacity='1';draggingId=null});
$('sectionList').addEventListener('dragover',e=>{if(e.target.closest('[data-section-row]')){e.preventDefault();e.dataTransfer.dropEffect='move'}});
$('sectionList').addEventListener('drop',e=>{e.preventDefault();const row=e.target.closest('[data-section-row]'),id=e.dataTransfer.getData('text/plain');if(!row||!id||id===row.dataset.sectionRow)return;transact(()=>{const from=state.sections.findIndex(x=>x.id===id),to=state.sections.findIndex(x=>x.id===row.dataset.sectionRow);if(from<0||to<0)return;const [item]=state.sections.splice(from,1);state.sections.splice(to,0,item)})});
$('sheets').addEventListener('click',e=>{const el=e.target.closest('[data-resume-section]');if(el)selectSection(el.dataset.resumeSection)});
$('sheets').addEventListener('pointerdown',e=>{
 if(state.mode!=='free'||e.button!==0)return;const hit=e.target.closest('[data-resume-section]');if(!hit)return;
 const id=hit.dataset.resumeSection;selectSection(id);const el=$('sheets').querySelector(`[data-resume-section="${id}"]`);if(!el)return;
 const beforeDrag=deep(state),startX=e.clientX,startY=e.clientY,start=deep(state.positions[id]||{x:0,y:0,w:PAGE_W}),sheet=el.closest('.sheet'),scale=sheet.getBoundingClientRect().width/PAGE_W||1;
 const move=ev=>{const pos={x:clamp(start.x+(ev.clientX-startX)/scale,0,Math.max(0,PAGE_W-start.w),0),y:clamp(start.y+(ev.clientY-startY)/scale,0,PAGE_H-30,0),w:start.w};state.positions[id]=pos;el.style.left=pos.x+'px';el.style.top=pos.y+'px'};
 const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);history.push(beforeDrag);if(history.length>50)history.shift();saveLocal()};
 document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});
});
document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.add==='custom'){$('modalBg').classList.add('show');$('customTitle').focus();return}transact(()=>addSection(b.dataset.add))}));
$('confirmCustom').addEventListener('click',()=>{transact(()=>addSection('custom',$('customTitle').value.trim()||'Additional information',$('customContent').value));$('modalBg').classList.remove('show')});
$('cancelCustom').addEventListener('click',()=>$('modalBg').classList.remove('show'));
$('modalBg').addEventListener('click',e=>{if(e.target===$('modalBg'))$('modalBg').classList.remove('show')});
$('pageLayout').addEventListener('change',e=>transact(()=>state.layout=e.target.value==='two'?'two':'single'));
$('editMode').addEventListener('change',e=>transact(()=>{state.mode=e.target.value==='free'?'free':'flow'}));
$('zoomIn').addEventListener('click',()=>{zoom=Math.min(1.1,zoom+.05);renderSheets()});$('zoomOut').addEventListener('click',()=>{zoom=Math.max(.45,zoom-.05);renderSheets()});
$('undoBtn').addEventListener('click',undo);$('saveBtn').addEventListener('click',exportJSON);$('loadBtn').addEventListener('click',()=>$('jsonInput').click());$('jsonInput').addEventListener('change',e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value=''});
$('pdfBtn').addEventListener('click',exportPDF);$('docName').addEventListener('change',e=>transact(()=>state.docName=e.target.value.trim()||'Untitled resume'));
let resizing=null;
function gripDown(side){return e=>{if(side==='l'?leftCollapsed:collapsed){side==='l'?toggleLeft():togglePanel();return}resizing=side;e.preventDefault()}}
$('panelGrip').addEventListener('pointerdown',gripDown('r'));$('leftGrip').addEventListener('pointerdown',gripDown('l'));
document.addEventListener('pointermove',e=>{if(!resizing)return;if(resizing==='r')panelWidth=Math.max(RW[0],Math.min(RW[1],window.innerWidth-e.clientX));else leftWidth=Math.max(LW[0],Math.min(LW[1],e.clientX));applyPanels()});
document.addEventListener('pointerup',()=>{if(resizing){resizing=null;savePrefs()}});
$('collapseLeft').addEventListener('click',toggleLeft);$('expandLeft').addEventListener('click',toggleLeft);$('expandRight').addEventListener('click',togglePanel);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)){e.preventDefault();undo()}if(e.key==='Escape')$('modalBg').classList.remove('show')});
try{const raw=localStorage.getItem('resumeStudioV2')||localStorage.getItem('resumeStudioProject');if(raw){state=normalizeState(JSON.parse(raw));let profileUpdated=false;if(state.profile.name==='Alex Morgan'){state.profile.name='Vishal Maurya';profileUpdated=true}if(state.profile.email==='alex.morgan@email.com'){state.profile.email='mauryavishal93@gmail.com';profileUpdated=true}if(state.profile.website==='linkedin.com/in/alexmorgan'){state.profile.website='linkedin.com/in/vimaurya/';profileUpdated=true}if(profileUpdated)saveLocal()}}catch(e){state=fresh()}
addEventListener('pagehide',()=>{try{localStorage.setItem('resumeStudioV2',JSON.stringify(state))}catch(e){}});
loadPrefs();render();{const lc=leftCollapsed;setTab(leftTab);leftCollapsed=lc;applyPanels()}
})();
