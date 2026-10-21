import { estimateExperienceYears, GENERIC_ATS_WEIGHTING, weightedScore } from './ats-scoring.js';
import { buildCoverLetterDraft } from './cover-letter.js';
import { buildCoverLetterPdf } from './cover-letter-pdf.js';
import {
 cloudConfigured, deleteResume, listResumes, observeAuth, saveResume,
 signInWithGoogle, signOutUser
} from './firebase-cloud.js';
import { zoomFromPinch } from './zoom.js';

(()=>{'use strict';
const $=id=>document.getElementById(id),deep=x=>JSON.parse(JSON.stringify(x)),uid=()=>Math.random().toString(36).slice(2,10);
const clamp=(v,min,max,def)=>{v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):def};
const PAGE_W=794,PAGE_H=1122,PDF_EXPORT_SCALE=8,DEFAULT_MARGIN=32,FONTS=['Arial','Georgia','Verdana','Trebuchet MS','Times New Roman','Courier New'];
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
const fresh=()=>({version:3,docName:'Untitled resume',template:'classic',layout:'single',mode:'flow',profile:{name:'Name Surname',headline:'Engineer',email:'abc@xyz.com',phone:'+91 98765 43210',location:'Bengaluru, India',website:'linkedin.com/in/abcxyz/',photo:''},design:{accent:'#31547a',font:'Arial',fontSize:12,headingSize:15,margin:DEFAULT_MARGIN,marginY:DEFAULT_MARGIN,pageNumbers:true,headerAlign:'',photoAlign:''},sections:makeSections(),positions:{}});
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
let state=fresh(),selectedId=null,zoom=1,history=[],draggingId=null,saveTimer=null,panelWidth=300,collapsed=false,leftWidth=260,leftCollapsed=false,leftTab='templates',rightTab='design',touchPoints=new Map(),pinchStart=null,pinchUsed=false;
let cloudUser=null,activeCloudResumeId=null,activeCloudRevision=null,cloudSaveTimer=null,cloudSaving=false,cloudSavePending=false,cloudSaveBlocked=false,cloudResumes=[];
let pdfPreviewUrl=null,pdfPreviewBlob=null,pdfPreviewFilename='',pdfPreviewGeneration=0;
const $esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=v=>String(v||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2300)}
function authErrorMessage(error){
 const code=error?.code;
 if(code==='auth/configuration-not-found'||code==='auth/operation-not-allowed'){
  return 'Google sign-in is not enabled for this Firebase project. In Firebase Console, open Authentication → Sign-in method, enable Google, and save.';
 }
 if(code==='auth/unauthorized-domain'){
  return `This website domain is not authorized for Firebase sign-in. Add "${location.hostname}" under Authentication → Settings → Authorized domains.`;
 }
 return error?.message||'Could not sign in with Google.';
}
function scheduleCloudSave(){
 if(!cloudUser||!activeCloudResumeId||cloudSaveBlocked)return;
 clearTimeout(cloudSaveTimer);
 cloudSaveTimer=setTimeout(persistCloudResume,700);
}
async function persistCloudResume(){
 if(!cloudUser||!activeCloudResumeId||cloudSaveBlocked)return;
 if(cloudSaving){cloudSavePending=true;return}
 const uid=cloudUser.uid,id=activeCloudResumeId,snapshot=deep(state),expectedRevision=activeCloudRevision;
 cloudSaving=true;
 try{
  const result=await saveResume(uid,id,snapshot.docName,snapshot,expectedRevision);
  if(activeCloudResumeId===id&&cloudUser?.uid===uid){
   activeCloudRevision=result.revision;
   if(JSON.stringify(snapshot)===JSON.stringify(state))$('saveState').textContent='Saved in cloud and browser';
  }
 }catch(error){
  if(activeCloudResumeId===id){
   cloudSaveBlocked=true;
   $('saveState').textContent='Cloud save stopped—check message';
   toast(error.message||'Could not save this resume to the cloud.');
  }
 }finally{
  cloudSaving=false;
  if(cloudSavePending&&!cloudSaveBlocked){cloudSavePending=false;scheduleCloudSave()}
 }
}
function saveLocal(syncCloud=true){
 $('saveState').textContent='Saving…';
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{
  try{
   localStorage.setItem('resumeStudioV2',JSON.stringify(state));
   $('saveState').textContent='Saved in this browser';
   if(syncCloud)scheduleCloudSave();
  }catch(error){$('saveState').textContent='Local save unavailable';toast('Could not save this resume in this browser.')}
 },250);
}
function renderCloudResumes(){
 const list=$('cloudResumeList');
 if(!cloudUser){list.innerHTML='<div class="cloud-empty">Sign in with Google to access your cloud resumes.</div>';return}
 if(!cloudResumes.length){list.innerHTML='<div class="cloud-empty">No cloud resumes yet. Save your current resume as a new cloud copy to get started.</div>';return}
 list.innerHTML=cloudResumes.map(item=>{
  const updated=item.updatedAt?new Date(item.updatedAt).toLocaleString():'Date unavailable';
  return `<div class="cloud-resume-item"><div class="cloud-resume-meta"><strong>${$esc(item.name||'Untitled resume')}</strong><small>Updated ${$esc(updated)}</small></div><button class="btn soft" type="button" data-cloud-load="${$esc(item.id)}">Open</button><button class="btn danger" type="button" data-cloud-delete="${$esc(item.id)}">Delete</button></div>`;
 }).join('');
}
async function refreshCloudResumes(){
 if(!cloudUser){renderCloudResumes();return}
 const uid=cloudUser.uid;
 $('cloudResumeList').innerHTML='<div class="cloud-empty">Loading cloud resumes…</div>';
 try{
  const resumes=await listResumes(uid);
  if(cloudUser?.uid!==uid)return;
  cloudResumes=resumes;
  renderCloudResumes();
 }catch(error){
  if(cloudUser?.uid!==uid)return;
  $('cloudResumeList').innerHTML=`<div class="cloud-empty">Could not load cloud resumes: ${$esc(error.message||'Firebase request failed.')}</div>`;
 }
}
function openCloudModal(){
 $('cloudModalBg').classList.add('show');
 $('cloudModalBg').setAttribute('aria-hidden','false');
 refreshCloudResumes();
}
function closeCloudModal(){
 $('cloudModalBg').classList.remove('show');
 $('cloudModalBg').setAttribute('aria-hidden','true');
}
async function saveCurrentAsCloudCopy(){
 if(!cloudUser){toast('Sign in with Google before saving to the cloud.');return}
 const suggested=state.docName||'Untitled resume';
 const name=window.prompt('Name this cloud resume:',suggested);
 if(name===null)return;
 const cleanName=name.trim().slice(0,120)||'Untitled resume';
 const copy=deep(state);
 copy.docName=cleanName;
 try{
  const result=await saveResume(cloudUser.uid,null,cleanName,copy,null);
  activeCloudResumeId=result.id;
  activeCloudRevision=result.revision;
  cloudSaveBlocked=false;
  state=copy;
  selectedId=null;
  render();
  saveLocal(false);
  await refreshCloudResumes();
  toast('Cloud resume saved. Future edits will sync automatically.');
 }catch(error){toast(error.message||'Could not save this resume to the cloud.')}
}
function openCloudResume(id){
 const item=cloudResumes.find(resume=>resume.id===id);
 if(!item)return;
 try{
  state=normalizeState(item.state);
  activeCloudResumeId=item.id;
  activeCloudRevision=item.revision;
  cloudSaveBlocked=false;
  history=[];
  selectedId=null;
  render();
  saveLocal(false);
  $('saveState').textContent='Loaded from cloud';
  closeCloudModal();
  toast('Cloud resume opened. Future edits will sync automatically.');
 }catch(error){toast(`Could not open this cloud resume: ${error.message}`)}
}
async function removeCloudResume(id){
 const item=cloudResumes.find(resume=>resume.id===id);
 if(!item||!cloudUser)return;
 if(!window.confirm(`Delete "${item.name||'Untitled resume'}" from your cloud resumes? This cannot be undone.`))return;
 try{
  await deleteResume(cloudUser.uid,id);
  if(activeCloudResumeId===id){activeCloudResumeId=null;activeCloudRevision=null;cloudSaveBlocked=false}
  await refreshCloudResumes();
  toast('Cloud resume deleted.');
 }catch(error){toast(error.message||'Could not delete this cloud resume.')}
}
function updateCloudAccount(user,error){
 if(error){
  $('googleSignInBtn').disabled=true;
  $('googleSignInLabel').textContent='Cloud setup needed';
  $('googleSignInBtn').title=error.message;
  $('cloudAccount').textContent=error.message;
  renderCloudResumes();
  return;
 }
 cloudUser=user;
 $('googleSignInBtn').hidden=!!user;
 $('cloudResumesBtn').hidden=!user;
 $('googleSignOutBtn').hidden=!user;
 $('cloudAccount').textContent=user?`Signed in as ${user.email||user.displayName||'Google user'}. Cloud saves are private to this account.`:'Sign in to access your resumes across devices.';
 if(!user){
  clearTimeout(cloudSaveTimer);
  activeCloudResumeId=null;
  activeCloudRevision=null;
  cloudSaveBlocked=false;
  $('saveState').textContent='Saved in this browser';
 }
 renderCloudResumes();
}
function updateUndoButton(){const button=$('undoBtn');if(button)button.disabled=history.length===0}
function recordHistory(snapshot){history.push(snapshot);if(history.length>50)history.shift();updateUndoButton()}
function transact(fn){const previous=deep(state);fn();if(JSON.stringify(previous)!==JSON.stringify(state))recordHistory(previous);render();saveLocal()}
function undo(){if(!history.length)return;state=history.pop();if(!state.sections.some(s=>s.id===selectedId))selectedId=null;render();saveLocal();toast('Undo complete')}
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
 const head=index===0?`<header class="resume-header${hasPhoto?' has-photo':''}"${hasPhoto?` data-photo-pos="${photoPos}"`:''}>${hasPhoto?`<img class="photo" src="${$esc(p.photo)}" alt="Profile photo">`:''}<div class="header-text"><h1 class="name">${$esc(p.name||'Your Name')}</h1><div class="headline">${$esc(p.headline||'Professional Title')}</div><div class="contact">${contact}</div></div></header>`:'';
 return `<div class="sheet-inner">${head}<div class="sections-area">${cols?'<div class="section-columns"><div class="section-column"></div><div class="section-column"></div></div>':''}</div></div><div class="page-number"></div>`;
}
function createSheet(index,tmpl,cols){
 const d=state.design,el=document.createElement('article'),set=(k,v)=>el.style.setProperty(k,v);
 el.className=`sheet ${tmpl.cls}`;el.dataset.page=String(index+1);
 set('--resume-accent',d.accent||tmpl.accent);set('--resume-font',d.font||'Arial');
 set('--resume-size',clamp(d.fontSize,8,24,12)+'px');set('--resume-heading',clamp(d.headingSize,10,28,15)+'px');
 set('--mx',clamp(d.margin,0,100,DEFAULT_MARGIN)+'px');set('--mt',clamp(d.marginY,0,100,DEFAULT_MARGIN)+'px');set('--mb',clamp(d.marginY,0,100,DEFAULT_MARGIN)+'px');
 el.dataset.halign=['left','center','right'].includes(d.headerAlign)?d.headerAlign:'';set('--page-no-h',d.pageNumbers?'26px':'0px');set('--area-pt',index>0?clamp(d.marginY,0,100,DEFAULT_MARGIN)+'px':(tmpl.banner?'16px':'0px'));
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
 sec.innerHTML=`${cont?'':`<h2 class="section-heading">${$esc(s.title)}</h2>`}<div class="section-body"></div>`;return sec;
}
/* Appends one atom and returns the element it created (so a failed fit can be undone). */
function appendAtom(shell,a,st){
 const body=shell.lastElementChild;let el;
 if(a.k==='entry'){
  el=document.createElement('div');el.className='entry';
  el.innerHTML=`<div class="entry-top"><span class="entry-title">${$esc(a.e.role)}</span><span class="entry-date">${$esc(a.e.date)}</span></div>${a.e.company?`<div class="entry-sub">${$esc(a.e.company)}</div>`:''}${a.first?`<ul><li>${$esc(a.first)}</li></ul>`:''}`;
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
function render(){renderTemplates();renderSectionList();renderSheets();renderInspector();$('docName').value=state.docName;$('pageLayout').value=state.layout;$('editMode').value=state.mode;updateUndoButton()}
/* Selecting only toggles highlight classes: no re-layout, so the page never jumps while you click around. */
function selectSection(id){selectedId=id;rightTab='section';renderSectionList();document.querySelectorAll('[data-resume-section]').forEach(el=>el.classList.toggle('selected',el.dataset.resumeSection===id));renderInspector()}
function addSection(type,title,content){const s={id:uid(),type,title:title||type.charAt(0).toUpperCase()+type.slice(1),visible:true};if(['experience','education','projects'].includes(type))s.entries=[{role:type==='education'?'Degree / qualification':type==='projects'?'Project name':'Job title',company:'Organization',date:'Year',details:'Add one detail per line.'}];else s.content=content||(type==='skills'?'Skill one, Skill two, Skill three':'Add your content here.');state.sections.push(s);selectedId=s.id}
function download(filename,blob){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function exportJSON(){download((state.docName||'resume').replace(/[^a-z0-9-_]+/gi,'-')+'.json',new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));toast('JSON backup downloaded')}
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
 const generation=++pdfPreviewGeneration;
 const btn=$('pdfBtn'),status=$('pdfPreviewStatus'),frame=$('pdfPreviewFrame'),downloadBtn=$('downloadPdfPreview');
 openPdfPreview();
 $('pdfPreviewTitle').textContent='Preview your resume PDF';
 status.textContent='Preparing your PDF preview…';
 frame.hidden=true;
 downloadBtn.disabled=true;
 btn.disabled=true;btn.textContent='Creating preview…';
 try{
  $('sheets').classList.add('exporting');sheets.forEach(sheet=>sheet.style.transform='none');
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
  if(generation!==pdfPreviewGeneration)return;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  for(let i=0;i<sheets.length;i++){
   const canvas=await html2canvas(sheets[i],{scale:PDF_EXPORT_SCALE,backgroundColor:'#ffffff',useCORS:true,logging:false,scrollX:0,scrollY:0});
   if(generation!==pdfPreviewGeneration)return;
   if(i>0)doc.addPage('a4','portrait');
   doc.addImage(canvas.toDataURL('image/jpeg',.96),'JPEG',0,0,210,297,undefined,'FAST');
   addSelectableText(doc,sheets[i]);
   addPDFLinks(doc,sheets[i]);
  }
  showPdfPreview(doc.output('blob'),`${(state.docName||'resume').replace(/[^a-z0-9-_]+/gi,'-')}.pdf`,doc.getNumberOfPages(),'Preview your resume PDF');
 }catch(e){
  console.error(e);
  status.textContent='PDF preview could not be created. Close this window and try again.';
 }finally{$('sheets').classList.remove('exporting');btn.disabled=false;btn.textContent='Export PDF';renderSheets()}
}
function openPdfPreview(){
 $('pdfPreviewModalBg').classList.add('show');
 $('pdfPreviewModalBg').setAttribute('aria-hidden','false');
 $('closePdfPreview').focus();
}
function showPdfPreview(blob,filename,pageCount,title){
 if(pdfPreviewUrl)URL.revokeObjectURL(pdfPreviewUrl);
 pdfPreviewBlob=blob;
 pdfPreviewFilename=filename;
 pdfPreviewUrl=URL.createObjectURL(blob);
 $('pdfPreviewTitle').textContent=title;
 $('pdfPreviewFrame').src=pdfPreviewUrl;
 $('pdfPreviewFrame').hidden=false;
 $('pdfPreviewStatus').textContent=`${pageCount} A4 page${pageCount===1?'':'s'} · Review the PDF before downloading.`;
 $('downloadPdfPreview').disabled=false;
}
function closePdfPreview(){
 pdfPreviewGeneration++;
 $('pdfPreviewModalBg').classList.remove('show');
 $('pdfPreviewModalBg').setAttribute('aria-hidden','true');
 $('pdfPreviewFrame').removeAttribute('src');
 $('pdfPreviewFrame').hidden=true;
 $('downloadPdfPreview').disabled=true;
 pdfPreviewBlob=null;
 pdfPreviewFilename='';
 if(pdfPreviewUrl){URL.revokeObjectURL(pdfPreviewUrl);pdfPreviewUrl=null}
}
function downloadPreviewPdf(){
 if(!pdfPreviewBlob)return;
 download(pdfPreviewFilename,pdfPreviewBlob);
 closePdfPreview();
 toast('PDF downloaded');
}

const ATS_STOPWORDS=new Set('a an the and or but if then than with without for from into onto to of in on at by as is are was were be been being this that these those it its your you we our they their will can may must should have has had not no do does did about across after before during over under between per each all any more most other such use using used work working role job team company experience skills skill required preferred plus including strong excellent good knowledge ability able responsibilities qualifications requirement requirements candidate position'.split(/\s+/));
const ATS_ALIASES={
 python:['python'],java:['java'],javascript:['javascript','js'],typescript:['typescript','ts'],cpp:['c++','cpp'],csharp:['c#','c sharp'],go:['golang','go language'],ruby:['ruby'],php:['php'],swift:['swift'],kotlin:['kotlin'],rust:['rust'],
 react:['react','react.js','reactjs'],angular:['angular'],vue:['vue','vue.js','vuejs'],node:['node.js','nodejs'],express:['express','express.js'],next:['next.js','nextjs'],html:['html','html5'],css:['css','css3'],dotnet:['.net','dotnet','asp.net'],spring:['spring','spring boot'],django:['django'],flask:['flask'],
 sql:['sql','structured query language'],postgresql:['postgresql','postgres'],mysql:['mysql'],mongodb:['mongodb','mongo db'],redis:['redis'],oracle:['oracle database'],snowflake:['snowflake'],bigquery:['bigquery','big query'],data_analysis:['data analysis','data analytics'],excel:['excel','microsoft excel'],tableau:['tableau'],power_bi:['power bi','powerbi'],
 api:['api','apis','rest api','rest apis'],graphql:['graphql'],automation:['automation','automated testing','test automation'],playwright:['playwright'],selenium:['selenium'],cypress:['cypress'],jest:['jest'],junit:['junit'],pytest:['pytest'],quality_assurance:['quality assurance','qa'],performance_testing:['performance testing','load testing'],
 git:['git','github','gitlab'],ci_cd:['ci/cd','continuous integration','continuous delivery','continuous deployment'],jenkins:['jenkins'],github_actions:['github actions'],docker:['docker'],kubernetes:['kubernetes','k8s'],terraform:['terraform'],aws:['aws','amazon web services'],azure:['azure','microsoft azure'],gcp:['gcp','google cloud platform','google cloud'],linux:['linux'],
 agile:['agile','scrum'],project_management:['project management','project manager'],communication:['communication','communicate'],leadership:['leadership','led','mentor','mentoring'],stakeholder_management:['stakeholder management','stakeholders'],problem_solving:['problem solving','analytical skills'],jira:['jira'],salesforce:['salesforce'],sap:['sap'],figma:['figma']
};
const ATS_WEIGHTING={keyword:50,jobTitle:25,requiredSkills:15,format:2,sections:2,experience:2,education:1,certifications:1,impact:2};
function sanitizeAtsText(value){return String(value||'').toLowerCase().replace(/[^a-z0-9+#\s]/g,' ').replace(/\s+/g,' ').trim()}
function getTechnicalSkillsText(){
 return state.sections.filter(s=>s.visible && s.type==='skills').map(s=>s.content||'').join('\n');
}
function getExperienceYears(){
 const entries=[].concat(...state.sections.filter(s=>s.visible && s.type==='experience').map(s=>s.entries||[]));
 return estimateExperienceYears(entries);
}
function extractJobTitle(description){
 const lines=String(description||'').split(/\n|\r/).map(line=>line.trim()).filter(Boolean);
 const explicit=lines.map(line=>line.match(/(?:job\s*title|position|role)\s*[:\-]\s*([^,;|]+)/i)?.[1]).find(Boolean);
 if(explicit)return explicit.replace(/\s+(?:at|with|for)\s+.*$/i,'').trim();
 const titlePattern=/\b((?:senior|sr\.?|junior|jr\.?|lead|principal|staff|associate|assistant|chief|head of)\s+)?((?:[A-Za-z][A-Za-z0-9.+#&/-]*\s+){0,3}(?:engineer|developer|manager|analyst|specialist|architect|consultant|coordinator|director|scientist|designer|tester|recruiter|administrator|technician|accountant|nurse|teacher|sales representative|product owner))\b/i;
 for(const line of lines){
  const match=line.match(titlePattern);
  if(match){
   const title=`${match[1]||''}${match[2]}`.replace(/\s+/g,' ').trim();
   if(title.split(/\s+/).length<=6)return title;
  }
 }
 return '';
}
function normalizeAtsTitle(value){
 return sanitizeAtsText(value).replace(/\b(qa|quality assurance|quality engineer|software engineer|automation engineer|test engineer|manual qa)\b/g,'qa engineer').replace(/\s+/g,' ');
}
function jobTermMatches(text,term){const clean=sanitizeAtsText(term);if(!clean)return false;return new RegExp(`(^|[^a-z0-9])${clean.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+')}(?=$|[^a-z0-9])`,'i').test(sanitizeAtsText(text));}
function collectAtsJobTerms(description){
 const text=sanitizeAtsText(description||'');
 const found=new Set();
 for(const [key,aliases] of Object.entries(ATS_ALIASES)){
  for(const alias of aliases){const clean=sanitizeAtsText(alias);if(!clean)continue; if(jobTermMatches(text,clean))found.add(key);}
 }
 return Array.from(found);
}
function getAtsKeywordTokens(text){
 const cleaned=sanitizeAtsText(text).split(/\s+/).filter(word=>word.length>2 && !ATS_STOPWORDS.has(word));
 return [...new Set(cleaned)];
}
function getAtsEducationText(){
 return state.sections.filter(s=>s.visible && s.type==='education').map(s=>s.entries||[]).flat().map(e=>`${e.role} ${e.company} ${e.date} ${e.details}`).join(' ');
}
function getAtsCertText(){
 return [...state.sections.filter(s=>s.visible && (s.type==='certifications' || s.type==='custom')).map(s=>s.content||'')].join(' ');
}
function scoreJobTitleAlignment(jobText){
 const target=extractJobTitle(jobText);
 if(!target) return {score:85,detail:'Could not reliably identify a target title; a small neutral adjustment was applied.'};
 const targetNorm=normalizeAtsTitle(target);
 const resumeTitles=[state.profile.headline, ...state.sections.filter(s=>s.visible && s.type==='experience').flatMap(s=> (s.entries||[]).map(e=>e.role))].map(normalizeAtsTitle);
 let best=0;
 for(const title of resumeTitles){
   if(!title) continue;
   const titleTokens=new Set(title.split(' '));
   const targetTokens=new Set(targetNorm.split(' '));
   const overlap=[...titleTokens].filter(t=>targetTokens.has(t)).length;
  const ratio=targetTokens.size ? overlap/targetTokens.size : 0;
   best=Math.max(best, Math.round(ratio*100));
   if(title.includes(targetNorm) || targetNorm.includes(title)) { best=Math.max(best, 100); break; }
 }
 return {score:best, detail: target ? `Target role: ${target}` : 'No target title detected'};
}
function scoreEducationMatch(jobText){
 const required=String(jobText||'').toLowerCase();
 const educationText=getAtsEducationText().toLowerCase();
 const degreeTerms=['bachelor','master','phd','mba','diploma','associate','degree','certification'];
 const demands=degreeTerms.filter(term => required.includes(term));
 if(!demands.length) return {score:100, detail:'No education requirement was specified in the job description.'};
 const matches=demands.filter(term => educationText.includes(term));
 return {score: matches.length===demands.length ? 100 : Math.round((matches.length / demands.length) * 100), detail: `Degree terms found: ${matches.length}/${demands.length}`};
}
function scoreCertMatch(jobText){
 const text=sanitizeAtsText(jobText||'');
 const certTerms=['pmp','aws','azure','scrum','ccna','security+','cissp','salesforce','google analytics','professional engineer','certified'];
 const required=certTerms.filter(term => text.includes(term));
 if(!required.length) return {score:100, detail:'No certification requirement was specified in the job description.'};
 const certText=sanitizeAtsText(getAtsCertText());
 const matched=required.filter(term => certText.includes(term));
 return {score: required.length ? Math.round((matched.length / required.length) * 100) : 100, detail:`Matched ${matched.length}/${required.length} requested credentials.`};
}
function scoreFormatCompatibility(){
 const single=state.layout==='single';
 const fontOk=['Arial','Georgia','Verdana','Trebuchet MS','Times New Roman','Courier New'].includes(state.design.font);
 const weighted = (single ? 65 : 35) + (fontOk ? 25 : 10) + (state.design.pageNumbers ? 10 : 8);
 return {score: Math.min(100, weighted), detail: single ? 'Single-column, ATS-friendly structure detected.' : 'Two-column layout may reduce ATS compatibility.'};
}
function scoreSectionStructure(){
 const sections=state.sections.filter(s=>s.visible);
 const checks=[
  {type:'summary',complete:s=>String(s.content||'').trim().length>=50},
  {type:'experience',complete:s=>(s.entries||[]).some(e=>!isPlaceholderText(e.role)&&String(e.details||'').trim().length>=30)},
  {type:'skills',complete:s=>String(s.content||'').split(/[,;\n|]/).filter(x=>x.trim()).length>=3},
  {type:'education',complete:s=>(s.entries||[]).some(e=>!isPlaceholderText(e.role)&&[e.company,e.date].filter(value=>!isPlaceholderText(value)).length>=1)}
 ];
 const points=checks.reduce((sum,check)=>{
  const section=sections.find(s=>s.type===check.type);
  return sum+(section?(check.complete(section)?100:50):0);
 },0);
 const score=Math.round(points/checks.length);
 const complete=checks.filter(check=>{const section=sections.find(s=>s.type===check.type);return section&&check.complete(section)}).length;
 return {score, detail:`${complete}/${checks.length} standard sections contain substantive content.`};
}
function scoreExperienceDepth(jobText=''){
 const resume = getExperienceYears();
 const years=resume.years;
 const requiredYears=String(jobText||'').match(/\b(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/i);
 if(requiredYears){
  const required=Number(requiredYears[1]);
  const score=required>0?Math.min(100,Math.round(years/required*100)):0;
  return {score,detail:`Estimated ${years} years of experience against ${required} years requested.`};
 }
 const recencyBoost = resume.hasCurrent ? 15 : 0;
 const score=Math.min(100, Math.round((years / 8) * 70 + recencyBoost + (years > 0 ? 15 : 0)));
 return {score, detail: `Estimated experience depth: ${years} years, ${resume.hasCurrent ? 'current role included' : 'no current role detected'}.`};
}
function scoreImpactQuality(){
 const details=[].concat(...state.sections.filter(s=>s.visible).map(s => s.entries ? s.entries.map(e=>`${e.role} ${e.company} ${e.details}`) : [s.content||'']));
 const numericHits=details.join(' ').match(/\b\d+(?:%|k|m|\+)?\b|\$\d[\d,]*(?:k|m)?/gi)?.length || 0;
 const verbs=['led','built','improved','increased','reduced','designed','automated','delivered','optimized','developed'];
 const verbHits=details.join(' ').toLowerCase().match(new RegExp(verbs.join('|'),'g'))?.length || 0;
 const score=Math.min(100, Math.round(((Math.min(6, numericHits) / 6) * 60) + (Math.min(6, verbHits) / 6) * 40));
 return {score, detail: `Quantified impact found: ${numericHits} figures, ${verbHits} strong action verbs.`};
}
function isPlaceholderText(value){
 const text=String(value||'').trim();
 return !text||/^(?:name surname|name and surname|xxxxx yyyyy|your name|professional title|university name|example(?:\s+.*)?|previous company|organization|add\b.*|degree\s*\/.*|job title|skill one|skill two)$/i.test(text);
}
function scoreGenericSkills(){
 const skills=getTechnicalSkillsText().split(/[,;\n|]/).map(skill=>skill.trim()).filter((skill,index,list)=>skill&&!isPlaceholderText(skill)&&list.findIndex(item=>item.toLowerCase()===skill.toLowerCase())===index);
 const experienceDetails=state.sections.filter(s=>s.visible&&s.type==='experience').flatMap(s=>(s.entries||[]).map(e=>e.details)).join('\n');
 const contextual=skills.filter(skill=>{
  const group=collectAtsJobTerms(skill);
  const aliases=group.flatMap(term=>ATS_ALIASES[term]||[]);
  return jobTermMatchesAny(experienceDetails,aliases.length?aliases:[skill]);
 }).length;
 const listQuality=Math.min(100,Math.round(skills.length/6*100));
 const contextQuality=skills.length?Math.round(contextual/skills.length*100):0;
 return {score:Math.round(listQuality*.5+contextQuality*.5),detail:`${skills.length} distinct skills listed; ${contextual} are also evidenced in experience details.`};
}
function scoreGenericTitleClarity(){
 const title=String(state.profile.headline||'').trim();
 if(isPlaceholderText(title))return {score:0,detail:'Add a clear professional headline.'};
 const words=title.split(/\s+/).filter(Boolean);
 const score=words.length===1?65:Math.min(100,70+words.length*10);
 return {score,detail:words.length===1?`“${title}” is broad; use a specific role title.`:`Professional headline is present: ${title}.`};
}
function scoreGenericEducation(){
 const entries=state.sections.filter(s=>s.visible&&s.type==='education').flatMap(s=>s.entries||[]);
 if(!entries.length)return {score:40,detail:'No education entry found; education can be role-dependent.'};
 const fields=entries.reduce((sum,e)=>sum+[e.role,e.company,e.date].filter(value=>!isPlaceholderText(value)).length,0);
 const possible=entries.length*3;
 return {score:Math.round(fields/possible*100),detail:`${fields}/${possible} degree, institution, and date fields are filled.`};
}
function scoreGenericCertifications(){
 const text=state.sections.filter(s=>s.visible&&s.type==='certifications').map(s=>s.content||'').join(' ').trim();
 if(isPlaceholderText(text)||/^add relevant certifications/i.test(text))return {score:70,detail:'No certification is listed; this is treated as optional without a job description.'};
 return {score:90,detail:'Certification information is present; its relevance requires a job description.'};
}
function scoreGenericContact(){
 const profile=state.profile;
 const nameValid=!isPlaceholderText(profile.name);
 const email=String(profile.email||'').trim();
 const emailValid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/(?:example|xyz|test)\.(?:com|org|net)$/i.test(email);
 const phoneDigits=String(profile.phone||'').replace(/\D/g,'').length;
 const phoneValid=phoneDigits>=7;
 const locationValid=!isPlaceholderText(profile.location);
 const score=(nameValid?30:0)+(emailValid?40:0)+(phoneValid?20:0)+(locationValid?10:0);
 return {score,detail:`Name ${nameValid?'present':'missing'}, email ${emailValid?'valid':'missing or placeholder'}, phone ${phoneValid?'valid':'missing'}, location ${locationValid?'present':'missing'}.`};
}
function jobTermMatchesAny(text, aliases){ return aliases.some(alias => jobTermMatches(text, alias)); }
function computeAtsChecks(jobTextOverride=''){
 const technicalSkillsText=getTechnicalSkillsText();
 const jobText=jobTextOverride || $('jobDescription')?.value || '';
 if(!String(jobText).trim()){
  const formatScore=scoreFormatCompatibility();
  const titleScore=scoreGenericTitleClarity();
  const sectionScore=scoreSectionStructure();
  const experienceScore=scoreExperienceDepth();
  const skillsScore=scoreGenericSkills();
  const educationScore=scoreGenericEducation();
  const certificationScore=scoreGenericCertifications();
  const impactScore=scoreImpactQuality();
  const contactScore=scoreGenericContact();
  const resumeKeywords=collectAtsJobTerms(technicalSkillsText);
  const criteria=[
   {label:'ATS-friendly Formatting',weight:GENERIC_ATS_WEIGHTING.formatting,score:formatScore.score,detail:formatScore.detail},
   {label:'Professional Title Clarity',weight:GENERIC_ATS_WEIGHTING.titleClarity,score:titleScore.score,detail:titleScore.detail},
   {label:'Standard Section Structure',weight:GENERIC_ATS_WEIGHTING.sections,score:sectionScore.score,detail:sectionScore.detail},
   {label:'Experience & Dates',weight:GENERIC_ATS_WEIGHTING.experience,score:experienceScore.score,detail:experienceScore.detail},
   {label:'Technical Skills & Context',weight:GENERIC_ATS_WEIGHTING.skills,score:skillsScore.score,detail:skillsScore.detail},
   {label:'Education Completeness',weight:GENERIC_ATS_WEIGHTING.education,score:educationScore.score,detail:educationScore.detail},
   {label:'Certifications & Licenses',weight:GENERIC_ATS_WEIGHTING.certifications,score:certificationScore.score,detail:certificationScore.detail},
   {label:'Quantified Impact',weight:GENERIC_ATS_WEIGHTING.impact,score:impactScore.score,detail:impactScore.detail},
  {label:'Contact Information',weight:GENERIC_ATS_WEIGHTING.contact,score:contactScore.score,detail:contactScore.detail}
  ];
  const score=weightedScore(criteria,95);
  const findings=criteria.filter(item=>item.score<70).map(item=>({title:item.label,detail:item.detail,severity:item.score<50?'high':'medium'}));
  if(!findings.length)findings.push({title:'Good general ATS readiness',detail:'Your resume has a solid structure and readable content. Add a job description for role-specific matching.',severity:'good'});
  return {score,generic:true,keywordCoverage:skillsScore,matchedKeywords:resumeKeywords,missingKeywords:[],findings,criteria,resumeText:technicalSkillsText};
 }
 const jobTerms=collectAtsJobTerms(jobText);
 const matchedTerms=jobTerms.filter(term => {
  const aliases=ATS_ALIASES[term]||[term];
  return jobTermMatchesAny(technicalSkillsText, aliases);
 });
 const missingTerms=jobTerms.filter(term => !matchedTerms.includes(term));
 const keywordCoverage=jobTerms.length ? Math.round((matchedTerms.length / jobTerms.length) * 100) : 70;
 const keywordScore = {score: keywordCoverage, detail: jobTerms.length ? `Matched ${matchedTerms.length}/${jobTerms.length} recognized skill groups in the Technical Skills section.` : 'No mapped skills were found in the job description; partial neutral credit applied.'};
 const jobTitleScore = scoreJobTitleAlignment(jobText);
 const experienceDetails=state.sections.filter(s=>s.visible && s.type==='experience').flatMap(s=>(s.entries||[]).map(e=>e.details)).join('\n');
 const contextualMatches=jobTerms.filter(term=>jobTermMatchesAny(experienceDetails,ATS_ALIASES[term]||[]));
 const resumeSkillMatches=jobTerms.filter(term=>matchedTerms.includes(term)).length;
 const requiredSkillsScore = {score: jobTerms.length ? Math.round((resumeSkillMatches / jobTerms.length * 50) + (contextualMatches.length / jobTerms.length * 50)) : 70, detail: jobTerms.length ? `${resumeSkillMatches}/${jobTerms.length} requirements appear in the resume; ${contextualMatches.length} are evidenced in experience.` : 'No recognized job requirements found; partial neutral credit applied.'};
 const formatScore = scoreFormatCompatibility();
 const sectionScore = scoreSectionStructure();
 const experienceScore = scoreExperienceDepth(jobText);
 const educationScore = scoreEducationMatch(jobText);
 const certScore = scoreCertMatch(jobText);
 const impactScore = scoreImpactQuality();

 const criteria=[
  {label:'1. Keyword Match', weight:ATS_WEIGHTING.keyword, score:keywordScore.score, ok:keywordScore.score>=70, detail:keywordScore.detail},
  {label:'2. Job Title Alignment', weight:ATS_WEIGHTING.jobTitle, score:jobTitleScore.score, ok:jobTitleScore.score>=70, detail:jobTitleScore.detail},
  {label:'3. Required Skills Coverage', weight:ATS_WEIGHTING.requiredSkills, score:requiredSkillsScore.score, ok:requiredSkillsScore.score>=70, detail:requiredSkillsScore.detail},
  {label:'4. Formatting Compatibility', weight:ATS_WEIGHTING.format, score:formatScore.score, ok:formatScore.score>=75, detail:formatScore.detail},
  {label:'5. Standard Section Structure', weight:ATS_WEIGHTING.sections, score:sectionScore.score, ok:sectionScore.score>=80, detail:sectionScore.detail},
  {label:'6. Experience Recency & Depth', weight:ATS_WEIGHTING.experience, score:experienceScore.score, ok:experienceScore.score>=70, detail:experienceScore.detail},
  {label:'7. Education Match', weight:ATS_WEIGHTING.education, score:educationScore.score, ok:educationScore.score>=80, detail:educationScore.detail},
  {label:'8. Certifications & Licenses', weight:ATS_WEIGHTING.certifications, score:certScore.score, ok:certScore.score>=80, detail:certScore.detail},
  {label:'9. Quantified Impact', weight:ATS_WEIGHTING.impact, score:impactScore.score, ok:impactScore.score>=70, detail:impactScore.detail}
 ];
 const score = weightedScore(criteria,95);
 const findings=[];
 criteria.forEach(item => {
  if(item.score < 70){
   findings.push({title:item.label, detail:item.detail, severity:item.score < 50 ? 'high' : 'medium'});
  }
 });
 if(!findings.length){
  findings.push({title:'Strong ATS fit', detail:'Your resume aligns well across the nine ATS criteria.', severity:'good'});
 }
 const matchedKeywords = [...new Set(jobTerms.filter(term => matchedTerms.includes(term)))];
 return { score, keywordCoverage, matchedKeywords, missingKeywords: missingTerms, findings, criteria, resumeText:technicalSkillsText };
}
function renderAtsResults(report){
 const container=$('atsResults');
 if(!report){container.innerHTML='<div class="ats-empty">Run checks to review resume completeness, formatting risks, and optional job-description relevance.</div>';return;}
 const matchedKeywords = report.matchedKeywords.length ? report.matchedKeywords.map(t=>`<span class="ats-keyword matched">${$esc(t)}</span>`).join('') : '<span class="ats-keyword missing">No keyword matches</span>';
 const missingKeywords = report.missingKeywords.length ? report.missingKeywords.map(t=>`<span class="ats-keyword missing">${$esc(t)}</span>`).join('') : '<span class="ats-keyword matched">All key terms covered</span>';
 const criteria = report.criteria.map(item => `<div class="ats-criterion"><div><b>${$esc(item.label)}</b><span>${Math.round(item.score)}%</span></div><div class="ats-criterion-bar"><span style="width:${Math.min(100, item.score)}%"></span></div><p>${$esc(item.detail)}</p></div>`).join('');
 const findings = report.findings.map(item => `<div class="ats-finding ${item.severity}"><span class="ats-icon">${item.severity==='high'?'⚠':item.severity==='medium'?'!':'✓'}</span><div><h3>${$esc(item.title)}</h3><p>${$esc(item.detail)}</p></div><span class="ats-severity">${item.severity}</span></div>`).join('');
 const hasScore=Number.isFinite(report.score);
 const matchedDisplay=matchedKeywords||'<span class="ats-keyword missing">No recognized resume keywords detected</span>';
 const missingDisplay=missingKeywords||'<span class="ats-keyword matched">All key terms covered</span>';
 const comparisonDetails=report.generic?`<div class="ats-section-title">Recognized resume keywords</div><div class="ats-keywords">${matchedDisplay}</div><div class="ats-section-title">Job-specific comparison</div><div class="ats-empty">Add a job description to compare required keywords, title alignment, and skill relevance.</div>`:`<div class="ats-section-title">Keyword match</div><div class="ats-keywords">${matchedDisplay}</div><div class="ats-section-title">Missing terms</div><div class="ats-keywords">${missingDisplay}</div>`;
 const criteriaTitle=report.generic?'General readiness factors':'ATS criteria';
 const note=report.generic?'Generic readiness uses resume-verifiable factors only: format, title clarity, section quality, experience, technical skills, education, credentials, impact, and contact details. Job-description keyword, title, and required-skill matching are unavailable until a job description is added.':'Keyword match (50%) uses only the Technical Skills section; job title alignment (25%) and skills evidenced in experience (15%) make up the other primary factors. Formatting, structure, experience depth, education, certifications, and impact make up the remaining 10%. This heuristic score is capped at 95 because employer-specific ATS rules cannot be reproduced; scores around 75–80% or higher are generally considered strong.';
 container.innerHTML=`<div class="ats-score-row"><div class="ats-score">${hasScore?report.score:'—'}<small>score</small></div><div class="ats-score-meta"><strong>${report.generic?'Generic ATS readiness':'ATS readiness'}</strong><div>${report.generic?'Resume-only estimate; not matched to a job description.':hasScore?'Weighted score based on the 9 ATS criteria':'Paste a target job description to calculate compatibility.'}</div><div class="ats-progress"><span style="width:${hasScore?report.score:0}%"></span></div></div></div>${comparisonDetails}<div class="ats-section-title">${criteriaTitle}</div><div class="ats-criteria-grid">${criteria}</div><div class="ats-section-title">Findings</div><div class="ats-findings">${findings}</div><div class="ats-note">${note}</div>`;
}
function openAts(){
 $('atsModalBg').classList.add('show');
 $('atsModalBg').setAttribute('aria-hidden','false');
 $('jobDescription').focus();
 runAtsChecks();
}
function closeAts(){
 $('atsModalBg').classList.remove('show');
 $('atsModalBg').setAttribute('aria-hidden','true');
}
function openCoverLetter(){
 const jobDescription=$('coverJobDescription');
 if(!jobDescription.value.trim())jobDescription.value=$('jobDescription').value.trim();
 if(!$('coverJobTitle').value.trim()&&jobDescription.value.trim())$('coverJobTitle').value=extractJobTitle(jobDescription.value);
 $('coverLetterModalBg').classList.add('show');
 $('coverLetterModalBg').setAttribute('aria-hidden','false');
 $('coverJobTitle').focus();
}
function closeCoverLetter(){
 $('coverLetterModalBg').classList.remove('show');
 $('coverLetterModalBg').setAttribute('aria-hidden','true');
}
function generateCoverLetter(){
 const sections=state.sections.filter(section=>section.visible);
 const summary=sections.find(section=>section.type==='summary')?.content||'';
 const skills=sections.filter(section=>section.type==='skills').flatMap(section=>String(section.content||'').split(/[,;\n|]/).map(skill=>skill.trim()).filter(Boolean));
 const experience=sections.filter(section=>section.type==='experience').flatMap(section=>section.entries||[]);
 $('coverLetterDraft').value=buildCoverLetterDraft({
  ...state.profile,
  jobTitle:$('coverJobTitle').value,
  company:$('coverCompany').value,
  jobDescription:$('coverJobDescription').value,
  summary,
  skills,
  experience
 });
 toast('Cover letter draft created');
}
async function copyCoverLetter(){
 const text=$('coverLetterDraft').value.trim();
 if(!text){toast('Generate a draft first');return}
 try{await navigator.clipboard.writeText(text);toast('Cover letter copied')}
 catch{ $('coverLetterDraft').select();document.execCommand('copy');toast('Cover letter copied') }
}
function downloadCoverLetter(){
 const text=$('coverLetterDraft').value.trim();
 if(!text){toast('Generate a draft first');return}
 download(`${coverLetterFilename()}.txt`,new Blob([text],{type:'text/plain;charset=utf-8'}));
 toast('Cover letter downloaded');
}
function coverLetterFilename(){
 return [$('coverJobTitle').value,$('coverCompany').value,'cover-letter'].filter(Boolean).join('-').replace(/[^a-z0-9-_]+/gi,'-').replace(/-+/g,'-').toLowerCase();
}
async function previewCoverLetterPdf(){
 const text=$('coverLetterDraft').value.trim();
 if(!text){toast('Generate a draft first');return}
 const button=$('downloadCoverLetterPdf');
 const generation=++pdfPreviewGeneration;
 openPdfPreview();
 $('pdfPreviewTitle').textContent='Preview your cover letter PDF';
 $('pdfPreviewStatus').textContent='Preparing your PDF preview…';
 $('pdfPreviewFrame').hidden=true;
 $('downloadPdfPreview').disabled=true;
 try{
  button.disabled=true;
  button.textContent='Preparing preview…';
  const {jsPDF}=await import('jspdf');
  if(generation!==pdfPreviewGeneration)return;
  const doc=buildCoverLetterPdf(jsPDF,text);
  showPdfPreview(doc.output('blob'),`${coverLetterFilename()}.pdf`,doc.getNumberOfPages(),'Preview your cover letter PDF');
 }catch(error){
  console.error(error);
  if(generation===pdfPreviewGeneration)$('pdfPreviewStatus').textContent='Cover letter PDF preview could not be created. Close this window and try again.';
 }finally{
  button.disabled=false;
  button.textContent='Download .pdf';
 }
}
function applyAtsFriendlyLayout(){
 transact(()=>{
  state.template='classic';
  state.layout='single';
  state.design.accent='#31547a';
  state.design.font='Arial';
  state.design.margin=32;
  state.design.marginY=32;
 });
 toast('ATS-friendly layout applied');
}
async function runAtsChecks(){
 const results=$('atsResults');
 results.innerHTML='<div class="ats-processing"><div class="ats-spinner"></div><strong>Checking ATS readiness…</strong><div class="ats-processing-track"><span></span></div><p>Reviewing structure, keyword fit, and export readability.</p></div>';
 await new Promise(resolve => setTimeout(resolve, 3200));
 renderAtsResults(computeAtsChecks($('jobDescription').value || ''));
}
$('templates').addEventListener('click',e=>{const b=e.target.closest('[data-template]');if(!b)return;transact(()=>{state.template=b.dataset.template;const t=activeTemplate();state.layout=t.layout;state.design.accent=t.accent;selectedId=null});toast('Applied '+activeTemplate().name)});
$('sectionList').addEventListener('click',e=>{const toggle=e.target.closest('[data-toggle]');if(toggle){transact(()=>{const s=sectionById(toggle.dataset.toggle);if(s)s.visible=!s.visible});return}const row=e.target.closest('[data-section-row]');if(row)selectSection(row.dataset.sectionRow)});
$('sectionList').addEventListener('dragstart',e=>{const row=e.target.closest('[data-section-row]');if(!row)return;draggingId=row.dataset.sectionRow;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggingId);row.style.opacity='.5'});
$('sectionList').addEventListener('dragend',e=>{const row=e.target.closest('[data-section-row]');if(row)row.style.opacity='1';draggingId=null});
$('sectionList').addEventListener('dragover',e=>{if(e.target.closest('[data-section-row]')){e.preventDefault();e.dataTransfer.dropEffect='move'}});
$('sectionList').addEventListener('drop',e=>{e.preventDefault();const row=e.target.closest('[data-section-row]'),id=e.dataTransfer.getData('text/plain');if(!row||!id||id===row.dataset.sectionRow)return;transact(()=>{const from=state.sections.findIndex(x=>x.id===id),to=state.sections.findIndex(x=>x.id===row.dataset.sectionRow);if(from<0||to<0)return;const [item]=state.sections.splice(from,1);state.sections.splice(to,0,item)})});
$('sheets').addEventListener('click',e=>{const el=e.target.closest('[data-resume-section]');if(el)selectSection(el.dataset.resumeSection)});
$('sheets').addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'){
  touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touchPoints.size===2){const [first,second]=touchPoints.values();pinchStart={distance:Math.hypot(second.x-first.x,second.y-first.y),zoom};pinchUsed=true;e.preventDefault()}
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
  if(pinchUsed)return;
 }
 if(state.mode!=='free'||e.button!==0)return;const hit=e.target.closest('[data-resume-section]');if(!hit)return;
 const id=hit.dataset.resumeSection;selectSection(id);const el=$('sheets').querySelector(`[data-resume-section="${id}"]`);if(!el)return;
 const beforeDrag=deep(state),startX=e.clientX,startY=e.clientY,start=deep(state.positions[id]||{x:0,y:0,w:PAGE_W}),sheet=el.closest('.sheet'),scale=sheet.getBoundingClientRect().width/PAGE_W||1;
 const move=ev=>{if(pinchUsed)return;const pos={x:clamp(start.x+(ev.clientX-startX)/scale,0,Math.max(0,PAGE_W-start.w),0),y:clamp(start.y+(ev.clientY-startY)/scale,0,PAGE_H-30,0),w:start.w};state.positions[id]=pos;el.style.left=pos.x+'px';el.style.top=pos.y+'px'};
 const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);if(JSON.stringify(beforeDrag)!==JSON.stringify(state)){recordHistory(beforeDrag);saveLocal()}};
 document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});
});
$('sheets').addEventListener('pointermove',e=>{
 if(e.pointerType!=='touch'||!touchPoints.has(e.pointerId))return;
 touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touchPoints.size<2||!pinchStart)return;
 e.preventDefault();
 const [first,second]=touchPoints.values();
 zoom=zoomFromPinch(pinchStart.zoom,pinchStart.distance,Math.hypot(second.x-first.x,second.y-first.y));
 renderSheets();
},{passive:false});
const finishTouchPointer=e=>{
 if(e.pointerType!=='touch')return;
 touchPoints.delete(e.pointerId);
 if(touchPoints.size<2)pinchStart=null;
 if(touchPoints.size===0)pinchUsed=false;
};
$('sheets').addEventListener('pointerup',finishTouchPointer);
$('sheets').addEventListener('pointercancel',finishTouchPointer);
document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.add==='custom'){$('modalBg').classList.add('show');$('customTitle').focus();return}transact(()=>addSection(b.dataset.add))}));
$('confirmCustom').addEventListener('click',()=>{transact(()=>addSection('custom',$('customTitle').value.trim()||'Additional information',$('customContent').value));$('modalBg').classList.remove('show')});
$('cancelCustom').addEventListener('click',()=>$('modalBg').classList.remove('show'));
$('modalBg').addEventListener('click',e=>{if(e.target===$('modalBg'))$('modalBg').classList.remove('show')});
$('coverLetterBtn').addEventListener('click',openCoverLetter);$('closeCoverLetter').addEventListener('click',closeCoverLetter);$('coverLetterModalBg').addEventListener('click',e=>{if(e.target===$('coverLetterModalBg'))closeCoverLetter()});$('generateCoverLetter').addEventListener('click',generateCoverLetter);$('copyCoverLetter').addEventListener('click',copyCoverLetter);$('downloadCoverLetter').addEventListener('click',downloadCoverLetter);$('downloadCoverLetterPdf').addEventListener('click',previewCoverLetterPdf);
$('pageLayout').addEventListener('change',e=>transact(()=>state.layout=e.target.value==='two'?'two':'single'));
$('editMode').addEventListener('change',e=>transact(()=>{state.mode=e.target.value==='free'?'free':'flow'}));
$('zoomIn').addEventListener('click',()=>{zoom=Math.min(1.5,zoom+.05);renderSheets()});$('zoomOut').addEventListener('click',()=>{zoom=Math.max(.45,zoom-.05);renderSheets()});
$('undoBtn').addEventListener('click',undo);$('saveBtn').addEventListener('click',exportJSON);$('loadBtn').addEventListener('click',()=>$('jsonInput').click());$('jsonInput').addEventListener('change',e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value=''});
 $('googleSignInBtn').addEventListener('click',async()=>{
  try{await signInWithGoogle()}
  catch(error){toast(authErrorMessage(error))}
 });
 $('googleSignOutBtn').addEventListener('click',async()=>{
  try{await signOutUser();toast('Signed out. Your local browser copy is unchanged.')}
  catch(error){toast(error.message||'Could not sign out.')}
 });
 $('cloudResumesBtn').addEventListener('click',openCloudModal);
 $('closeCloudModal').addEventListener('click',closeCloudModal);
 $('closeCloudModalAction').addEventListener('click',closeCloudModal);
 $('cloudModalBg').addEventListener('click',event=>{if(event.target===$('cloudModalBg'))closeCloudModal()});
 $('refreshCloudResumes').addEventListener('click',refreshCloudResumes);
 $('saveCloudCopy').addEventListener('click',saveCurrentAsCloudCopy);
 $('cloudResumeList').addEventListener('click',event=>{
  const load=event.target.closest('[data-cloud-load]');
  const remove=event.target.closest('[data-cloud-delete]');
  if(load)openCloudResume(load.dataset.cloudLoad);
  if(remove)removeCloudResume(remove.dataset.cloudDelete);
 });
 $('pdfBtn').addEventListener('click',exportPDF);$('closePdfPreview').addEventListener('click',closePdfPreview);$('cancelPdfPreview').addEventListener('click',closePdfPreview);$('downloadPdfPreview').addEventListener('click',downloadPreviewPdf);$('pdfPreviewModalBg').addEventListener('click',e=>{if(e.target===$('pdfPreviewModalBg'))closePdfPreview()});$('atsBtn').addEventListener('click',openAts);$('atsFriendlyBtn').addEventListener('click',applyAtsFriendlyLayout);$('runAtsBtn').addEventListener('click',runAtsChecks);$('closeAts').addEventListener('click',closeAts);$('jobDescription').addEventListener('input',()=>{window.clearTimeout(window.atsDebounce);window.atsDebounce=setTimeout(runAtsChecks,250)});
$('docName').addEventListener('change',e=>transact(()=>state.docName=e.target.value.trim()||'Untitled resume'));
let resizing=null;
function gripDown(side){return e=>{if(side==='l'?leftCollapsed:collapsed){side==='l'?toggleLeft():togglePanel();return}resizing=side;e.preventDefault()}}
$('panelGrip').addEventListener('pointerdown',gripDown('r'));$('leftGrip').addEventListener('pointerdown',gripDown('l'));
document.addEventListener('pointermove',e=>{if(!resizing)return;if(resizing==='r')panelWidth=Math.max(RW[0],Math.min(RW[1],window.innerWidth-e.clientX));else leftWidth=Math.max(LW[0],Math.min(LW[1],e.clientX));applyPanels()});
document.addEventListener('pointerup',()=>{if(resizing){resizing=null;savePrefs()}});
$('collapseLeft').addEventListener('click',toggleLeft);$('expandLeft').addEventListener('click',toggleLeft);$('expandRight').addEventListener('click',togglePanel);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)){e.preventDefault();undo()}if(e.key==='Escape'){$('modalBg').classList.remove('show');closeAts();closeCoverLetter();closePdfPreview();closeCloudModal()}});
try{const raw=localStorage.getItem('resumeStudioV2')||localStorage.getItem('resumeStudioProject');if(raw)state=normalizeState(JSON.parse(raw))}catch(e){state=fresh()}
addEventListener('pagehide',()=>{try{localStorage.setItem('resumeStudioV2',JSON.stringify(state))}catch(e){}});
loadPrefs();if(window.matchMedia('(max-width:800px)').matches){leftCollapsed=true;collapsed=true}render();{const lc=leftCollapsed;setTab(leftTab);leftCollapsed=lc;applyPanels()}if(!cloudConfigured){updateCloudAccount(null,new Error('Add the Firebase web-app settings to enable cloud saving.'))}else observeAuth(updateCloudAccount);if(new URLSearchParams(location.search).get('tool')==='cover-letter')openCoverLetter()
})();
