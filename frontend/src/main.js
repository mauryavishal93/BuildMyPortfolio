import { estimateExperienceYears, GENERIC_ATS_WEIGHTING, weightedScore } from './ats-scoring.js';
import { buildCoverLetterDraft } from './cover-letter.js';
import { buildCoverLetterPdf } from './cover-letter-pdf.js';
import { alertModern, confirmModern, promptModern } from './modern-modal.js';
import {
 chooseAuthenticatedResume,
 createGuestResumeStorage,
 resolveAuthTransition,
 resumeStorageMode,
 shouldShowBrowserSaveToggle
} from './resume-persistence.js';
import { buildResumePdf, drawPdfText } from './resume-pdf.js';
import {
 cloudConfigured, deleteResume, getLastWorkedResumeId, googleSignInErrorMessage, listResumes, observeAuth, saveResume, setLastWorkedResumeId,
 signInWithGoogle, signOutUser
} from './firebase-cloud.js';
import { zoomFromPinch } from './zoom.js';
import { templateDefs } from '../../Templates/index.js';

(()=>{'use strict';
const $=id=>document.getElementById(id),deep=x=>JSON.parse(JSON.stringify(x)),uid=()=>Math.random().toString(36).slice(2,10);
const baseDocumentTitle=document.title;
const clamp=(v,min,max,def)=>{v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):def};
const PAGE_W=794,PAGE_H=1122,DEFAULT_MARGIN=32,FONTS=['Arial','Georgia','Verdana','Trebuchet MS','Times New Roman','Courier New'];
const KNOWN_TYPES=['summary','experience','education','skills','projects','certifications','custom'];
const makeSections=()=>{
  return [
    {id:uid(),type:'summary',title:'Professional Summary',visible:true,listStyle:'none',content:'Quality Engineering professional with experience in test automation, scalable test frameworks, and delivering reliable software. Skilled at collaborating across teams to improve product quality and release confidence.'},
    {id:uid(),type:'experience',title:'Work Experience',visible:true,entries:[{role:'Senior QA Automation Engineer',company:'Example Technology Company',date:'2022 — Present',details:'Designed and maintained scalable UI and API automation suites.\nImproved regression reliability and reduced repetitive manual effort.\nCollaborated with developers and product teams to resolve release risks.'},{role:'QA Engineer',company:'Previous Company',date:'2019 — 2022',details:'Built automated tests and reusable test utilities.\nReported defects with clear reproduction steps and impact analysis.'}]},
    {id:uid(),type:'skills',title:'Technical Skills',visible:true,content:'Playwright, Selenium, JavaScript, TypeScript, API Testing, CI/CD, SQL, Git, Test Strategy'},
    {id:uid(),type:'education',title:'Education',visible:true,entries:[{role:'Bachelor of Engineering',company:'University Name',date:'2015 — 2019',details:'Relevant coursework, projects or academic achievements.'}]},
    {id:uid(),type:'projects',title:'Selected Projects',visible:true,entries:[{role:'Automation Framework Modernization',company:'Personal / Professional Project',date:'2024',details:'Created reusable automation components and reporting workflows.\nIntegrated test execution into a repeatable CI process.'}]},
    {id:uid(),type:'certifications',title:'Certifications',visible:true,content:'Add relevant certifications, courses, or professional training.'}
  ];
};
const fresh=()=>({version:4,docName:'Untitled resume',template:'classic',layout:'single',mode:'flow',freePageCount:1,profile:{name:'Name Surname',headline:'Engineer',email:'abc@xyz.com',phone:'+91 98765 43210',location:'Bengaluru, India',website:'linkedin.com/in/abcxyz/',photo:''},design:{accent:'#31547a',font:'Arial',fontSize:12,headingSize:15,margin:DEFAULT_MARGIN,marginY:DEFAULT_MARGIN,pageNumbers:true,headerAlign:'',photoAlign:''},sections:makeSections(),positions:{}});
const str=v=>typeof v==='string'?v:'';
/* Validates + upgrades any project (import or autosave). Throws on files that are not projects. */
function normalizeState(d){
 if(!d||typeof d!=='object'||!d.profile||typeof d.profile!=='object'||!Array.isArray(d.sections)||!d.design||typeof d.design!=='object')throw Error('This is not a valid PersonaCraftPro project.');
 const base=fresh(),ver=Number(d.version)||1,out={...base,version:4};
 out.docName=str(d.docName).trim()?str(d.docName).slice(0,120):base.docName;
 out.template=templateDefs.some(t=>t.id===d.template)?d.template:base.template;
 out.layout=d.layout==='two'?'two':'single';out.mode=d.mode==='free'?'free':'flow';out.freePageCount=Math.round(clamp(d.freePageCount,1,100,1));
 out.profile={...base.profile};for(const k of Object.keys(base.profile))if(typeof d.profile[k]==='string')out.profile[k]=d.profile[k];
 if(out.profile.photo&&!/^data:image\//.test(out.profile.photo))out.profile.photo='';
 const ds=d.design;let mx=clamp(ds.margin,0,100,DEFAULT_MARGIN),my=clamp(ds.marginY!==undefined?ds.marginY:ds.margin,0,100,DEFAULT_MARGIN);
 if(ver<3){if(mx===56)mx=DEFAULT_MARGIN;if(my===56)my=DEFAULT_MARGIN}   /* old 56px default -> new tighter default */
 out.design={accent:/^#[0-9a-f]{6}$/i.test(str(ds.accent))?ds.accent:base.design.accent,font:FONTS.includes(ds.font)?ds.font:'Arial',fontSize:clamp(ds.fontSize,8,24,12),headingSize:clamp(ds.headingSize,10,28,15),margin:mx,marginY:my,pageNumbers:ds.pageNumbers!==false,headerAlign:['left','center','right'].includes(ds.headerAlign)?ds.headerAlign:'',photoAlign:['left','center','right'].includes(ds.photoAlign)?ds.photoAlign:''};
 const seen=new Set();
 out.sections=d.sections.filter(s=>s&&typeof s==='object').map(s=>{
  const type=KNOWN_TYPES.includes(s.type)?s.type:'custom';let id=str(s.id)||uid();while(seen.has(id))id=uid();seen.add(id);
  const normalizedListStyle=['none','bullet','number','arrow','check','dash','diamond'].includes(s.listStyle)?s.listStyle:(type==='summary'?'none':'bullet');
  const n={id,type,title:str(s.title).trim()?str(s.title):'Untitled section',visible:s.visible!==false,listStyle:(type==='summary'&&ver<4&&normalizedListStyle==='bullet')?'none':normalizedListStyle,textColor:/^#[0-9a-f]{6}$/i.test(str(s.textColor))?s.textColor:''};
  if(['experience','education','projects'].includes(type)||Array.isArray(s.entries))n.entries=(Array.isArray(s.entries)?s.entries:[]).filter(e=>e&&typeof e==='object').map(e=>({role:str(e.role),company:str(e.company),date:str(e.date),details:str(e.details)}));
  else n.content=str(s.content);
  return n});
 out.positions={};const pos=d.positions||d.freePositions;
 if(pos&&typeof pos==='object')for(const [k,p] of Object.entries(pos)){if(!seen.has(k)||!p||typeof p!=='object')continue;const x=Number(p.x),y=Number(p.y),w=Number(p.w);if(![x,y,w].every(Number.isFinite))continue;if(ver<3&&x===0&&w===610)continue;const position={x:clamp(x,0,PAGE_W,0),y:clamp(y,0,PAGE_H,0),w:clamp(w,80,PAGE_W,610),page:Math.round(clamp(p.page,1,100,1))},h=Number(p.h);if(Number.isFinite(h)&&h>0)position.h=clamp(h,30,PAGE_H,30);out.positions[k]=position;out.freePageCount=Math.max(out.freePageCount,position.page)}
 return out;
}
let state=fresh(),selectedId=null,zoom=1,history=[],redoHistory=[],draggingId=null,saveTimer=null,panelWidth=260,collapsed=false,leftWidth=260,leftCollapsed=false,leftTab='templates',rightTab='design',touchPoints=new Map(),pinchStart=null,pinchUsed=false,onboardingDismissed=false,customSectionTrigger=null,inspectorEntriesExpanded=false;
let localPersistenceBlocked=false,recoverySnapshot=null;
const browserStorage={getItem:(...args)=>window.localStorage.getItem(...args),setItem:(...args)=>window.localStorage.setItem(...args),removeItem:(...args)=>window.localStorage.removeItem(...args)};
const guestResumeStorage=createGuestResumeStorage(browserStorage,normalizeState);
let lastWorkedResumeWrite=Promise.resolve();
let guestResumeLoaded=false,guestResumeDirty=false,authGeneration=0,authStateResolved=false,cloudSessionGeneration=0,cloudReady=false,cloudDraftDirty=false;
let cloudUser=null,activeCloudResumeId=null,activeCloudRevision=null,cloudSaveTimer=null,cloudSaving=false,cloudSavePending=false,cloudSaveBlocked=false,cloudResumes=[],openCloudOnAuth=new URLSearchParams(location.search).get('open')==='cloud';
let signOutPending=false;
let pdfPreviewUrl=null,pdfPreviewBlob=null,pdfPreviewFilename='',pdfPreviewGeneration=0;
const $esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=v=>String(v||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
const detailLines=v=>String(v||'').replace(/\r\n?/g,'\n').split('\n');
function pointerMarker(style,index){return style==='number'?`${index+1}.`:({bullet:'•',arrow:'→',check:'✓',dash:'–',diamond:'◆'}[style]||'')}
function renderDetailInputs(entry,index){const style=sectionById(selectedId)?.listStyle||'bullet';return detailLines(entry.details).map((line,lineIndex)=>`<div class="detail-bullet-row"><span class="detail-bullet-marker" aria-hidden="true">${pointerMarker(style,lineIndex)}</span><input aria-label="Detail bullet ${lineIndex+1}" data-entry-detail-line data-index="${index}" data-line="${lineIndex}" value="${$esc(line)}"><button class="detail-bullet-remove" type="button" data-remove-detail-line="${lineIndex}" data-index="${index}" aria-label="Remove bullet ${lineIndex+1}" title="Remove bullet">×</button></div>`).join('')}
function renderPointerInputs(section){return detailLines(section.content).map((line,lineIndex)=>`<div class="detail-bullet-row"><span class="detail-bullet-marker" aria-hidden="true">${pointerMarker(section.listStyle,lineIndex)}</span><input aria-label="Pointer line ${lineIndex+1}" data-section-pointer-line data-section-id="${$esc(section.id)}" data-line="${lineIndex}" value="${$esc(line)}"><button class="detail-bullet-remove" type="button" data-remove-pointer-line="${lineIndex}" data-section-id="${$esc(section.id)}" aria-label="Remove line ${lineIndex+1}" title="Remove line">×</button></div>`).join('')}
function insertEntryDetailLine(index,afterLine){
 const section=sectionById(selectedId),entry=section?.entries?.[index];if(!entry)return;
 const details=detailLines(entry.details);
 let lineIndex;
 if(Number.isInteger(afterLine)){lineIndex=Math.min(afterLine+1,details.length);details.splice(lineIndex,0,'')}
 else if(details.length===1&&!details[0])lineIndex=0;
 else{lineIndex=details.length;details.push('')}
 entry.details=details.join('\n');saveLocal();
 const list=$('inspector').querySelector(`[data-entry-details="${index}"]`);if(list)list.innerHTML=renderDetailInputs(entry,index);
 renderSheets();
 requestAnimationFrame(()=>$('inspector').querySelector(`[data-entry-detail-line][data-index="${index}"][data-line="${lineIndex}"]`)?.focus());
}
function insertPointerLine(sectionId,afterLine){
 const section=sectionById(sectionId);if(!section)return;
 const contentLines=detailLines(section.content);
 let lineIndex;
 if(Number.isInteger(afterLine)){lineIndex=Math.min(afterLine+1,contentLines.length);contentLines.splice(lineIndex,0,'')}
 else if(contentLines.length===1&&!contentLines[0])lineIndex=0;
 else{lineIndex=contentLines.length;contentLines.push('')}
 section.content=contentLines.join('\n');saveLocal();
 const list=$('inspector').querySelector(`[data-pointer-lines="${sectionId}"]`);if(list)list.innerHTML=renderPointerInputs(section);
 renderSheets();
 requestAnimationFrame(()=>$('inspector').querySelector(`[data-section-pointer-line][data-section-id="${sectionId}"][data-line="${lineIndex}"]`)?.focus());
}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2300)}
function authErrorMessage(error){
 return googleSignInErrorMessage(error);
}
function setSaveState(message){
  const node=$('saveState');
  if(!node)return;
  node.textContent=message;
  const wrap=node.closest('.save-state');
  if(wrap){
    const reduced=String(message).toLowerCase();
    wrap.dataset.state=reduced.includes('saving')?'saving':reduced.includes('unable')||reduced.includes(' off')||reduced.includes('unavailable')||reduced.includes('recovery')?'warning':reduced.includes('cloud')||reduced.includes('browser')||reduced.includes('saved')?'saved':'warning';
  }
}
function currentSaveStateLabel(){
  if(cloudUser)return cloudSaveBlocked?'Unable to save changes':'All changes saved';
  return guestResumeStorage.enabled?'Saved locally':'Browser saving is off. Refreshing will discard your resume.';
}
function updateBrowserPersistenceUI(){
 const toggle=$('browserSaveControl'),input=$('browserSaveToggle');
 if(toggle)toggle.hidden=!shouldShowBrowserSaveToggle(cloudUser,authStateResolved);
 if(input)input.checked=guestResumeStorage.enabled;
 if(!cloudUser&&!saveTimer&&!localPersistenceBlocked)setSaveState(currentSaveStateLabel());
}
function scheduleCloudSave(){
 if(!cloudUser||!cloudReady||cloudSaveBlocked)return;
 clearTimeout(cloudSaveTimer);
 cloudSaveTimer=setTimeout(persistCloudResume,700);
}
async function rememberLastWorkedResume(uid,resumeId,generation=cloudSessionGeneration){
 if(!resumeId||cloudUser?.uid!==uid||cloudSessionGeneration!==generation)return;
 const write=lastWorkedResumeWrite.catch(()=>{}).then(async()=>{
  if(cloudUser?.uid!==uid||cloudSessionGeneration!==generation)return;
  await setLastWorkedResumeId(uid,resumeId);
 });
 lastWorkedResumeWrite=write;
 try{
  await write;
 }catch(error){
  if(cloudUser?.uid!==uid||cloudSessionGeneration!==generation)return;
  console.error('Could not remember the last-opened cloud resume.',error);
  toast('Your resume is saved, but we could not remember it as your last-opened resume.');
 }
}
async function persistCloudResume(){
 if(!cloudUser||!cloudReady||cloudSaveBlocked)return;
 if(cloudSaving){cloudSavePending=true;return}
 const uid=cloudUser.uid,id=activeCloudResumeId,generation=cloudSessionGeneration,snapshot=deep(state),expectedRevision=id?activeCloudRevision:null;
 cloudSaving=true;
 setSaveState('Saving…');
 try{
  const result=await saveResume(uid,id,snapshot.docName,snapshot,expectedRevision);
  if(cloudSessionGeneration===generation&&cloudUser?.uid===uid){
   activeCloudResumeId=result.id;
   activeCloudRevision=result.revision;
   void rememberLastWorkedResume(uid,result.id,generation);
   if(JSON.stringify(snapshot)===JSON.stringify(state)){cloudDraftDirty=false;setSaveState('All changes saved')}
   else cloudSavePending=true;
  }
 }catch(error){
  if(cloudSessionGeneration===generation&&cloudUser?.uid===uid){
   cloudSaveBlocked=true;
   setSaveState('Unable to save changes');
   $('saveState').title=error.message||'Could not save this resume to the cloud.';
  }
 }finally{
  cloudSaving=false;
  if(cloudSavePending&&!cloudSaveBlocked){cloudSavePending=false;scheduleCloudSave()}
 }
}
function saveLocal(syncCloud=true){
 const persistenceMode=resumeStorageMode(cloudUser,guestResumeStorage.enabled);
 if(persistenceMode==='cloud'){
  cloudDraftDirty=true;
  if(syncCloud)scheduleCloudSave();
  if(cloudSaveBlocked)setSaveState('Unable to save changes');
  else setSaveState('Saving…');
  if(cloudReady&&syncCloud)scheduleCloudSave();
  return;
 }
 guestResumeDirty=true;
 if(persistenceMode==='memory'){setSaveState(currentSaveStateLabel());return}
 if(localPersistenceBlocked){setSaveState('Local recovery needed');return}
 setSaveState('Saving…');
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{
  if(cloudUser||!guestResumeStorage.enabled)return;
  try{
   guestResumeStorage.save(state);
   setSaveState(currentSaveStateLabel());
   guestResumeLoaded=true;
   if(guestResumeStorage.preferenceError)setSaveState('Unable to save changes');
  }catch(error){setSaveState('Local save unavailable');toast('Could not save this resume in this browser.')}
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
 const uid=cloudUser.uid,generation=cloudSessionGeneration;
 const suggested=state.docName||'Untitled resume';
 const name=await promptModern({
  title:'Name this cloud resume',
  message:'Choose a name for this saved cloud copy.',
  defaultValue:suggested,
  placeholder:'Resume name',
  confirmText:'Save',
  cancelText:'Cancel'
 });
 if(name===null)return;
 if(cloudUser?.uid!==uid||cloudSessionGeneration!==generation)return;
 const cleanName=String(name).trim().slice(0,120)||'Untitled resume';
 const copy=deep(state);
 copy.docName=cleanName;
 try{
  const result=await saveResume(uid,null,cleanName,copy,null);
  if(cloudUser?.uid!==uid||cloudSessionGeneration!==generation)return;
  cloudSessionGeneration++;
  activeCloudResumeId=result.id;
  activeCloudRevision=result.revision;
  cloudSaveBlocked=false;
  state=copy;
  selectedId=null;
  history=[];redoHistory=[];
  render();
  void rememberLastWorkedResume(uid,result.id,cloudSessionGeneration);
  setSaveState('All changes saved');
  await refreshCloudResumes();
  toast('Cloud resume saved. Future edits will sync automatically.');
 }catch(error){toast(error.message||'Could not save this resume to the cloud.')}
}
function openCloudResume(id){
 const item=cloudResumes.find(resume=>resume.id===id);
 if(!item)return;
 try{
  cloudSessionGeneration++;
  clearTimeout(cloudSaveTimer);
  cloudSavePending=false;
  state=normalizeState(item.state);
  activeCloudResumeId=item.id;
  activeCloudRevision=item.revision;
  cloudSaveBlocked=false;
  history=[];redoHistory=[];
  selectedId=null;
  render();
  void rememberLastWorkedResume(cloudUser.uid,item.id,cloudSessionGeneration);
  setSaveState('All changes saved');
  closeCloudModal();
  toast('Cloud resume opened. Future edits will sync automatically.');
 }catch(error){toast(`Could not open this cloud resume: ${error.message}`)}
}
async function removeCloudResume(id){
 const item=cloudResumes.find(resume=>resume.id===id);
 if(!item||!cloudUser)return;
 const uid=cloudUser.uid,generation=cloudSessionGeneration;
 const confirmed=await confirmModern({
  title:'Delete cloud resume?',
  message:`Delete "${item.name||'Untitled resume'}" from your cloud resumes? This cannot be undone.`,
  confirmText:'OK',
  cancelText:'Cancel'
 });
 if(!confirmed)return;
 if(cloudUser?.uid!==uid||cloudSessionGeneration!==generation)return;
 try{
  await deleteResume(uid,id);
  if(cloudUser?.uid!==uid||cloudSessionGeneration!==generation)return;
  if(activeCloudResumeId===id){
   cloudSessionGeneration++;
   clearTimeout(cloudSaveTimer);
   activeCloudResumeId=null;activeCloudRevision=null;cloudSaveBlocked=false;
   state=fresh();selectedId=null;history=[];redoHistory=[];render();
   setSaveState('All changes saved');
  }
  await refreshCloudResumes();
  toast('Cloud resume deleted.');
 }catch(error){toast(error.message||'Could not delete this cloud resume.')}
}
async function updateCloudAccount(user,error){
 authStateResolved=true;
 if(error){
  $('googleSignInBtn').disabled=true;
  $('googleSignInLabel').textContent='Cloud setup needed';
  $('googleSignInBtn').title=error.message;
  $('cloudActions').hidden=false;
  $('accountMenu').hidden=false;
  $('cloudResumesBtn').hidden=true;
  $('googleSignOutBtn').hidden=true;
  $('accountUserName').textContent='Guest';
  $('accountUserEmail').textContent='';
  $('accountAvatar').textContent='G';
  $('accountAvatarLarge').textContent='G';
  $('accountMenu').querySelector('summary').setAttribute('aria-label','Account menu');
  $('cloudAccount').textContent=error.message;
  renderCloudResumes();
  renderTemplates();
  updateBrowserPersistenceUI();
  return;
 }
 const previousUser=cloudUser;
 const transition=resolveAuthTransition(previousUser?.uid,user?.uid);
 const accountChanged=transition!=='unchanged';
 const guestLogin=transition==='guest-login';
 const loggingOut=transition==='logout';
 const accountSwitch=transition==='account-switch';
 const hasGuestDraft=guestLogin&&(guestResumeLoaded||guestResumeDirty);
 const generation=accountChanged?++authGeneration:authGeneration;
 if(accountChanged){
  clearTimeout(saveTimer);
  clearTimeout(cloudSaveTimer);
  cloudSessionGeneration++;
  cloudReady=false;
  cloudDraftDirty=false;
  cloudSavePending=false;
  cloudSaveBlocked=false;
  activeCloudResumeId=null;
  activeCloudRevision=null;
  cloudResumes=[];
  if((guestLogin&&!localPersistenceBlocked)||accountSwitch){
   try{guestResumeStorage.clear()}
   catch(storageError){console.error('Could not clear the guest resume after sign-in.',storageError)}
  }
  if(accountSwitch||loggingOut){
   state=fresh();
   selectedId=null;
   history=[];redoHistory=[];
   guestResumeLoaded=false;
   guestResumeDirty=false;
   localPersistenceBlocked=false;
   recoverySnapshot=null;
   $('recoveryBanner').hidden=true;
   render();
  }
  if(loggingOut){
   try{guestResumeStorage.clear()}
   catch(storageError){console.error('Could not clear the account resume after sign-out.',storageError)}
  }
  if(guestLogin)guestResumeDirty=false;
 }
 cloudUser=user;
 $('googleSignInBtn').hidden=!!user;
 $('cloudActions').hidden=!!user;
 $('accountMenu').hidden=false;
 $('cloudResumesBtn').hidden=!user;
 $('googleSignOutBtn').hidden=!user;
 $('googleSignOutBtn').disabled=false;
 $('googleSignOutBtn').textContent='Sign out';
 if(user){
  const accountName=user.displayName?.trim()||user.email?.split('@')[0]||'Google user';
  const initial=Array.from(accountName)[0]?.toLocaleUpperCase()||'U';
  $('accountMenu').querySelector('summary').setAttribute('aria-label',`Account menu for ${accountName}`);
  $('accountUserName').textContent=accountName;
  $('accountUserEmail').textContent=user.email||'';
  $('accountAvatar').textContent=initial;
  $('accountAvatarLarge').textContent=initial;
 }else{
  $('accountUserName').textContent='Guest';
  $('accountUserEmail').textContent='';
  $('accountAvatar').textContent='G';
  $('accountAvatarLarge').textContent='G';
  $('accountMenu').querySelector('summary').setAttribute('aria-label','Account menu');
 }
 $('cloudAccount').textContent=user?`Signed in as ${user.email||user.displayName||'Google user'}. Cloud saves are private to this account.`:'Sign in to access your resumes across devices.';
 updateBrowserPersistenceUI();
 if(!user){
  cloudReady=false;
  setSaveState(currentSaveStateLabel());
  if(loggingOut&&guestResumeStorage.enabled)saveLocal(false);
  renderCloudResumes();
  renderTemplates();
  return;
 }
 if(accountChanged)setSaveState('Saving…');
 renderCloudResumes();
 renderTemplates();
 if(user){
  try{
   const resumes=await listResumes(user.uid);
   if(authGeneration!==generation||cloudUser?.uid!==user.uid)return;
   cloudResumes=resumes;
   let lastWorkedResumeId=null;
   try{
    lastWorkedResumeId=await getLastWorkedResumeId(user.uid);
    if(authGeneration!==generation||cloudUser?.uid!==user.uid)return;
   }catch(error){
    if(authGeneration!==generation||cloudUser?.uid!==user.uid)return;
    console.error('Could not load the last-opened cloud resume preference.',error);
    toast('Could not load your last-opened resume. Opening your most recently updated resume instead.');
   }
   const decision=chooseAuthenticatedResume({
    hasGuestDraft:hasGuestDraft||cloudDraftDirty,
    resumes,
    lastWorkedResumeId
   });
   if(decision.type==='open-cloud-resume'){
    const selectedResume=resumes.find(resume=>resume.id===decision.resumeId);
    state=normalizeState(selectedResume.state);
    activeCloudResumeId=selectedResume.id;
    activeCloudRevision=selectedResume.revision;
    void rememberLastWorkedResume(user.uid,selectedResume.id,cloudSessionGeneration);
    cloudDraftDirty=false;
    history=[];redoHistory=[];selectedId=null;
    render();
   }else{
    const snapshot=deep(state);
    const result=await saveResume(user.uid,null,snapshot.docName,snapshot,null);
    if(authGeneration!==generation||cloudUser?.uid!==user.uid)return;
    activeCloudResumeId=result.id;
    activeCloudRevision=result.revision;
    cloudDraftDirty=false;
    if(JSON.stringify(snapshot)!==JSON.stringify(state))cloudSavePending=true;
   }
   cloudReady=true;
   renderCloudResumes();
   if(openCloudOnAuth){
    openCloudOnAuth=false;
    history.replaceState(null,'',location.pathname+location.hash);
    openCloudModal();
   }
   setSaveState(cloudDraftDirty||cloudSavePending?'Saving…':'All changes saved');
   if(cloudSavePending)scheduleCloudSave();
  }catch(error){
   if(authGeneration!==generation||cloudUser?.uid!==user.uid)return;
   cloudReady=false;
   cloudSaveBlocked=true;
   setSaveState('Unable to save changes');
   $('saveState').title=error.message||'Could not load or save this resume to the cloud.';
   console.error('Could not initialize the signed-in resume.',error);
  }
  if(authGeneration===generation&&cloudUser?.uid===user.uid){
   renderTemplates();
  }
 }
}
function updateUndoButton(){const undoButton=$('undoBtn'),redoButton=$('redoBtn');if(undoButton)undoButton.disabled=history.length===0;if(redoButton)redoButton.disabled=redoHistory.length===0}
function recordHistory(snapshot){history.push(snapshot);if(history.length>50)history.shift();redoHistory=[];updateUndoButton()}
function transact(fn){const previous=deep(state);fn();if(JSON.stringify(previous)!==JSON.stringify(state))recordHistory(previous);render();saveLocal()}
function undo(){if(!history.length)return;redoHistory.push(deep(state));state=history.pop();if(!state.sections.some(s=>s.id===selectedId))selectedId=null;render();saveLocal();updateUndoButton();toast('Undo complete')}
function redo(){if(!redoHistory.length)return;history.push(deep(state));state=redoHistory.pop();if(!state.sections.some(s=>s.id===selectedId))selectedId=null;render();saveLocal();updateUndoButton();toast('Redo complete')}
function activeTemplate(){return templateDefs.find(t=>t.id===state.template)||templateDefs[0]}
function sectionById(id){return state.sections.find(s=>s.id===id)}
function websiteHref(value){
 const raw=String(value||'').trim();if(!raw)return '';
 try{const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}
}
function templateCardMarkup(t){
 const selected=state.template===t.id;
 const photo=t.photo&&t.id!=='photo'?`<span class="mini-photo" style="${t.photoPos==='left'?'left':'right'}:${t.photoPos==='center'?'calc(50% - 7px)':'8px'};${t.photoPos==='center'?'left:calc(50% - 7px);right:auto':''}"></span>`:'';
 const sidebar=t.layout==='two'||t.id==='interio-designer'?`<div style="float:left;width:30%;height:100%;background:${t.id==='interio-designer'?'#315f4b':t.accent};margin-right:5px">${t.id==='photo'||t.id==='interio-designer'?'<div style="width:16px;height:16px;border-radius:50%;background:#eee;margin:8px auto"></div>':''}</div>`:'';
 return `<div class="template-card"><button class="template ${selected?'active':''}" data-template="${t.id}" aria-pressed="${selected}" aria-label="${$esc(t.name)} template, free for everyone"><div class="mini" style="background:${t.id==='pastel'?'#fbf1f6':t.id==='bold'?'#fff7ed':'#f8f9fc'}">${photo}<div class="mini-main">${sidebar}<div class="mini-head" style="background:${t.accent}"></div><div class="mini-line" style="width:85%"></div><div class="mini-line" style="width:68%"></div><div class="mini-head" style="height:6px;width:60%;margin-top:10px;background:${t.accent}"></div><div class="mini-line"></div><div class="mini-line" style="width:75%"></div></div></div><span class="template-label-row"><strong>${$esc(t.name)}</strong><span class="template-availability">Free</span></span><small>${$esc(t.sub)}</small></button></div>`;
}
function renderTemplates(){
 $('templates').innerHTML=templateDefs.map(templateCardMarkup).join('');
}
function getSectionStarterOptions(){
  return [
    { type: 'summary', label: 'Add Summary' },
    { type: 'experience', label: 'Add Experience' }
  ];
}
function renderSectionList(){
 if(!state.sections.length){
  const starterOptions=getSectionStarterOptions();
  $('sectionList').innerHTML=`<div class="section-empty"><strong>No sections yet</strong><p>Start with a Summary or Experience section to build your first resume.</p><div class="section-empty-actions">${starterOptions.map(option=>`<button class="btn soft small" type="button" data-add="${option.type}">${option.label}</button>`).join('')}</div></div>`;
  return;
 }
 $('sectionList').innerHTML=state.sections.map(s=>`<div class="section-row ${s.id===selectedId?'active':''}" draggable="true" data-section-row="${$esc(s.id)}"><span class="grip" aria-hidden="true">⠿</span><span class="sect-name">${$esc(s.title)}</span><button class="vis" type="button" data-toggle="${$esc(s.id)}" title="${s.visible?'Hide':'Show'} section" aria-label="${s.visible?'Hide':'Show'} ${$esc(s.title)}">${s.visible?'◉':'○'}</button><button class="section-delete" type="button" data-delete-section="${$esc(s.id)}" title="Delete ${$esc(s.title)}" aria-label="Delete ${$esc(s.title)}">×</button></div>`).join('');
}
function deleteSectionById(id){
 const section=state.sections.find(item=>item.id===id);
 if(!section)return;
 if(!window.confirm(`Delete “${section.title}” from this resume? This removes the section and its contents.`))return;
 transact(()=>{state.sections=state.sections.filter(item=>item.id!==id);delete state.positions[id];if(selectedId===id)selectedId=null});
 toast('Section deleted.');
}

/* ---------- Sheet construction ---------- */
function sheetHTML(index,cols){
 const p=state.profile,tmpl=activeTemplate();
 const hasPhoto=!!tmpl.photo,photoPos=['left','center','right'].includes(state.design.photoAlign)?state.design.photoAlign:(tmpl.photoPos||'right');
 const contact=[p.email?`<span contenteditable="true" spellcheck="true" data-profile-field="email" title="Click to edit email">${$esc(p.email)}</span>`:'',p.phone?`<span contenteditable="true" spellcheck="true" data-profile-field="phone" title="Click to edit phone">${$esc(p.phone)}</span>`:'',p.location?`<span contenteditable="true" spellcheck="true" data-profile-field="location" title="Click to edit location">${$esc(p.location)}</span>`:'',p.website?`<span contenteditable="true" spellcheck="true" data-profile-field="website" title="Click to edit website">${$esc(p.website)}</span>`:''].filter(Boolean).join('<span class="contact-separator"> · </span>');
 const photoMarkup=p.photo?`<img class="photo" src="${$esc(p.photo)}" alt="Profile photo">`:'<span class="photo photo-placeholder" role="img" aria-label="No profile photo uploaded"></span>';
 const head=index===0?`<header class="resume-header${hasPhoto?' has-photo':''}"${hasPhoto?` data-photo-pos="${photoPos}"`:''}>${hasPhoto?photoMarkup:''}<div class="header-text"><h1 class="name" contenteditable="true" spellcheck="true" data-profile-field="name" title="Click to edit your name">${$esc(p.name||'Your Name')}</h1><div class="headline" contenteditable="true" spellcheck="true" data-profile-field="headline" title="Click to edit your headline">${$esc(p.headline||'Professional Title')}</div><div class="contact" contenteditable="false" title="Edit contact details in the right panel">${contact}</div></div></header>`:'';
 if(tmpl.id==='teal-modern'){
  const initials=String(p.name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase()||'';
  const tealPhoto=p.photo
   ?`<img class="photo" src="${$esc(p.photo)}" alt="Profile photo">`
   :`<span class="photo photo-placeholder" role="img" aria-label="No profile photo uploaded">${$esc(initials)}</span>`;
  const contactFields=[['Location','location','⌖'],['Website','website','↗'],['Phone','phone','☎'],['Email','email','✉']]
   .filter(([,field])=>p[field])
   .map(([label,field,icon])=>`<div class="tr-contact-item"><span class="tr-contact-icon" aria-hidden="true">${icon}</span><span contenteditable="true" spellcheck="true" data-profile-field="${field}" title="Click to edit ${label.toLowerCase()}">${$esc(p[field])}</span></div>`)
   .join('');
  const profile=index===0?`<header class="tr-header"><div class="tr-header-art" aria-hidden="true"></div><div class="tr-header-copy"><div class="tr-kicker"><span></span>PROFILE</div><h1 class="tr-name" contenteditable="true" spellcheck="true" data-profile-field="name" title="Click to edit your name">${$esc(p.name||'Your Name')}</h1><div class="tr-title" contenteditable="true" spellcheck="true" data-profile-field="headline" title="Click to edit your headline">${$esc(p.headline||'Professional Title')}</div><div class="tr-header-rule"></div><div class="tr-contact-row">${contactFields}</div></div><div class="tr-photo-frame">${tealPhoto}</div></header>`:'';
  return `<div class="sheet-inner tr-sheet">${profile}<div class="tr-layout"><aside class="tr-sidebar"><div class="tr-sidebar-sections"></div></aside><main class="tr-main"><div class="sections-area"></div></main></div></div><div class="page-number"></div>`;
 }
 if(tmpl.id==='peach-mint'){
  const initials=String(p.name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase()||'';
  const peachPhoto=p.photo
   ?`<img class="photo" src="${$esc(p.photo)}" alt="Profile photo">`
   :`<span class="photo photo-placeholder" role="img" aria-label="No profile photo uploaded">${$esc(initials)}</span>`;
  const contactFields=[['Location','location'],['Website','website'],['Phone','phone'],['Email','email']]
   .filter(([,field])=>p[field])
   .map(([label,field])=>`<div class="pm-contact-item"><span class="pm-contact-icon" aria-hidden="true">${label==='Location'?'⌖':label==='Website'?'↗':label==='Phone'?'☎':'✉'}</span><div><span class="pm-contact-label">${label}</span><div contenteditable="true" spellcheck="true" data-profile-field="${field}" title="Click to edit ${label.toLowerCase()}">${$esc(p[field])}</div></div></div>`)
   .join('');
  const profile=index===0?`<header class="pm-profile">${peachPhoto}<h1 class="name" contenteditable="true" spellcheck="true" data-profile-field="name" title="Click to edit your name">${$esc(p.name||'Your Name')}</h1><div class="headline" contenteditable="true" spellcheck="true" data-profile-field="headline" title="Click to edit your headline">${$esc(p.headline||'Professional Title')}</div><span class="pm-name-underline"></span></header><div class="pm-contact">${contactFields}</div>`:'';
  return `<div class="sheet-inner pm-sheet"><aside class="pm-sidebar">${profile}<div class="pm-sidebar-sections"></div></aside><main class="pm-main"><div class="sections-area"></div></main></div><div class="page-number"></div>`;
 }
 if(tmpl.id==='interio-designer'){
  const initials=String(p.name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase()||'';
  const interioPhoto=p.photo
   ?`<img class="interio-photo" src="${$esc(p.photo)}" alt="Profile photo">`
   :`<span class="interio-photo interio-photo-placeholder" role="img" aria-label="No profile photo uploaded">${$esc(initials)}</span>`;
  const interioHeader=index===0?`<header class="resume-header"><h1 class="name" contenteditable="true" spellcheck="true" data-profile-field="name" title="Click to edit your name">${$esc(p.name||'Your Name')}</h1><div class="headline" contenteditable="true" spellcheck="true" data-profile-field="headline" title="Click to edit your headline">${$esc(p.headline||'Professional Title')}</div></header>`:'';
  const contactBlocks=[['Address','location'],['Phone','phone'],['Mail','email'],['Social Media','website']]
   .filter(([,field])=>p[field])
   .map(([label,field])=>`<div class="interio-contact-block"><h3>${label}</h3><p contenteditable="true" spellcheck="true" data-profile-field="${field}" title="Click to edit ${label.toLowerCase()}">${$esc(p[field])}</p></div>`)
   .join('');
  return `<div class="sheet-inner interio-layout"><div class="interio-resume-label">RESUME</div><aside class="interio-sidebar">${interioPhoto}${contactBlocks}<div class="interio-sidebar-sections"></div></aside><div class="interio-main">${interioHeader}<div class="sections-area">${cols?'<div class="section-columns"><div class="section-column"></div><div class="section-column"></div></div>':''}</div></div></div><div class="page-number"></div>`;
 }
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
 if(s.entries){for(const e of s.entries){const ls=detailLines(e.details);a.push({k:'entry',e});const hasDetail=ls.some(line=>line.trim());ls.forEach((t,i)=>{if(!hasDetail&&i===0)return;a.push({k:'li',e,t:t.trim(),detailIndex:i,blank:!t.trim()})})}}
 else if(s.type==='skills')String(s.content||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean).forEach(t=>a.push({k:'chip',t}));
 else String(s.content||'').replace(/\r\n?/g,'\n').split('\n').forEach((par,lineIndex)=>{a.push({k:'p',t:par,cont:false,lineIndex,blank:!par.trim()})});
 if(!a.length)a.push({k:'p',t:'',cont:false});
 return a;
}
function makeShell(s,cont){
 const sec=document.createElement('section');sec.className='resume-section pointer-'+(s.listStyle||'bullet')+(selectedId===s.id?' selected':'');sec.dataset.resumeSection=s.id;sec.dataset.sectionType=s.type;
 if(/^#[0-9a-f]{6}$/i.test(s.textColor||''))sec.style.setProperty('--section-text-color',s.textColor);
 sec.innerHTML=`${cont?'':`<h2 class="section-heading" contenteditable="true" spellcheck="true" data-section-title="${$esc(s.id)}" title="Click to edit this section title">${$esc(s.title)}</h2>`}<div class="section-body"></div>`;return sec;
}
/* Appends one atom and returns the element it created (so a failed fit can be undone). */
function appendAtom(shell,a,st,s){
 const body=shell.querySelector('.section-body');let el;
 const entryIndex=a.e&&s.entries?s.entries.indexOf(a.e):-1;
 if(a.k==='entry'){
  el=document.createElement('div');el.className='entry';
  if(!a.continuation)el.innerHTML=`<div class="entry-top"><span class="entry-title" contenteditable="true" spellcheck="true" data-section-id="${$esc(s.id)}" data-entry="${entryIndex}" data-entry-field="role" title="Click to edit role">${$esc(a.e.role)}</span><span class="entry-date" contenteditable="true" spellcheck="true" data-section-id="${$esc(s.id)}" data-entry="${entryIndex}" data-entry-field="date" title="Click to edit dates">${$esc(a.e.date)}</span></div>${a.e.company?`<div class="entry-sub" contenteditable="true" spellcheck="true" data-section-id="${$esc(s.id)}" data-entry="${entryIndex}" data-entry-field="company" title="Click to edit organization">${$esc(a.e.company)}</div>`:''}`;
  body.appendChild(el);st.ul=null;
 }else if(a.k==='li'){
  if(!st.ul){const last=body.lastElementChild;st.ul=document.createElement((s.listStyle||'bullet')==='number'?'ol':'ul');st.ul.className='pointer-list';(last||body).appendChild(st.ul)}
  el=document.createElement('li');el.contentEditable='true';el.spellcheck=true;el.title='Click to edit bullet';el.classList.toggle('blank-bullet',!!a.blank);el.dataset.sectionId=s.id;el.dataset.entry=entryIndex;el.dataset.entryField='detail';el.dataset.detailSource=a.t;el.dataset.detailIndex=String(a.detailIndex);el.textContent=a.t;st.ul.appendChild(el);
 }else if(a.k==='chip'){
  let l=body.querySelector('.skill-list');if(!l){l=document.createElement('div');l.className='skill-list';body.appendChild(l)}
  const skills=String(s.content||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean),skillIndex=skills.indexOf(a.t);
  el=document.createElement('span');el.className='skill';el.contentEditable='true';el.spellcheck=true;el.title='Click to edit skill';el.dataset.sectionId=s.id;el.dataset.skillIndex=String(skillIndex);el.textContent=a.t;l.appendChild(el);
 }else{el=document.createElement('p');if(a.cont)el.className='cont';if(a.blank){el.classList.add('blank-line');el.setAttribute('aria-placeholder',' ') }
   el.textContent=a.t;
   el.contentEditable='true';el.spellcheck=true;el.title='Click to edit text';el.dataset.sectionId=s.id;el.dataset.textSource=a.t;el.dataset.textIndex=String(a.lineIndex||0);
   body.appendChild(el)}
 return el;
}
function renderWhole(s){const shell=makeShell(s,false),st={};sectionAtoms(s).forEach(a=>appendAtom(shell,a,st,s));return shell}

/* ---------- Structured (flow) layout ----------
   Single column: one stream of content.  Two columns: two independent streams (wide / narrow),
   each filled top-to-bottom and continued on the next page. A section goes to its preferred column,
   then the other column, and only then to a new page. Everything is measured, never estimated. */
const MAIN_TYPES=new Set(['summary','experience']),SIDE_TYPES=new Set(['skills','education','certifications']);
function flowSections(root,tmpl){
 const two=state.layout==='two',pages=[],streams=Array.from({length:two?2:1},()=>({page:0}));
 const addPage=()=>{const p=createSheet(pages.length,tmpl,two);root.appendChild(p);pages.push(p);return p};
 addPage();
 const colOf=(si,pi,s)=>tmpl.id==='peach-mint'
  ?pages[pi].querySelector(s.type==='skills'||s.type==='certifications'?'.pm-sidebar-sections':'.pm-main .sections-area')
  :tmpl.id==='teal-modern'
   ?pages[pi].querySelector(s.type==='skills'?'.tr-sidebar-sections':'.tr-main .sections-area')
  :tmpl.id==='interio-designer'&&s.type==='skills'
   ?pages[pi].querySelector(pi===0?'.interio-sidebar-sections':'.interio-main .sections-area')
  :two?pages[pi].querySelectorAll('.section-column')[si]:pages[pi].querySelector('.sections-area');
 const limitOf=(pi,c)=>c.classList.contains('interio-sidebar-sections')
  ?c.getBoundingClientRect().bottom
  :c.classList.contains('pm-sidebar-sections')
   ?c.getBoundingClientRect().bottom
  :c.classList.contains('tr-sidebar-sections')
   ?c.getBoundingClientRect().bottom
  :c.closest('.sections-area').getBoundingClientRect().bottom-parseFloat(getComputedStyle(c.closest('.sections-area')).paddingBottom);
 const fits=(si,pi,s)=>{const c=colOf(si,pi,s),l=c.lastElementChild;return !l||l.getBoundingClientRect().bottom<=limitOf(pi,c)+.5};
 const fill=(si,s)=>{const st=streams[si],c=colOf(si,st.page,s),l=c.lastElementChild;return st.page*10000+(l?l.getBoundingClientRect().bottom-c.getBoundingClientRect().top:0)};
 const attempt=(si,pi,s,cont,first,force)=>{
  const shell=makeShell(s,cont),st={},container=colOf(si,pi,s);container.appendChild(shell);appendAtom(shell,first,st,s);
  if(fits(si,pi,s)||force)return {si,pi,shell,st,s};
  shell.remove();return null;
 };
 for(const s of state.sections.filter(x=>x.visible)){
  const atoms=sectionAtoms(s);let i=0,cont=false,cur=null,lastSi=0;
  const pref=tmpl.id==='peach-mint'?(s.type==='skills'||s.type==='certifications'?1:0):tmpl.id==='teal-modern'?(s.type==='skills'?1:0):!two?0:MAIN_TYPES.has(s.type)?0:SIDE_TYPES.has(s.type)?1:(fill(0,s)<=fill(1,s)?0:1);
  while(i<atoms.length){
   const a=atoms[i];
   if(cur){
    const el=appendAtom(cur.shell,a,cur.st,cur.s || s);
    if(fits(cur.si,cur.pi,cur.s)){i++;continue}
    el.remove();lastSi=cur.si;cur=null;cont=true;
   }
   const first=cont&&a.k==='li'?{k:'entry',e:a.e,continuation:true}:a;
   let placed=null;
   if(!cont){
    const order=two?(tmpl.id==='peach-mint'||tmpl.id==='teal-modern'?[pref]:[pref,1-pref]):[0];
    for(const si of order){placed=attempt(si,streams[si].page,s,false,first,false);if(placed)break}
    lastSi=pref;
   }
   if(!placed){
    const si=lastSi;streams[si].page++;if(streams[si].page>=pages.length)addPage();
    placed=attempt(si,streams[si].page,s,cont,first,true);   /* forced: a single block taller than a page is kept, never dropped */
    if(cont&&a.k==='li')appendAtom(placed.shell,a,placed.st,s);
   }
   cur=placed;i++;
  }
 }
}
function captureStructuredPages(){
 const sheets=[...$('sheets').querySelectorAll('.sheet')];
 if(!sheets.length)return;
 state.freePageCount=Math.max(state.freePageCount||1,sheets.length);
 const scaleFor=sheet=>sheet.getBoundingClientRect().width/PAGE_W||1;
 sheets.forEach((sheet,pageIndex)=>{
  const scale=scaleFor(sheet),bounds=sheet.getBoundingClientRect();
  sheet.querySelectorAll('[data-resume-section]').forEach(node=>{
   const id=node.dataset.resumeSection;
   if(state.positions[id])return;
   const rect=node.getBoundingClientRect();
   const x=clamp(Math.round((rect.left-bounds.left)/scale),0,PAGE_W-80,0);
   const y=clamp(Math.round((rect.top-bounds.top)/scale),0,PAGE_H-30,0);
   const w=clamp(Math.round(rect.width/scale),80,PAGE_W-x,PAGE_W-x);
   const h=clamp(Math.round(rect.height/scale),30,PAGE_H-y,30);
   state.positions[id]={x,y,w,h,page:pageIndex+1};
  });
 });
 state.freePageCount=Math.max(state.freePageCount,...Object.values(state.positions).map(position=>position.page||1));
}
function renderFree(root,tmpl){
 const pageCount=Math.max(1,...state.sections.filter(s=>s.visible).map(s=>state.positions[s.id]?.page||1)),pages=[];
 for(let index=0;index<pageCount;index++){const page=createSheet(index,tmpl,false);root.appendChild(page);pages.push(page)}
 const firstPage=pages[0],sheetBounds=firstPage.getBoundingClientRect(),firstArea=firstPage.querySelector('.sections-area'),areaBounds=firstArea.getBoundingClientRect(),scale=sheetBounds.width/PAGE_W||1,mx=clamp(state.design.margin,0,100,DEFAULT_MARGIN),padding=getComputedStyle(firstArea);
 const sidebar=tmpl.id==='interio-designer'?firstPage.querySelector('.interio-sidebar'):null;
 const peachSidebar=tmpl.id==='peach-mint'?firstPage.querySelector('.pm-sidebar'):null;
 const tealSidebar=tmpl.id==='teal-modern'?firstPage.querySelector('.tr-sidebar'):null;
 const defaultX=peachSidebar?Math.round((peachSidebar.getBoundingClientRect().right-sheetBounds.left)/scale+16):sidebar?Math.round((sidebar.getBoundingClientRect().right-sheetBounds.left)/scale+12):tealSidebar?Math.round((tealSidebar.getBoundingClientRect().right-sheetBounds.left)/scale+16):mx;
 const defaultW=Math.max(80,PAGE_W-defaultX-mx);
 const defaultY=Math.max(DEFAULT_MARGIN,Math.round((areaBounds.top-sheetBounds.top)/scale+parseFloat(padding.paddingTop)));
 const header=tmpl.id==='profile-split'?firstPage.querySelector('.resume-header'):tmpl.id==='teal-modern'?firstPage.querySelector('.tr-header'):null;
 const headerBottom=header?Math.ceil((header.getBoundingClientRect().bottom-sheetBounds.top)/scale+16):0;
 const firstPageDefaultY=Math.max(defaultY,headerBottom);
 const cursorByPage=Array.from({length:pageCount},(_,index)=>index===0?firstPageDefaultY:defaultY);
 const addPage=()=>{
  const page=createSheet(pages.length,tmpl,false);
  root.appendChild(page);pages.push(page);cursorByPage.push(defaultY);
  state.freePageCount=pages.length;
  return page;
 };
 const createFragment=(section,pageIndex,position,continued)=>{
  const page=pages[pageIndex],area=page.querySelector('.sections-area'),shell=makeShell(section,continued);
  shell.style.cssText+=`;position:absolute;margin:0;z-index:2;left:${position.x}px;top:${position.y}px;width:${position.w}px;${position.h?`min-height:${position.h}px`:''}`;
  if(!continued)shell.insertAdjacentHTML('beforeend','<button class="free-section-move" type="button" aria-label="Move section" title="Drag to move this section">Move</button><button class="free-section-resize" type="button" aria-label="Resize section" title="Drag to resize this section"></button>');
  area.appendChild(shell);
  return {page,shell,st:{},pageIndex};
 };
 state.sections.filter(s=>s.visible).forEach(s=>{
  let pos=state.positions[s.id],pageIndex=pos?Math.round(clamp(pos.page,1,pageCount,1))-1:0;
  if(!pos){
   const skillSidebar=tealSidebar&&s.type==='skills'?tealSidebar:null;
   const x=skillSidebar?Math.round((skillSidebar.getBoundingClientRect().left-sheetBounds.left)/scale+12):defaultX;
   const w=skillSidebar?Math.max(80,Math.round(skillSidebar.getBoundingClientRect().width/scale)-24):defaultW;
   pos=state.positions[s.id]={x,y:cursorByPage[pageIndex],w,page:pageIndex+1};
  }
  pageIndex=Math.round(clamp(pos.page,1,pages.length,1))-1;
  pos.page=pageIndex+1;
  if(peachSidebar&&pos.x<defaultX){
   pos.x=defaultX;
   pos.y=cursorByPage[pageIndex];
   pos.w=defaultW;
  }
  if(pageIndex===0&&pos.y<headerBottom)pos.y=headerBottom;
  let fragment=createFragment(s,pageIndex,pos,false);
  const firstFragment=fragment;
  let firstFragmentHeight=0;
  for(const atom of sectionAtoms(s)){
   let rendered=appendAtom(fragment.shell,atom,fragment.st,s);
   const pageBounds=fragment.page.getBoundingClientRect(),pageScale=pageBounds.width/PAGE_W||1;
   const bottom=pageBounds.bottom-(state.design.pageNumbers?32:16)*pageScale;
   if(Math.max(rendered.getBoundingClientRect().bottom,fragment.shell.getBoundingClientRect().bottom)<=bottom+.5){
    if(fragment===firstFragment)firstFragmentHeight=Math.max(firstFragmentHeight,firstFragment.shell.offsetHeight);
    continue;
   }
   const atomHeight=rendered.getBoundingClientRect().height;
   rendered.remove();
   if(atom.k==='li'){
    const list=fragment.shell.querySelector('.pointer-list');
    if(list&&!list.children.length)list.remove();
    fragment.st.ul=null;
   }
   const fragmentHasContent=fragment.shell.querySelector('.section-body').childElementCount>0;
   if(atomHeight>PAGE_H-80&&!fragmentHasContent){
    appendAtom(fragment.shell,atom,fragment.st,s);
    if(fragment===firstFragment)firstFragmentHeight=Math.max(firstFragmentHeight,firstFragment.shell.offsetHeight);
    continue;
   }
   if(fragment===firstFragment)firstFragmentHeight=Math.max(firstFragmentHeight,firstFragment.shell.offsetHeight);
   fragment.pageIndex++;
   if(fragment.pageIndex>=pages.length)addPage();
   if(fragmentHasContent){
    fragment=createFragment(s,fragment.pageIndex,{...pos,y:DEFAULT_MARGIN,h:0},true);
    if(atom.k==='li')appendAtom(fragment.shell,{k:'entry',e:atom.e,continuation:true},fragment.st,s);
   }else{
    fragment.shell.remove();
    fragment=createFragment(s,fragment.pageIndex,{...pos,y:DEFAULT_MARGIN,h:0},false);
   }
   if(atomHeight>PAGE_H-80){
    appendAtom(fragment.shell,atom,fragment.st,s);
   }else{
    rendered=appendAtom(fragment.shell,atom,fragment.st,s);
   }
  }
  cursorByPage[pageIndex]=Math.max(cursorByPage[pageIndex],pos.y+firstFragmentHeight+14);
 });
 state.freePageCount=pages.length;
}
function renderSheets(){
 const root=$('sheets'),tmpl=activeTemplate();root.innerHTML='';
 if(state.mode==='free')renderFree(root,tmpl);else flowSections(root,tmpl);
 const all=[...root.querySelectorAll('.sheet')];
 all.forEach(sh=>sh.dataset.mode=state.mode);
 all.forEach((sh,i)=>{
  sh.querySelector('.page-number').textContent=state.design.pageNumbers?`Page ${i+1} of ${all.length}`:'';
  sh.style.transform=zoom===1?'':`scale(${zoom})`;sh.style.marginBottom=zoom===1?'':((zoom-1)*PAGE_H)+'px';
 });
 $('hint').textContent=state.mode==='free'
  ?'Drag a section or use its Move handle; drag the bottom-right corner to resize. Set its page, position and size in Selected section.'
  :'Click any name, heading, bullet, skill, or paragraph on the page to edit · Use the right panel for design and photo details';
 $('zoomLabel').textContent=Math.round(zoom*100)+'%';
}
/* ---------- Inspector ---------- */
function field(label,key,value,type='text',extra=''){return `<div class="field"><label>${label}</label><input data-profile="${key}" type="${type}" value="${$esc(value)}" ${extra}></div>`}
function renderInspector(){
 const s=sectionById(selectedId),d=state.design,tmplHasPhoto=!!activeTemplate().photo;let h=`<div class="inspector-head"><h2>Design & properties</h2></div>
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
   h+=`<div class="eyebrow">Selected section</div><div class="field"><label>Section title</label><input id="sectionTitle" value="${$esc(s.title)}"></div><div class="field"><label for="sectionTextColor">Text color</label><div class="field-row"><input id="sectionTextColor" data-section-text-color type="color" value="${s.textColor||'#1b2434'}" aria-label="Section text color"><button class="btn outline small" id="resetSectionTextColor" type="button" ${s.textColor?'':'disabled'}>Use template color</button></div></div>`;
   if(state.mode==='free'){
    const position=state.positions[s.id]||{x:0,y:0,w:PAGE_W,h:0},node=$('sheets').querySelector(`[data-resume-section="${s.id}"]`),height=position.h||Math.ceil(node?.offsetHeight||80);
    h+=`<div class="eyebrow">Position & size (px)</div><div class="field"><label for="freeSectionPage">Page (of ${state.freePageCount})</label><input id="freeSectionPage" data-free-position="page" type="number" min="1" max="${state.freePageCount}" value="${position.page||1}"></div><div class="field-row"><div class="field"><label for="freeSectionX">Left</label><input id="freeSectionX" data-free-position="x" type="number" min="0" max="${PAGE_W-80}" value="${position.x}"></div><div class="field"><label for="freeSectionY">Top</label><input id="freeSectionY" data-free-position="y" type="number" min="0" max="${PAGE_H-30}" value="${position.y}"></div></div><div class="field-row"><div class="field"><label for="freeSectionWidth">Width</label><input id="freeSectionWidth" data-free-position="w" type="number" min="80" max="${PAGE_W-position.x}" value="${position.w}"></div><div class="field"><label for="freeSectionHeight">Minimum height</label><input id="freeSectionHeight" data-free-position="h" type="number" min="30" max="${PAGE_H-position.y}" value="${height}"></div></div><div class="small-note">Text wraps to the section width. Content can grow beyond its minimum height so it stays visible.</div>`;
   }
   h+=`<div class="field"><label>Line pointers</label><select id="sectionPointer">${[['bullet','• Bullet'],['number','1. Numbered'],['arrow','→ Arrow'],['check','✓ Check mark'],['dash','– Dash'],['diamond','◆ Diamond'],['none','No pointer']].map(([value,label])=>`<option value="${value}" ${(s.listStyle||'bullet')===value?'selected':''}>${label}</option>`).join('')}</select></div>`;
   if(s.entries){
    h+=s.entries.map((e,i)=>`<details class="inspector-entry"${i===0?' open':''}><summary><span>Entry ${i+1}</span><span class="inspector-entry-title" data-entry-summary="${i}">${$esc(e.role||e.company||'Add entry details')}</span></summary><div class="inspector-entry-content"><div class="field"><label>Role / qualification</label><input data-entry="role" data-index="${i}" value="${$esc(e.role)}"></div><div class="field"><label>Company / institution</label><input data-entry="company" data-index="${i}" value="${$esc(e.company)}"></div><div class="field"><label>Date</label><input data-entry="date" data-index="${i}" value="${$esc(e.date)}"></div><div class="field"><label>Details</label><div class="detail-bullet-list" data-entry-details="${i}">${renderDetailInputs(e,i)}</div><button class="btn outline small" type="button" data-add-detail-line="${i}">＋ Add bullet</button></div><button class="btn danger small" data-remove-entry="${i}">Remove entry</button></div></details>`).join('');
     h+='<button class="btn outline small" id="addEntry">＋ Add entry</button>';
  }else if(s.type!=='skills'&&s.listStyle!=='none')h+=`<div class="field"><label>Pointer lines</label><div class="detail-bullet-list" data-pointer-lines="${$esc(s.id)}">${renderPointerInputs(s)}</div><button class="btn outline small" type="button" data-add-pointer-line="${$esc(s.id)}">＋ Add line</button></div>`;
  else h+=`<div class="field"><label>Content (use new lines for paragraphs; comma-separated skills work too)</label><textarea id="sectionContent">${$esc(s.content||'')}</textarea></div>`;
   h+='<div class="field-row" style="margin-top:12px"><button class="btn outline small" id="duplicateSection">Duplicate section</button><button class="btn danger small" id="deleteSection">Delete section</button></div>';
 }else if(rightTab==='section')h+='<div class="small-note">Choose a section in the list or click a section on the resume to edit its content.</div>';
 $('inspector').innerHTML=h;
 $('inspector').querySelectorAll('.inspector-entry').forEach((entry,index)=>{entry.open=inspectorEntriesExpanded||index===0});
 $('inspector').querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('input',()=>{state.profile[el.dataset.profile]=el.value;saveLocal();document.querySelectorAll('[data-profile-field]').forEach(sheetField=>{if(sheetField.dataset.profileField===el.dataset.profile&&sheetField!==document.activeElement)sheetField.textContent=el.value})}));
 $('inspector').querySelectorAll('[data-design]').forEach(el=>el.addEventListener('change',()=>{
  const k=el.dataset.design;let v;
  if(el.type==='checkbox')v=el.checked;
  else if(el.type==='number'){v=Number(el.value);if(el.value===''||!Number.isFinite(v)){renderInspector();return}v=clamp(v,Number(el.min),Number(el.max),state.design[k])}
  else v=el.value;
  transact(()=>{state.design[k]=v});
 }));
 $('inspector').querySelectorAll('[data-free-position]').forEach(el=>el.addEventListener('change',()=>{
  if(state.mode!=='free')return;
  const section=sectionById(selectedId);if(!section)return;
  const current=state.positions[section.id]||{x:0,y:0,w:PAGE_W};
  transact(()=>{
   const next={...current},key=el.dataset.freePosition,value=Number(el.value);
   if(!Number.isFinite(value)){renderInspector();return}
   if(key==='x')next.x=clamp(value,0,PAGE_W-80,current.x);
   else if(key==='y')next.y=clamp(value,0,PAGE_H-30,current.y);
   else if(key==='w')next.w=clamp(value,80,PAGE_W-next.x,current.w);
   else if(key==='h')next.h=clamp(value,30,PAGE_H-next.y,current.h||30);
   else if(key==='page')next.page=Math.round(clamp(value,1,state.freePageCount,current.page||1));
   if(next.x+next.w>PAGE_W)next.w=PAGE_W-next.x;
   state.positions[section.id]=next;
  });
 }));
 const photo=$('photoInput');photo?.addEventListener('change',()=>{const f=photo.files&&photo.files[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>8*1024*1024){toast('Choose an image under 8 MB');return}const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const scale=Math.min(1,500/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,im.width*scale);c.height=Math.max(1,im.height*scale);c.getContext('2d').drawImage(im,0,0,c.width,c.height);transact(()=>state.profile.photo=c.toDataURL('image/jpeg',.84))};im.onerror=()=>toast('That image could not be read');im.src=String(r.result)};r.readAsDataURL(f)});
 $('removePhoto')?.addEventListener('click',()=>transact(()=>state.profile.photo=''));
 $('sectionTitle')?.addEventListener('input',e=>{const x=sectionById(selectedId);if(x)x.title=e.target.value||'Untitled section';saveLocal();syncSheetFields();});
 $('sectionTextColor')?.addEventListener('change',e=>{const x=sectionById(selectedId),color=e.target.value;if(!x||!/^#[0-9a-f]{6}$/i.test(color))return;transact(()=>{x.textColor=color})});
 $('resetSectionTextColor')?.addEventListener('click',()=>{const x=sectionById(selectedId);if(!x)return;transact(()=>{x.textColor=''})});
 $('sectionPointer')?.addEventListener('change',e=>{const x=sectionById(selectedId);if(!x)return;x.listStyle=e.target.value;saveLocal();renderSheets();renderInspector();});
 $('sectionContent')?.addEventListener('input',e=>{const x=sectionById(selectedId);if(x)x.content=e.target.value;saveLocal();syncSheetFields();});
 $('inspector').querySelectorAll('[data-entry]').forEach(el=>el.addEventListener('input',()=>{const x=sectionById(selectedId),i=+el.dataset.index;if(!x?.entries?.[i])return;x.entries[i][el.dataset.entry]=el.value;if(el.dataset.entry==='role'||el.dataset.entry==='company')updateInspectorEntryTitle(i,x.entries[i]);saveLocal();syncSheetFields();}));
 $('inspector').oninput=event=>{
  const detailInput=event.target.closest('[data-entry-detail-line]');
  if(detailInput){const x=sectionById(selectedId),i=+detailInput.dataset.index,lineIndex=+detailInput.dataset.line;if(!x?.entries?.[i])return;const details=detailLines(x.entries[i].details);details[lineIndex]=detailInput.value;x.entries[i].details=details.join('\n');saveLocal();renderSheets();return}
  const pointerInput=event.target.closest('[data-section-pointer-line]');
  if(pointerInput){const section=sectionById(pointerInput.dataset.sectionId),lineIndex=+pointerInput.dataset.line;if(!section)return;const contentLines=detailLines(section.content);contentLines[lineIndex]=pointerInput.value;section.content=contentLines.join('\n');saveLocal();renderSheets()}
 };
 $('inspector').onkeydown=event=>{
  if(event.key!=='Enter')return;
  const detailInput=event.target.closest('[data-entry-detail-line]');
  if(detailInput){event.preventDefault();const x=sectionById(selectedId),i=+detailInput.dataset.index,lineIndex=+detailInput.dataset.line;if(!x?.entries?.[i])return;const details=detailLines(x.entries[i].details);details[lineIndex]=detailInput.value;x.entries[i].details=details.join('\n');insertEntryDetailLine(i,lineIndex);return}
  const pointerInput=event.target.closest('[data-section-pointer-line]');
  if(pointerInput){event.preventDefault();const section=sectionById(pointerInput.dataset.sectionId),lineIndex=+pointerInput.dataset.line;if(!section)return;const contentLines=detailLines(section.content);contentLines[lineIndex]=pointerInput.value;section.content=contentLines.join('\n');insertPointerLine(section.id,lineIndex)}
 };
 $('inspector').onclick=event=>{
  const detailButton=event.target.closest('[data-remove-detail-line]');
  if(detailButton){const x=sectionById(selectedId),i=+detailButton.dataset.index,lineIndex=+detailButton.dataset.removeDetailLine;if(!x?.entries?.[i])return;const details=detailLines(x.entries[i].details);details.splice(lineIndex,1);if(!details.length)details.push('');x.entries[i].details=details.join('\n');saveLocal();const list=$('inspector').querySelector(`[data-entry-details="${i}"]`);if(list)list.innerHTML=renderDetailInputs(x.entries[i],i);renderSheets();$('inspector').querySelector(`[data-entry-detail-line][data-index="${i}"][data-line="${Math.min(lineIndex,details.length-1)}"]`)?.focus();return}
  const pointerButton=event.target.closest('[data-remove-pointer-line]');
  if(pointerButton){const section=sectionById(pointerButton.dataset.sectionId),lineIndex=+pointerButton.dataset.removePointerLine;if(!section)return;const contentLines=detailLines(section.content);contentLines.splice(lineIndex,1);if(!contentLines.length)contentLines.push('');section.content=contentLines.join('\n');saveLocal();const list=$('inspector').querySelector(`[data-pointer-lines="${section.id}"]`);if(list)list.innerHTML=renderPointerInputs(section);renderSheets();$('inspector').querySelector(`[data-section-pointer-line][data-section-id="${section.id}"][data-line="${Math.min(lineIndex,contentLines.length-1)}"]`)?.focus();}
 };
 $('inspector').querySelectorAll('[data-add-pointer-line]').forEach(button=>button.addEventListener('click',()=>insertPointerLine(button.dataset.addPointerLine)));
 $('inspector').querySelectorAll('[data-add-detail-line]').forEach(button=>button.addEventListener('click',()=>insertEntryDetailLine(+button.dataset.addDetailLine)));
 $('inspector').querySelectorAll('[data-remove-entry]').forEach(el=>el.addEventListener('click',()=>transact(()=>{const x=sectionById(selectedId);if(x)x.entries.splice(+el.dataset.removeEntry,1)})));
 $('addEntry')?.addEventListener('click',()=>transact(()=>{const x=sectionById(selectedId);if(x)x.entries.push({role:'New role',company:'Organization',date:'Year',details:'Add details here.'})}));
 $('duplicateSection')?.addEventListener('click',()=>transact(()=>{const i=state.sections.findIndex(x=>x.id===selectedId);if(i>=0){const n=deep(state.sections[i]);n.id=uid();n.title+=' (copy)';state.sections.splice(i+1,0,n);selectedId=n.id}}));
 $('deleteSection')?.addEventListener('click',()=>deleteSectionById(selectedId));
 $('inspector').querySelectorAll('[data-rtab]').forEach(b=>b.addEventListener('click',()=>setRightTab(b.dataset.rtab)));
 $('inspector').querySelectorAll('[data-palign]').forEach(b=>b.addEventListener('click',()=>transact(()=>{state.design.photoAlign=b.dataset.palign})));
 $('inspector').querySelectorAll('[data-halign]').forEach(b=>b.addEventListener('click',()=>transact(()=>{state.design.headerAlign=b.dataset.halign})));
}
const LW=[200,420],RW=[235,480];
function applyPanels(){
 const L=$('layout'),r=document.documentElement.style;
 const leftToggle=$('toggleLeftPanel'),rightToggle=$('toggleRightPanel');
 L.classList.toggle('collapsed-l',leftCollapsed);L.classList.toggle('collapsed-r',collapsed);
 r.setProperty('--lw',(leftCollapsed?36:leftWidth)+'px');
 r.setProperty('--rw',(collapsed?36:panelWidth)+'px');
 if(leftToggle){
  leftToggle.classList.toggle('is-collapsed',leftCollapsed);
  leftToggle.setAttribute('aria-label',leftCollapsed?'Show left panel':'Hide left panel');
  leftToggle.title=leftCollapsed?'Show left panel':'Hide left panel';
 }
 if(rightToggle){
  rightToggle.classList.toggle('is-collapsed',collapsed);
  rightToggle.setAttribute('aria-label',collapsed?'Show right panel':'Hide right panel');
  rightToggle.title=collapsed?'Show right panel':'Hide right panel';
 }
}
function resizePanel(delta){collapsed=false;panelWidth=Math.max(RW[0],Math.min(RW[1],panelWidth+delta));applyPanels();savePrefs()}
function togglePanel(){collapsed=!collapsed;applyPanels();savePrefs()}
function toggleLeft(){leftCollapsed=!leftCollapsed;applyPanels();savePrefs()}
function setTab(t){leftTab=t==='sections'?'sections':'templates';leftCollapsed=false;for(const k of ['templates','sections']){const on=k===leftTab;$('pane'+k[0].toUpperCase()+k.slice(1)).hidden=!on;const b=$('tab'+k[0].toUpperCase()+k.slice(1));b.classList.toggle('active',on);b.setAttribute('aria-selected',on)}applyPanels();savePrefs()}
function setRightTab(t){rightTab=t==='section'?'section':'design';renderInspector();savePrefs()}
function savePrefs(){try{localStorage.setItem('resumeStudioUI',JSON.stringify({leftWidth,panelWidth,leftCollapsed,collapsed,leftTab,rightTab,onboardingDismissed}))}catch(e){}}
function loadPrefs(){try{const u=JSON.parse(localStorage.getItem('resumeStudioUI')||'null');if(u){leftWidth=clamp(u.leftWidth,LW[0],LW[1],260);panelWidth=clamp(u.panelWidth,RW[0],RW[1],300);leftCollapsed=!!u.leftCollapsed;collapsed=!!u.collapsed;leftTab=u.leftTab==='sections'?'sections':'templates';rightTab=u.rightTab==='section'?'section':'design';onboardingDismissed=u.onboardingDismissed===true}}catch(e){}}
function render(){renderTemplates();renderSectionList();renderSheets();renderInspector();$('docName').value=state.docName;$('pageLayout').value=state.layout;$('editMode').value=state.mode;updateUndoButton()}
/* Selecting only toggles highlight classes: no re-layout, so the page never jumps while you click around. */
function selectSection(id,expandEntries=false){selectedId=id;rightTab='section';inspectorEntriesExpanded=expandEntries;renderSectionList();document.querySelectorAll('[data-resume-section]').forEach(el=>el.classList.toggle('selected',el.dataset.resumeSection===id));renderInspector()}
function addSection(type,title,content){
 const s={id:uid(),type,title:title||type.charAt(0).toUpperCase()+type.slice(1),visible:true,listStyle:'bullet'};
 if(['experience','education','projects'].includes(type)){
  const defaultRole = type==='education'?'Degree / qualification':type==='projects'?'Project name':'Role / milestone';
  s.entries=[{role:defaultRole,company:'Organization',date:'Year',details:'Add one detail per line.'}];
 } else {
  s.content=content||(type==='skills'?'Skill one, Skill two, Skill three':'Add your content here.');
 }
 state.sections.push(s);selectedId=s.id;rightTab='section';return s;
}
function download(filename,blob){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function exportJSON(){download((state.docName||'resume').replace(/[^a-z0-9-_]+/gi,'-')+'.json',new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));toast('JSON backup downloaded')}
async function importJSON(file){
 if(file.size>5*1024*1024){
  await alertModern({ title: 'Import failed', message: 'Could not load project: JSON backups must be smaller than 5 MB.' });
  return;
 }
 const r=new FileReader();
 r.onload=async()=>{
  try{
   const next=normalizeState(JSON.parse(r.result));
   localPersistenceBlocked=false;
   recoverySnapshot=null;
   $('recoveryBanner').hidden=true;
   transact(()=>{state=next;selectedId=null});
   toast('Project loaded');
  }catch(e){
   await alertModern({ title: 'Import failed', message: 'Could not load project: '+(e instanceof SyntaxError?'the file is not valid JSON.':e.message) });
  }
 };
 r.onerror=async()=>{
  await alertModern({ title: 'Import failed', message: 'Could not read that file.' });
 };
 r.readAsText(file);
}
function showRecoveryNotice(recovery){
 if(!recovery.error)return;
 recoverySnapshot=recovery;
 localPersistenceBlocked=true;
 const recoveredOlder=Boolean(recovery.state);
 $('recoveryTitle').textContent=recovery.storageUnavailable
  ?'Browser backup is unavailable'
  :recoveredOlder
   ?'Recovered a saved draft'
   :'Found an older saved draft';
 $('recoveryMessage').textContent=recovery.storageUnavailable
  ?'This browser cannot read or write local backups right now. Export a JSON copy before continuing so your work is not lost.'
  :recoveredOlder
   ?'We found a saved draft from this browser. Continue with it or start fresh, and keep this backup if you want a safety copy.'
   :'A browser copy was found, but it could not be read cleanly. Continue with the recovered draft or create a fresh resume.';
 $('resolveRecovery').textContent=recoveredOlder?'Use recovered draft':'Start fresh';
 $('resolveRecovery').hidden=Boolean(recovery.storageUnavailable);
 $('downloadRecoveryBackup').hidden=!recovery.raw;
 $('recoveryBanner').hidden=false;
 setSaveState('Recovered draft ready');
}
function resolveLocalRecovery(){
 if(!recoverySnapshot)return;
 if(!recoverySnapshot.state&&!confirm('Start a new resume and replace the unreadable browser data? Download the saved data first if you may need it.'))return;
 try{
  if(!recoverySnapshot.state)state=fresh();
  if(cloudUser){
   selectedId=null;
   recoverySnapshot=null;
   localPersistenceBlocked=false;
   $('recoveryBanner').hidden=true;
   render();
   cloudDraftDirty=true;
   scheduleCloudSave();
   setSaveState('Saving…');
   return;
  }
  guestResumeStorage.save(state);
  selectedId=null;
  recoverySnapshot=null;
  localPersistenceBlocked=false;
  $('recoveryBanner').hidden=true;
  render();
  setSaveState(currentSaveStateLabel());
  scheduleCloudSave();
 }catch(error){
  console.error('Unable to replace unreadable resume data in this browser.',error);
  toast('Could not replace the saved data. The saved backup remains available.');
 }
}
function downloadRecoveryData(){
 if(!recoverySnapshot?.raw){toast('No readable saved data is available to download.');return}
 download('resume-recovery-backup.json',new Blob([recoverySnapshot.raw],{type:'application/json;charset=utf-8'}));
 toast('Saved browser data backup downloaded');
}

function addSelectableText(doc,sheet){
 const bounds=sheet.getBoundingClientRect(),scale=210/bounds.width,range=document.createRange(),walker=document.createTreeWalker(sheet,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  const text=node.nodeValue||'';if(!text.trim())continue;
  const style=getComputedStyle(node.parentElement),fontSize=parseFloat(style.fontSize)||12,family=style.fontFamily.toLowerCase();
  const font=/courier|monospace/.test(family)?'courier':/georgia|times/.test(family)?'times':'helvetica';
  const bold=Number.parseInt(style.fontWeight,10)>=600||style.fontWeight==='bold',italic=style.fontStyle==='italic';
  const pdfStyle=bold?(italic?'bolditalic':'bold'):(italic?'italic':'normal');
  const rgb=style.color.match(/[\d.]+/g)||['32','42','58'];
  const color=rgb.slice(0,3).map(Number);
  const pdfSize=fontSize*scale*72/25.4;
  let line='',lineTop=null,lineLeft=0;
  const flush=()=>{
   const visibleLine=line.replace(/\s+$/,'');
   if(visibleLine.trim())drawPdfText(doc,visibleLine,(lineLeft-bounds.left)*scale,(lineTop-bounds.top+fontSize*.86)*scale,{font,style:pdfStyle,size:pdfSize,color});
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
function pdfColor(value){
 const match=/^rgba?\((.+)\)$/i.exec(value.trim());if(!match)return null;
 const parts=match[1].split(/[\s,/]+/).filter(Boolean);
 if(parts.length<3)return null;
 const channels=parts.slice(0,3).map(part=>parseFloat(part)*(part.endsWith('%')?2.55:1));
 const alphaText=parts[3],alpha=alphaText===undefined?1:parseFloat(alphaText)*(alphaText.endsWith('%')?.01:1);
 if(channels.some(channel=>!Number.isFinite(channel))||!Number.isFinite(alpha)||alpha<=0)return null;
 return channels.map(channel=>Math.round(channel*alpha+255*(1-alpha)));
}
function addPdfDecorations(doc,sheet){
 const bounds=sheet.getBoundingClientRect(),scaleX=210/bounds.width,scaleY=297/bounds.height;
 const elements=[sheet,...sheet.querySelectorAll('*')];
 for(const element of elements){
  if(element.tagName==='IMG')continue;
  const rect=element.getBoundingClientRect();
  if(!rect.width||!rect.height)continue;
  const x=(rect.left-bounds.left)*scaleX,y=(rect.top-bounds.top)*scaleY,w=rect.width*scaleX,h=rect.height*scaleY;
  const style=getComputedStyle(element),background=pdfColor(style.backgroundColor);
  if(background){doc.setFillColor(...background);doc.rect(x,y,w,h,'F')}
  for(const [side,startX,startY,endX,endY] of [
   ['Top',x,y,x+w,y],['Right',x+w,y,x+w,y+h],['Bottom',x,y+h,x+w,y+h],['Left',x,y,x,y+h]
  ]){
   const width=parseFloat(style[`border${side}Width`])||0,color=pdfColor(style[`border${side}Color`]);
   if(!width||!color)continue;
   doc.setDrawColor(...color);doc.setLineWidth(width*(scaleX+scaleY)/2);doc.line(startX,startY,endX,endY);
  }
 }
 for(const image of sheet.querySelectorAll('img')){
  if(!image.complete||!image.naturalWidth||!image.naturalHeight)throw new Error('A profile photo could not be loaded for the PDF. Remove it or try again.');
  const rect=image.getBoundingClientRect();
  if(!rect.width||!rect.height)continue;
  const side=Math.min(image.naturalWidth,image.naturalHeight);
  const sourceX=(image.naturalWidth-side)/2,sourceY=(image.naturalHeight-side)/2;
  const canvas=document.createElement('canvas');
  canvas.width=side;canvas.height=side;
  const context=canvas.getContext('2d');
  const style=getComputedStyle(image),round=style.borderTopLeftRadius.includes('%')
   ||parseFloat(style.borderTopLeftRadius)>=Math.min(rect.width,rect.height)/2;
  if(round){context.beginPath();context.arc(side/2,side/2,side/2,0,Math.PI*2);context.clip()}
  context.drawImage(image,sourceX,sourceY,side,side,0,0,side,side);
  const format=round?'PNG':'JPEG',imageData=canvas.toDataURL(`image/${format.toLowerCase()}`,.84);
  doc.addImage(imageData,format,(rect.left-bounds.left)*scaleX,(rect.top-bounds.top)*scaleY,rect.width*scaleX,rect.height*scaleY,undefined,'MEDIUM');
  canvas.width=0;canvas.height=0;
 }
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
 const renderedPages=[];
 try{
  $('sheets').classList.add('exporting');sheets.forEach(sheet=>sheet.style.transform='none');
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  const {jsPDF}=await import('jspdf');
  if(generation!==pdfPreviewGeneration)return;
  for(const sheet of sheets){
   const images=[...sheet.querySelectorAll('img')];
   await Promise.all(images.map(image=>image.decode()));
   if(generation!==pdfPreviewGeneration)return;
   renderedPages.push({sheet});
  }
  const {blob}=await buildResumePdf(jsPDF,renderedPages,{
   addPdfDecorations,
   addSelectableText,
   addPDFLinks,
  });
  if(generation!==pdfPreviewGeneration)return;
  showPdfPreview(blob,`${(state.docName||'resume').replace(/[^a-z0-9-_]+/gi,'-')}.pdf`,sheets.length,'Preview your resume PDF');
 }catch(e){
  console.error(e);
  status.textContent=e.message||'PDF preview could not be created. Close this window and try again.';
 }finally{
  $('sheets').classList.remove('exporting');
  btn.disabled=false;
  btn.textContent='Export PDF';
  renderSheets();
 }
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
 $('pdfPreviewStatus').textContent=`Text is selectable and searchable. ${pageCount} A4 page${pageCount===1?'':'s'}. Review before downloading — the button is ready when you are.`;
 $('downloadPdfPreview').disabled=false;
 $('downloadPdfPreview').textContent='Download PDF';
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
async function downloadPreviewPdf(){
 if(!pdfPreviewBlob||$('downloadPdfPreview').disabled)return;
 const button=$('downloadPdfPreview');
 button.disabled=true;
 button.textContent='Preparing download…';
 try{
  download(pdfPreviewFilename,pdfPreviewBlob);
  closePdfPreview();
  toast('PDF downloaded');
 }finally{
  button.textContent='Download PDF';
  if(pdfPreviewBlob)button.disabled=false;
 }
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
 const entries=state.sections.filter(s=>s.visible&&s.type==='education').flatMap(s=>s.entries||[]).filter(entry=>[entry.role,entry.company,entry.date].some(value=>!isPlaceholderText(value)));
 const fields=entries.reduce((sum,e)=>sum+[e.role,e.company,e.date].filter(value=>!isPlaceholderText(value)).length,0);
 const possible=entries.length*3;
 return {score:Math.round(fields/possible*100),detail:`${fields}/${possible} degree, institution, and date fields are filled.`};
}
function getGenericCertificationText(){
 return state.sections.filter(s=>s.visible&&s.type==='certifications').map(s=>s.content||'').join(' ').trim();
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
function computeAtsChecks(jobTextOverride=null){
 const technicalSkillsText=getTechnicalSkillsText();
 const jobText=jobTextOverride===null?$('jobDescription')?.value||'':jobTextOverride;
 if(!String(jobText).trim()){
  const formatScore=scoreFormatCompatibility();
  const titleScore=scoreGenericTitleClarity();
  const sectionScore=scoreSectionStructure();
  const experienceScore=scoreExperienceDepth();
  const skillsScore=scoreGenericSkills();
  const impactScore=scoreImpactQuality();
  const contactScore=scoreGenericContact();
  const educationEntries=state.sections.filter(s=>s.visible&&s.type==='education').flatMap(s=>s.entries||[]);
  const hasEducation=educationEntries.some(entry=>[entry.role,entry.company,entry.date].some(value=>!isPlaceholderText(value)));
  const certificationText=getGenericCertificationText();
  const hasCertifications=Boolean(certificationText&&!isPlaceholderText(certificationText)&&!/^add relevant certifications/i.test(certificationText));
  const resumeKeywords=collectAtsJobTerms(technicalSkillsText);
  const criteria=[
   {label:'ATS-friendly Formatting',weight:GENERIC_ATS_WEIGHTING.formatting,score:formatScore.score,detail:formatScore.detail},
   {label:'Professional Title Clarity',weight:GENERIC_ATS_WEIGHTING.titleClarity,score:titleScore.score,detail:titleScore.detail},
   {label:'Standard Section Structure',weight:GENERIC_ATS_WEIGHTING.sections,score:sectionScore.score,detail:sectionScore.detail},
   {label:'Experience & Dates',weight:GENERIC_ATS_WEIGHTING.experience,score:experienceScore.score,detail:experienceScore.detail},
   {label:'Technical Skills & Context',weight:GENERIC_ATS_WEIGHTING.skills,score:skillsScore.score,detail:skillsScore.detail},
   {label:'Quantified Impact',weight:GENERIC_ATS_WEIGHTING.impact,score:impactScore.score,detail:impactScore.detail},
  {label:'Contact Information',weight:GENERIC_ATS_WEIGHTING.contact,score:contactScore.score,detail:contactScore.detail}
  ];
  if(hasEducation){const educationScore=scoreGenericEducation();criteria.splice(5,0,{label:'Education Completeness',weight:GENERIC_ATS_WEIGHTING.education,score:educationScore.score,detail:educationScore.detail})}
  if(hasCertifications){criteria.splice(hasEducation?6:5,0,{label:'Certifications & Licenses',weight:GENERIC_ATS_WEIGHTING.certifications,score:90,detail:'Certification information is present; its relevance requires a job description.'})}
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
 const comparisonDetails=report.generic?`<div class="ats-section-title">Recognized resume keywords</div><div class="ats-keywords">${matchedDisplay}</div><div class="ats-empty">Add a job description and run checks for role-specific keyword and skills matching.</div>`:`<div class="ats-section-title">Keyword match</div><div class="ats-keywords">${matchedDisplay}</div><div class="ats-section-title">Missing terms</div><div class="ats-keywords">${missingDisplay}</div>`;
 const criteriaTitle=report.generic?'General readiness factors':'ATS criteria';
 const note=report.generic?'Generic readiness uses resume-verifiable factors. Add a job description and run checks to include role-specific keyword, title, and skills matching.':'Keyword match (50%) uses only the Technical Skills section; job title alignment (25%) and skills evidenced in experience (15%) make up the other primary factors. Formatting, structure, experience depth, education, certifications, and impact make up the remaining 10%. This heuristic score is capped at 95 because employer-specific ATS rules cannot be reproduced; scores around 75–80% or higher are generally considered strong.';
 container.innerHTML=`<div class="ats-score-row"><div class="ats-score">${hasScore?report.score:'—'}<small>score</small></div><div class="ats-score-meta"><strong>${report.generic?'Generic ATS readiness':'ATS readiness'}</strong><div>${report.generic?'Resume-only estimate; not matched to a job description.':hasScore?'Weighted score based on the 9 ATS criteria':'Paste a target job description to calculate compatibility.'}</div><div class="ats-progress"><span style="width:${hasScore?report.score:0}%"></span></div></div></div>${comparisonDetails}<div class="ats-section-title">${criteriaTitle}</div><div class="ats-criteria-grid">${criteria}</div><div class="ats-section-title">Findings</div><div class="ats-findings">${findings}</div><div class="ats-note">${note}</div>`;
}
function openAts(){
 $('atsModalBg').classList.add('show');
 $('atsModalBg').setAttribute('aria-hidden','false');
 $('jobDescription').focus();
}
function closeAts(){
 ++atsCheckGeneration;
 $('runAtsBtn').disabled=false;
 $('runAtsBtn').textContent='Run checks';
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
  if(generation===pdfPreviewGeneration)$('pdfPreviewStatus').textContent=error.message||'Cover letter PDF preview could not be created. Close this window and try again.';
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
let atsCheckGeneration=0;
function renderAtsProcessing(stageIndex,stages){
 const stage=stages[stageIndex];
 const progress=[18,42,69,91][stageIndex];
 $('atsResults').innerHTML=`<div class="ats-processing" role="status" aria-live="polite">
  <div class="ats-processing-spinner" aria-hidden="true"></div>
  <strong>${stage.label}</strong>
  <p>${stage.detail}</p>
  <div class="ats-processing-track" role="progressbar" aria-label="ATS analysis progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
   <span style="width:${progress}%"></span>
  </div>
  <ol class="ats-processing-steps">${stages.map((item,index)=>`<li class="${index<stageIndex?'complete':index===stageIndex?'current':''}">${item.label}</li>`).join('')}</ol>
 </div>`;
}
function runAtsChecks(){
 const generation=++atsCheckGeneration;
 const runButton=$('runAtsBtn');
 const jobText=$('jobDescription').value.trim();
 const stages=[
  {label:'Reading resume sections',detail:'Collecting the details available in your resume.'},
  {label:'Checking structure and completeness',detail:'Reviewing contact details, sections, and formatting.'},
  {label:'Evaluating skills and experience',detail:'Checking the content against resume-readiness factors.'},
  {label:'Preparing your recommendations',detail:'Organizing the findings into a clear report.'}
 ];
 const delays=[300,340,360,300];
 runButton.disabled=true;
 runButton.textContent='Analyzing…';
 const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
 void (async()=>{
  try{
   for(let index=0;index<stages.length;index+=1){
    if(generation!==atsCheckGeneration)return;
    renderAtsProcessing(index,stages);
    await wait(delays[index]);
   }
   if(generation!==atsCheckGeneration)return;
   renderAtsResults(computeAtsChecks(jobText));
  }catch(error){
   console.error('Could not complete the ATS analysis.',error);
   if(generation===atsCheckGeneration){
    $('atsResults').innerHTML=`<div class="ats-empty" role="alert">Could not complete the ATS analysis: ${$esc(error.message||'Please try again.')}</div>`;
   }
  }finally{
   if(generation===atsCheckGeneration){
    runButton.disabled=false;
    runButton.textContent='Run checks';
   }
  }
 })();
}
$('templates').addEventListener('click',e=>{
 const b=e.target.closest('[data-template]');
 if(!b)return;
 const template=templateDefs.find(item=>item.id===b.dataset.template);
 if(!template||template.id===state.template)return;
 transact(()=>{state.template=template.id;state.layout=template.layout;state.design.accent=template.accent;selectedId=null});
 toast('Applied '+template.name);
})
$('sectionList').addEventListener('click',e=>{const deleteButton=e.target.closest('[data-delete-section]');if(deleteButton){e.preventDefault();e.stopPropagation();deleteSectionById(deleteButton.dataset.deleteSection);return}const toggle=e.target.closest('[data-toggle]');if(toggle){transact(()=>{const s=sectionById(toggle.dataset.toggle);if(s)s.visible=!s.visible});return}const row=e.target.closest('[data-section-row]');if(row)selectSection(row.dataset.sectionRow)});
$('sectionList').addEventListener('dragstart',e=>{const row=e.target.closest('[data-section-row]');if(!row)return;draggingId=row.dataset.sectionRow;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggingId);row.style.opacity='.5'});
$('sectionList').addEventListener('dragend',e=>{const row=e.target.closest('[data-section-row]');if(row)row.style.opacity='1';draggingId=null});
$('sectionList').addEventListener('dragover',e=>{if(e.target.closest('[data-section-row]')){e.preventDefault();e.dataTransfer.dropEffect='move'}});
$('sectionList').addEventListener('drop',e=>{e.preventDefault();const row=e.target.closest('[data-section-row]'),id=e.dataTransfer.getData('text/plain');if(!row||!id||id===row.dataset.sectionRow)return;transact(()=>{const from=state.sections.findIndex(x=>x.id===id),to=state.sections.findIndex(x=>x.id===row.dataset.sectionRow);if(from<0||to<0)return;const [item]=state.sections.splice(from,1);state.sections.splice(to,0,item)})});
const directEditSnapshots=new WeakMap();
let reflowingDetail=false;
function syncInspectorField(attribute,value){
 const el=$('inspector')?.querySelector(`[${attribute}]`);
 if(el&&!el.isContentEditable&&document.activeElement!==el)el.value=value;
}
function updateInspectorEntryTitle(index,entry){
 const title=$('inspector')?.querySelector(`[data-entry-summary="${index}"]`);
 if(title)title.textContent=entry.role.trim()||entry.company.trim()||`Entry ${Number(index)+1}`;
}
function syncSheetFields(){
 document.querySelectorAll('[data-profile-field]').forEach(el=>{const value=state.profile[el.dataset.profileField];if(value!==undefined&&el!==document.activeElement)el.textContent=value});
 document.querySelectorAll('[data-section-title]').forEach(el=>{const section=sectionById(el.dataset.sectionTitle);if(section&&el!==document.activeElement)el.textContent=section.title});
 document.querySelectorAll('[data-entry-field="role"],[data-entry-field="company"],[data-entry-field="date"]').forEach(el=>{const section=sectionById(el.dataset.sectionId),entry=section?.entries?.[Number(el.dataset.entry)];if(entry&&el!==document.activeElement)el.textContent=entry[el.dataset.entryField]||''});
}
function syncInspectorForInlineEdit(el,value){
 if(el.dataset.profileField)syncInspectorField(`data-profile="${el.dataset.profileField}"`,value);
 else if(el.dataset.sectionTitle)syncInspectorField('id="sectionTitle"',value);
 else if(el.dataset.entryField==='role'||el.dataset.entryField==='company'||el.dataset.entryField==='date'){
  const panel=$('inspector')?.querySelector(`[data-entry="${el.dataset.entryField}"][data-index="${el.dataset.entry}"]`);
    if(panel&&document.activeElement!==panel)panel.value=value;
    if(el.dataset.entryField==='role'||el.dataset.entryField==='company'){
     const entry=sectionById(el.dataset.sectionId)?.entries?.[Number(el.dataset.entry)];
     if(entry)updateInspectorEntryTitle(el.dataset.entry,entry);
    }
 }
 else if(el.dataset.entryField==='detail'){
  const panel=$('inspector')?.querySelector(`[data-entry-details="${el.dataset.entry}"]`),section=sectionById(el.dataset.sectionId),entry=section?.entries?.[Number(el.dataset.entry)];
  if(panel&&entry&&!panel.contains(document.activeElement))panel.innerHTML=renderDetailInputs(entry,Number(el.dataset.entry));
 }
 else if(el.dataset.textSource!==undefined){
  const section=sectionById(el.dataset.sectionId),list=$('inspector')?.querySelector(`[data-pointer-lines="${el.dataset.sectionId}"]`);
  if(list&&section&&!list.contains(document.activeElement))list.innerHTML=renderPointerInputs(section);
  else{const panel=$('inspector')?.querySelector('#sectionContent');if(panel&&document.activeElement!==panel)panel.value=String(section?.content||'')}
 }
}
function directEditValue(el){
 let value;
 try{value=String(el.innerText||'')}catch{value=String(el.textContent||'')}
 if(!value.trim())value=String(el.textContent||'');
 value=value.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/\n{2,}$/g,'\n');
 return value;
}
function caretOffsetWithin(el,includeLineBreaks=false){
 const selection=window.getSelection();if(!selection||!selection.rangeCount||!el.contains(selection.anchorNode))return directEditValue(el).length;
 if(selection.anchorNode.nodeType===Node.TEXT_NODE && selection.anchorNode.parentNode===el)return selection.anchorOffset;
 const range=selection.getRangeAt(0).cloneRange();range.selectNodeContents(el);range.setEnd(selection.anchorNode,selection.anchorOffset);
 const prefix=range.toString().replace(/\u00a0/g,' ');
 return includeLineBreaks?prefix.length:prefix.replace(/\n/g,'').length;
}
function focusTextLine(sectionId,lineIndex,caretOffset=0){
 requestAnimationFrame(()=>{
  const target=Array.from(document.querySelectorAll('#sheets [data-text-source][contenteditable="true"]')).find(el=>el.dataset.sectionId===sectionId&&Number(el.dataset.textIndex)===lineIndex);
  if(!target)return;target.focus();const range=document.createRange(),selection=window.getSelection();range.selectNodeContents(target);
  if(target.firstChild&&caretOffset>0&&target.firstChild.nodeType===Node.TEXT_NODE){range.setStart(target.firstChild,Math.min(caretOffset,target.firstChild.textContent.length));range.collapse(true)}else{range.collapse(true)}selection.removeAllRanges();selection.addRange(range);
 });
}
function reflowOverflowingDetail(el,force=false){
 if(state.mode!=='flow')return;
 requestAnimationFrame(()=>{
  if(!el.isConnected||document.activeElement!==el)return;
  const area=el.closest('.sheet')?.querySelector('.sections-area');
  if(!area)return;
  const limit=area.getBoundingClientRect().bottom-parseFloat(getComputedStyle(area).paddingBottom);
  if(!force&&el.getBoundingClientRect().bottom<=limit+.5)return;
  const sectionId=el.dataset.sectionId,entryIndex=el.dataset.entry,detailIndex=Number(el.dataset.detailIndex);
  const caret=caretOffsetWithin(el,true),snapshot=directEditSnapshots.get(el);
  reflowingDetail=true;
  try{renderSheets()}finally{reflowingDetail=false}
  const moved=Array.from(document.querySelectorAll('#sheets [data-entry-field="detail"]')).find(item=>item.dataset.sectionId===sectionId&&item.dataset.entry===entryIndex&&Number(item.dataset.detailIndex)===detailIndex);
  if(!moved)return;
  if(snapshot)directEditSnapshots.set(moved,snapshot);
  moved.focus();
  const range=document.createRange(),selection=window.getSelection(),textNode=moved.firstChild;
  if(textNode?.nodeType===Node.TEXT_NODE)range.setStart(textNode,Math.min(caret,textNode.textContent.length));
  else range.selectNodeContents(moved);
  range.collapse(true);selection?.removeAllRanges();selection?.addRange(range);
 });
}
$('sheets').addEventListener('focusin',e=>{
 const el=e.target.closest('[contenteditable="true"]');if(!el)return;
 if(!directEditSnapshots.has(el))directEditSnapshots.set(el,deep(state));
 if(!el.dataset.currentText)el.dataset.currentText=el.dataset.detailSource||el.dataset.textSource||directEditValue(el);
 if(el.dataset.entryField==='detail'&&!el.dataset.detailCount)el.dataset.detailCount='1';
});
$('sheets').addEventListener('input',e=>{
 const el=e.target.closest('[contenteditable="true"]');if(!el)return;
 const value=directEditValue(el);
 if(el.dataset.entryField==='detail'&&el.tagName==='LI')el.classList.toggle('blank-bullet',!value.trim());
 if(el.dataset.profileField){state.profile[el.dataset.profileField]=value}
 else if(el.dataset.sectionTitle){const section=sectionById(el.dataset.sectionTitle);if(section)section.title=value||'Untitled section'}
 else if(el.dataset.sectionId){
  const section=sectionById(el.dataset.sectionId),entryIndex=Number(el.dataset.entry);
  if(el.dataset.entryField==='role'&&section?.entries?.[entryIndex])section.entries[entryIndex].role=value;
  else if(el.dataset.entryField==='date'&&section?.entries?.[entryIndex])section.entries[entryIndex].date=value;
  else if(el.dataset.entryField==='company'&&section?.entries?.[entryIndex])section.entries[entryIndex].company=value;
  else if(el.dataset.entryField==='detail'&&section?.entries?.[entryIndex]){
   const entry=section.entries[entryIndex],details=detailLines(entry.details);
   const replacements=value.replace(/\r\n?/g,'\n').split('\n');
   const detailIndex=Number.isFinite(Number(el.dataset.detailIndex))?Number(el.dataset.detailIndex):-1;
   const representedCount=Math.max(1,Number(el.dataset.detailCount)||1);
   if(detailIndex>=0&&detailIndex<details.length)details.splice(detailIndex,representedCount,...replacements);
   else if(detailIndex>=0)details.splice(detailIndex,0,...replacements);
   entry.details=details.join('\n');el.dataset.detailCount=String(replacements.length||1);el.dataset.currentText=value;
   reflowOverflowingDetail(el,replacements.length>1);
  }
  else if(el.dataset.skillIndex!==undefined){
   const skills=String(section?.content||'').split(/[,:\n]/).map(x=>x.trim()).filter(Boolean),index=Number(el.dataset.skillIndex);
   if(skills[index]!==undefined)skills[index]=value;section.content=skills.join(', ');
  }
  else if(el.dataset.textSource!==undefined){
   el.classList.toggle('blank-line',!value.trim());
   const contentLines=String(section?.content||'').replace(/\r\n?/g,'\n').split('\n');
   const lineIndex=Number(el.dataset.textIndex);
   const replacements=value.replace(/\r\n?/g,'\n').split('\n');
   if(Number.isInteger(lineIndex)&&lineIndex>=0&&lineIndex<contentLines.length)contentLines.splice(lineIndex,1,...replacements);
   else contentLines.push(...replacements);
   section.content=contentLines.join('\n');el.dataset.currentText=value;
   if(replacements.length>1)requestAnimationFrame(()=>renderSheets());
  }
 }
 syncInspectorForInlineEdit(el,value);
 saveLocal();
});
$('sheets').addEventListener('focusout',e=>{
 const el=e.target.closest('[contenteditable="true"]');if(!el)return;
 if(reflowingDetail)return;
 const before=directEditSnapshots.get(el);if(before&&JSON.stringify(before)!==JSON.stringify(state)){recordHistory(before);saveLocal();renderSheets();renderInspector();updateUndoButton();toast('Resume updated')}
 directEditSnapshots.delete(el);delete el.dataset.currentText;
});
$('sheets').addEventListener('keydown',e=>{
 const el=e.target.closest('[contenteditable="true"]');if(!el)return;
 const selection=window.getSelection();
 if((e.key==='ArrowUp'||e.key==='ArrowDown')&&selection&&selection.isCollapsed&&selection.rangeCount){
  const range=selection.getRangeAt(0);
  if(range.collapsed){
   const caretRange=range.cloneRange();caretRange.collapse(true);caretRange.setStart(caretRange.startContainer,caretRange.startOffset);caretRange.setEnd(caretRange.startContainer,caretRange.startOffset);
   let caretRect=null;try{caretRect=caretRange.getClientRects()[0]||caretRange.getBoundingClientRect()}catch{}
   const fieldRect=el.getBoundingClientRect();const lineHeight=parseFloat(getComputedStyle(el).lineHeight)||12;
   const atBoundary=e.key==='ArrowUp'?(caretRect&&(caretRect.top-fieldRect.top<lineHeight*0.75)): (caretRect&&(fieldRect.bottom-caretRect.bottom<lineHeight*0.75));
   if(atBoundary){
    const editables=Array.from(document.querySelectorAll('#sheets [contenteditable="true"]')).filter(node=>node.offsetParent!==null);
    const index=editables.indexOf(el),next=editables[index+(e.key==='ArrowDown'?1:-1)];
    if(next){e.prevent;next.focus();const moveRange=document.createRange();moveRange.selectNodeContents(next);moveRange.collapse(e.key==='ArrowDown');const moveSelection=window.getSelection();moveSelection.removeAllRanges();moveSelection.addRange(moveRange);}
   }
  }
 }
 if((e.key==='Backspace'||e.key==='Delete')&&selection&&!selection.isCollapsed&&selection.rangeCount){
  const insideField=el.contains(selection.anchorNode)&&el.contains(selection.focusNode);
  if(!insideField)e.preventDefault();
  return;
 }

 if((e.key==='Backspace'||e.key==='Delete')&&el.dataset.textIndex!==undefined){
  const section=sectionById(el.dataset.sectionId),index=Number(el.dataset.textIndex);
  if(!section||!Number.isInteger(index))return;
  const lines=String(section.content||'').replace(/\r\n?/g,'\n').split('\n');
  const value=directEditValue(el);
  const caret=caretOffsetWithin(el);
  const isEmpty=!value.trim();
  if(isEmpty){
   e.preventDefault();
   if(lines.length<=1){lines[0]='';}
   else lines.splice(index,1);
   section.content=lines.join('\n');saveLocal();syncInspectorForInlineEdit(el,section.content);renderSheets();
   focusTextLine(section.id,Math.max(0,Math.min(index-(e.key==='Backspace'?1:0),lines.length-1)),0);
   return;
  }
  if(e.key==='Backspace'&&caret===0&&index>0){
   e.preventDefault();const previousLength=lines[index-1].length;lines[index-1]+=lines[index];lines.splice(index,1);section.content=lines.join('\n');saveLocal();syncInspectorForInlineEdit(el,section.content);renderSheets();focusTextLine(section.id,index-1,previousLength);return;
  }
  if(e.key==='Delete'&&caret===value.length&&index<lines.length-1){
   e.preventDefault();const mergedLength=lines[index].length;lines[index]+=lines[index+1];lines.splice(index+1,1);section.content=lines.join('\n');saveLocal();syncInspectorForInlineEdit(el,section.content);renderSheets();focusTextLine(section.id,index,mergedLength);return;
  }
 }
 if((e.key==='Backspace'||e.key==='Delete')&&el.dataset.entryField==='detail'){
  const value=directEditValue(el);
  const selection=window.getSelection();
  if(value.trim()&&selection?.isCollapsed){
   const caret=caretOffsetWithin(el,true),backward=e.key==='Backspace',atBoundary=backward?caret===0:caret===value.length;
   if(atBoundary){
    e.preventDefault();
    const sectionId=el.dataset.sectionId,entryIndex=el.dataset.entry;
    const rows=Array.from(document.querySelectorAll('#sheets [data-entry-field="detail"]')).filter(item=>item.dataset.sectionId===sectionId&&item.dataset.entry===entryIndex);
    const position=rows.indexOf(el),neighbor=rows[position+(backward?-1:1)];
    if(!neighbor)return;
    const prior=backward?neighbor:el,next=backward?el:neighbor;
    const priorIndex=Number(prior.dataset.detailIndex),nextIndex=Number(next.dataset.detailIndex);
    const priorCount=Math.max(1,Number(prior.dataset.detailCount)||1),nextCount=Math.max(1,Number(next.dataset.detailCount)||1);
    if(!Number.isInteger(priorIndex)||nextIndex!==priorIndex+priorCount)return;
    const entry=sectionById(sectionId)?.entries?.[Number(entryIndex)],details=entry&&detailLines(entry.details);
    if(!details||nextIndex+nextCount>details.length)return;
    const priorText=directEditValue(prior),joined=priorText+directEditValue(next),count=priorCount+nextCount,joinedCount=Math.max(1,joined.split('\n').length);
    details.splice(priorIndex,count,joined);entry.details=details.join('\n');
    prior.textContent=joined;prior.dataset.detailIndex=String(priorIndex);prior.dataset.detailCount=String(joinedCount);prior.dataset.detailSource=joined;prior.dataset.currentText=joined;
    prior.classList.toggle('blank-bullet',!joined.trim());
    next.remove();
    rows.filter(item=>item!==prior&&item!==next).forEach(item=>{
     const itemIndex=Number(item.dataset.detailIndex);
     if(Number.isFinite(itemIndex)&&itemIndex>=priorIndex+count)item.dataset.detailIndex=String(itemIndex-count+joinedCount);
    });
    syncInspectorForInlineEdit(prior,joined);saveLocal();
    const editSnapshot=directEditSnapshots.get(el);
    if(backward){
     if(editSnapshot)directEditSnapshots.set(prior,editSnapshot);
     directEditSnapshots.set(el,deep(state));
     prior.focus();
    }
    const restoreCaret=()=>{
     const focusTarget=prior.isConnected?prior:Array.from(document.querySelectorAll('#sheets [data-entry-field="detail"]')).find(item=>item.dataset.sectionId===sectionId&&item.dataset.entry===entryIndex&&Number(item.dataset.detailIndex)===priorIndex);
     if(!focusTarget)return;
     if(document.activeElement!==focusTarget)focusTarget.focus();
     const textNode=focusTarget.firstChild,offset=backward?priorText.length:Math.min(caret,joined.length),range=document.createRange();
     if(textNode?.nodeType===Node.TEXT_NODE)range.setStart(textNode,Math.min(offset,textNode.textContent.length));
     else range.selectNodeContents(focusTarget);
     range.collapse(true);selection.removeAllRanges();selection.addRange(range);
    };
    if(prior.isConnected)restoreCaret();else requestAnimationFrame(restoreCaret);
    return;
   }
  }
  if(!value.trim()){
   e.preventDefault();
   const section=sectionById(el.dataset.sectionId),entry=section?.entries?.[Number(el.dataset.entry)],index=Number(el.dataset.detailIndex);
   if(entry&&Number.isInteger(index)&&index>=0){
    const details=detailLines(entry.details);
    if(details.length<=1)return;
    const snapshot=directEditSnapshots.get(el);
    details.splice(index,1);entry.details=details.join('\n');saveLocal();
    const sectionId=el.dataset.sectionId,entryIndex=el.dataset.entry;
    const rows=Array.from(document.querySelectorAll('#sheets [data-entry-field="detail"]')).filter(item=>item.dataset.sectionId===sectionId&&item.dataset.entry===entryIndex);
    const position=rows.indexOf(el),backward=e.key==='Backspace';
    const neighbor=rows[position+(backward?-1:1)]||rows[position+(backward?1:-1)];
    const neighborIndex=neighbor?Number(neighbor.dataset.detailIndex):-1;
    rows.filter(item=>item!==el).forEach(item=>{const itemIndex=Number(item.dataset.detailIndex);if(Number.isFinite(itemIndex)&&itemIndex>index)item.dataset.detailIndex=String(itemIndex-1)});
    directEditSnapshots.delete(el);
    if(snapshot&&JSON.stringify(snapshot)!==JSON.stringify(state)){recordHistory(snapshot);updateUndoButton()}
    syncInspectorForInlineEdit(el,'');
    renderSheets();renderInspector();
    const targetIndex=neighborIndex>index?neighborIndex-1:neighborIndex;
    const focusTarget=Array.from(document.querySelectorAll('#sheets [data-entry-field="detail"]')).find(item=>item.dataset.sectionId===sectionId&&item.dataset.entry===entryIndex&&Number(item.dataset.detailIndex)===targetIndex);
    if(focusTarget?.isContentEditable){
     focusTarget.focus();
     const range=document.createRange(),textNode=focusTarget.firstChild;
     if(textNode?.nodeType===Node.TEXT_NODE)range.setStart(textNode,backward?textNode.textContent.length:0);
     else range.selectNodeContents(focusTarget);
     range.collapse(true);selection?.removeAllRanges();selection?.addRange(range);
    }
   }
   return;
  }
 }
 if(e.key==='Enter'&&!e.shiftKey&&el.dataset.entryField==='detail'){
  e.preventDefault();
  const section=sectionById(el.dataset.sectionId),entry=section?.entries?.[Number(el.dataset.entry)];if(!entry)return;
  const details=detailLines(entry.details),index=Number(el.dataset.detailIndex),before=directEditValue(el),representedCount=Math.max(1,Number(el.dataset.detailCount)||1);
  if(!Number.isInteger(index)||index<0)return;
  const selection=window.getSelection(),selectionLength=selection?.rangeCount&&el.contains(selection.anchorNode)&&el.contains(selection.focusNode)?selection.toString().length:0;
  const caret=Math.min(caretOffsetWithin(el,true),before.length),left=before.slice(0,caret),right=before.slice(caret+selectionLength);
  details.splice(index,representedCount,left,right);
  entry.details=details.join('\n');saveLocal();syncInspectorForInlineEdit(el,left);
  const ul=el.closest('ul');if(!ul)return;
  el.textContent=left;el.dataset.detailSource=left;el.dataset.detailCount='1';el.dataset.currentText=left;
  el.classList.toggle('blank-bullet',!left.trim());
  const next=document.createElement('li');
  next.contentEditable='true';next.spellcheck=true;next.title='Click to edit bullet';
  next.dataset.sectionId=section.id;next.dataset.entry=String(el.dataset.entry);next.dataset.entryField='detail';next.dataset.detailIndex=String(index+1);next.dataset.detailSource=right;next.dataset.detailCount='1';next.dataset.currentText=right;next.textContent=right;next.classList.toggle('blank-bullet',!right.trim());
  ul.insertBefore(next,el.nextElementSibling);
  const indexDelta=2-representedCount;
  Array.from(ul.querySelectorAll(':scope > li')).forEach(item=>{
   if(item===next)return;
   const itemIndex=Number(item.dataset.detailIndex);
   if(item!==el&&Number.isFinite(itemIndex)&&itemIndex>=index+representedCount)item.dataset.detailIndex=String(itemIndex+indexDelta);
  });
  const editSnapshot=directEditSnapshots.get(el);
  directEditSnapshots.set(el,deep(state));
  if(editSnapshot)directEditSnapshots.set(next,editSnapshot);
  next.focus();
  const range=document.createRange();range.selectNodeContents(next);range.collapse(true);
  selection?.removeAllRanges();selection?.addRange(range);
  return;
 }
 if(e.key==='Enter'&&!e.shiftKey&&el.dataset.textSource!==undefined){
  e.preventDefault();
  const section=sectionById(el.dataset.sectionId),lineIndex=Number(el.dataset.textIndex);if(!section) return;
  const storedLines=String(section.content||'').replace(/\r\n?/g,'\n').split('\n');
  const visibleValue=directEditValue(el);
  const editValue=visibleValue;
  const selectionCaret=caretOffsetWithin(el);
  let caret=Math.min(Math.max(selectionCaret,0),editValue.length);
  const lines=String(section.content||'').replace(/\r\n?/g,'\n').split('\n');
  const before=editValue.slice(0,caret),after=editValue.slice(caret);
  if(!Number.isInteger(lineIndex)||lineIndex<0||lineIndex>=lines.length)return;
  // Always replace the edited line first. This prevents stale stored DOM data
  // from surviving an Enter and accidentally overwriting neighboring lines.
  lines.splice(lineIndex,1,before,after);
  section.content=lines.join('\n');
  syncInspectorForInlineEdit(el,section.content);
  saveLocal();
  renderSheets();
  focusTextLine(section.id,lineIndex+1,0);
  return;
 }
 if(e.key==='Enter'){
  const multiline=el.dataset.entryField==='detail';
  if(multiline){e.preventDefault();document.execCommand('insertText',false,'\n')}
  else{e.preventDefault();el.blur()}
 }
});
$('sheets').addEventListener('paste',e=>{const el=e.target.closest('[contenteditable="true"]');if(!el)return;e.preventDefault();const text=(e.clipboardData||window.clipboardData).getData('text/plain').replace(/\r/g,'').replace(/\n/g,el.dataset.entryField==='detail'||el.dataset.textSource!==undefined?'\n':' ');document.execCommand('insertText',false,text)});
$('sheets').addEventListener('cut',()=>{requestAnimationFrame(()=>{document.querySelectorAll('#sheets [contenteditable="true"]').forEach(editable=>editable.dispatchEvent(new Event('input',{bubbles:true})));saveLocal();renderInspector();updateUndoButton()})});
 $('sheets').addEventListener('click',e=>{const el=e.target.closest('[data-resume-section]');if(el)selectSection(el.dataset.resumeSection,Boolean(e.target.closest('[contenteditable="true"]')))});
$('sheets').addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'){
  touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touchPoints.size===2){const [first,second]=touchPoints.values();pinchStart={distance:Math.hypot(second.x-first.x,second.y-first.y),zoom};pinchUsed=true;e.preventDefault()}
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
  if(pinchUsed)return;
 }
 if(state.mode!=='free'||e.button!==0)return;const hit=e.target.closest('[data-resume-section]');if(!hit)return;
 const resizeHandle=e.target.closest('.free-section-resize'),moveHandle=e.target.closest('.free-section-move');
 if(!resizeHandle&&!moveHandle&&e.target.closest('[contenteditable="true"]'))return;
 const id=hit.dataset.resumeSection;selectSection(id);const el=$('sheets').querySelector(`[data-resume-section="${id}"]`);if(!el)return;
 const beforeDrag=deep(state),startX=e.clientX,startY=e.clientY,start=deep(state.positions[id]||{x:0,y:0,w:PAGE_W,page:Number(el.closest('.sheet')?.dataset.page)||1}),sheet=el.closest('.sheet'),sheetBounds=sheet.getBoundingClientRect(),scale=sheetBounds.width/PAGE_W||1,sectionBounds=el.getBoundingClientRect(),pointerOffsetX=(startX-sectionBounds.left)/scale,pointerOffsetY=(startY-sectionBounds.top)/scale;
 if(resizeHandle||moveHandle)e.preventDefault();
 const move=ev=>{
  if(pinchUsed)return;
  const dx=(ev.clientX-startX)/scale,dy=(ev.clientY-startY)/scale;
  let pos;
  if(resizeHandle){
   pos={...start,w:clamp(Math.round(start.w+dx),80,PAGE_W-start.x,start.w),h:clamp(Math.round((start.h||el.getBoundingClientRect().height/scale)+dy),30,PAGE_H-start.y,30)};
  }else{
   const sheets=[...$('sheets').querySelectorAll('.sheet')];
   let targetIndex=sheets.findIndex(candidate=>{const bounds=candidate.getBoundingClientRect();return ev.clientY>=bounds.top&&ev.clientY<=bounds.bottom});
   if(targetIndex<0)targetIndex=clamp(Math.round((start.page||1)-1),0,sheets.length-1,0);
   const target=sheets[targetIndex],bounds=target.getBoundingClientRect(),targetScale=bounds.width/PAGE_W||1;
   pos={...start,page:targetIndex+1,x:clamp(Math.round((ev.clientX-bounds.left)/targetScale-pointerOffsetX),0,Math.max(0,PAGE_W-start.w),0),y:clamp(Math.round((ev.clientY-bounds.top)/targetScale-pointerOffsetY),0,Math.max(0,PAGE_H-30),0)};
   const targetArea=target.querySelector('.sections-area');
   if(targetArea&&el.parentElement!==targetArea)targetArea.appendChild(el);
  }
  state.positions[id]=pos;
  el.style.left=pos.x+'px';el.style.top=pos.y+'px';el.style.width=pos.w+'px';el.style.minHeight=pos.h?pos.h+'px':'';
 };
 const up=()=>{
  document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);
  if(JSON.stringify(beforeDrag)!==JSON.stringify(state)){recordHistory(beforeDrag);saveLocal();renderSheets();renderInspector()}
 };
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
function closeCustomSectionDialog(){const bg=$('modalBg');bg.classList.remove('show');bg.setAttribute('aria-hidden','true');customSectionTrigger?.focus();customSectionTrigger=null}
function triggerQuickSectionAdd(type){
  if(type==='custom'){customSectionTrigger=document.activeElement||null;$('modalBg').classList.add('show');$('modalBg').setAttribute('aria-hidden','false');$('customTitle').focus();return}
  leftTab='sections';
  setTab('sections');
  transact(()=>addSection(type));
  toast(type==='summary'?'Summary section added':type==='experience'?'Experience section added':'Section added');
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-add]');
 if(trigger){
  if(trigger.dataset.add==='custom'){customSectionTrigger=trigger;$('modalBg').classList.add('show');$('modalBg').setAttribute('aria-hidden','false');$('customTitle').focus();return}
  triggerQuickSectionAdd(trigger.dataset.add);
  return;
 }
 const quickTrigger=event.target.closest('[data-quick-add]');
 if(quickTrigger){triggerQuickSectionAdd(quickTrigger.dataset.quickAdd);}
});
$('confirmCustom').addEventListener('click',()=>{transact(()=>addSection('custom',$('customTitle').value.trim()||'Additional information',$('customContent').value));closeCustomSectionDialog()});
$('cancelCustom').addEventListener('click',closeCustomSectionDialog);
$('modalBg').addEventListener('click',e=>{if(e.target===$('modalBg'))closeCustomSectionDialog()});
$('coverLetterBtn').addEventListener('click',openCoverLetter);$('closeCoverLetter').addEventListener('click',closeCoverLetter);$('coverLetterModalBg').addEventListener('click',e=>{if(e.target===$('coverLetterModalBg'))closeCoverLetter()});$('generateCoverLetter').addEventListener('click',generateCoverLetter);$('copyCoverLetter').addEventListener('click',copyCoverLetter);$('downloadCoverLetter').addEventListener('click',downloadCoverLetter);$('downloadCoverLetterPdf').addEventListener('click',previewCoverLetterPdf);
$('pageLayout').addEventListener('change',e=>transact(()=>state.layout=e.target.value==='two'?'two':'single'));
$('editMode').addEventListener('change',e=>{
 const nextMode=e.target.value==='free'?'free':'flow';
 if(nextMode==='free'&&state.mode!=='free')captureStructuredPages();
 transact(()=>{state.mode=nextMode});
});
$('zoomIn').addEventListener('click',()=>{zoom=Math.min(1.5,zoom+.05);renderSheets()});$('zoomOut').addEventListener('click',()=>{zoom=Math.max(.45,zoom-.05);renderSheets()});
$('saveBtn').addEventListener('click',exportJSON);$('loadBtn').addEventListener('click',()=>$('jsonInput').click());$('jsonInput').addEventListener('change',e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value=''});
 $('googleSignInBtn').addEventListener('click',async()=>{
  try{await signInWithGoogle()}
  catch(error){toast(authErrorMessage(error))}
 });
  $('browserSaveToggle').addEventListener('change',event=>{
   if(cloudUser){updateBrowserPersistenceUI();return}
   const enabled=event.target.checked;
   clearTimeout(saveTimer);
   try{guestResumeStorage.setEnabled(enabled)}
   catch(error){
    console.error('Could not update the browser resume-saving preference.',error);
    $('saveState').title=error.message||'Could not update the browser-saving preference.';
   }
   if(!enabled){
    localPersistenceBlocked=false;
    recoverySnapshot=null;
    $('recoveryBanner').hidden=true;
    setSaveState(currentSaveStateLabel());
   }else if(!localPersistenceBlocked){
    guestResumeDirty=true;
    try{
     guestResumeStorage.save(state);
     guestResumeLoaded=true;
     setSaveState('Saved locally');
    }catch(error){
     console.error('Could not save the current resume in this browser.',error);
     setSaveState('Unable to save changes');
     $('saveState').title=error.message||'Could not save the current resume in this browser.';
    }
   }
   updateBrowserPersistenceUI();
   if(guestResumeStorage.preferenceError)setSaveState('Unable to save changes');
  });
 $('googleSignOutBtn').addEventListener('click',async()=>{
  $('accountMenu').open=false;
  const button=$('googleSignOutBtn');
  if(signOutPending)return;
  signOutPending=true;
  button.disabled=true;
  button.textContent='Signing out…';
  try{await signOutUser();toast('Signed out. Your local browser copy is unchanged.')}
  catch(error){console.error('Could not sign out.',error);toast(error.message||'Could not sign out.')}
  finally{
   signOutPending=false;
   button.disabled=false;
   button.textContent='Sign out';
  }
 });
 $('cloudResumesBtn').addEventListener('click',()=>{$('accountMenu').open=false;openCloudModal()});
 document.addEventListener('click',event=>{if(!$('accountMenu').contains(event.target))$('accountMenu').open=false});
 $('accountMenu').addEventListener('keydown',event=>{if(event.key==='Escape'&&$('accountMenu').open){$('accountMenu').open=false;$('accountMenu').querySelector('summary').focus()}});
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
 $('downloadRecoveryBackup').addEventListener('click',downloadRecoveryData);
 $('resolveRecovery').addEventListener('click',resolveLocalRecovery);
 $('pdfBtn').addEventListener('click',()=>exportPDF());$('closePdfPreview').addEventListener('click',closePdfPreview);$('cancelPdfPreview').addEventListener('click',closePdfPreview);$('downloadPdfPreview').addEventListener('click',downloadPreviewPdf);$('pdfPreviewModalBg').addEventListener('click',e=>{if(e.target===$('pdfPreviewModalBg'))closePdfPreview()});$('atsBtn').addEventListener('click',openAts);$('atsFriendlyBtn').addEventListener('click',applyAtsFriendlyLayout);$('runAtsBtn').addEventListener('click',()=>runAtsChecks());$('closeAts').addEventListener('click',closeAts);
$('docName').addEventListener('change',e=>transact(()=>state.docName=e.target.value.trim()||'Untitled resume'));
$('dismissOnboarding').addEventListener('click',()=>{$('onboardingCard').hidden=true;onboardingDismissed=true;savePrefs()});
$('undoBtn')?.addEventListener('click',undo);
$('redoBtn')?.addEventListener('click',redo);
let resizing=null;
function gripDown(side){return e=>{if(side==='l'?leftCollapsed:collapsed){side==='l'?toggleLeft():togglePanel();return}resizing=side;e.preventDefault()}}
$('panelGrip').addEventListener('pointerdown',gripDown('r'));$('leftGrip').addEventListener('pointerdown',gripDown('l'));
document.addEventListener('pointermove',e=>{if(!resizing)return;if(resizing==='r')panelWidth=Math.max(RW[0],Math.min(RW[1],window.innerWidth-e.clientX));else leftWidth=Math.max(LW[0],Math.min(LW[1],e.clientX));applyPanels()});
document.addEventListener('pointerup',()=>{if(resizing){resizing=null;savePrefs()}});
$('toggleLeftPanel')?.addEventListener('click',toggleLeft);$('toggleRightPanel')?.addEventListener('click',togglePanel);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.addEventListener('keydown',e=>{
 const modifier=e.metaKey||e.ctrlKey,key=e.key.toLowerCase(),editable=e.target.closest?.('[contenteditable="true"]');
 if(modifier&&key==='z'){
  if(editable){const before=directEditSnapshots.get(editable);if(before&&JSON.stringify(before)!==JSON.stringify(state)){recordHistory(before);redoHistory.push(deep(state));state=before;if(!state.sections.some(s=>s.id===selectedId))selectedId=null;render();saveLocal();updateUndoButton();toast('Undo complete');e.preventDefault();return}}
  if(!e.shiftKey){e.preventDefault();undo();return}
 }
 if(modifier&&(key==='y'||(key==='z'&&e.shiftKey))){e.preventDefault();redo();return}
 if(e.key==='Escape'){if($('modalBg').classList.contains('show'))closeCustomSectionDialog();closeAts();closeCoverLetter();closePdfPreview();closeCloudModal()}
});
const savedProject=guestResumeStorage.load();
if(savedProject.state)state=savedProject.state;
guestResumeLoaded=Boolean(savedProject.state);
showRecoveryNotice(savedProject);
addEventListener('pagehide',()=>{
 const persistenceMode=resumeStorageMode(cloudUser,guestResumeStorage.enabled);
 if(persistenceMode==='cloud'){
  if(cloudReady&&!cloudSaveBlocked){clearTimeout(cloudSaveTimer);void persistCloudResume()}
  return;
 }
 if(persistenceMode!=='browser'||localPersistenceBlocked)return;
 try{guestResumeStorage.save(state)}catch(error){console.error('Could not save the resume while closing the page.',error)}
});
loadPrefs();$('onboardingCard').hidden=onboardingDismissed;if(window.matchMedia('(max-width:800px)').matches){leftCollapsed=true;collapsed=true}render();{const lc=leftCollapsed;setTab(leftTab);leftCollapsed=lc;applyPanels()}updateBrowserPersistenceUI();if(guestResumeStorage.preferenceError)setSaveState('Unable to save changes');if(!cloudConfigured){updateCloudAccount(null,new Error('Add the Firebase web-app settings to enable cloud saving.'))}else observeAuth(updateCloudAccount);if(new URLSearchParams(location.search).get('tool')==='cover-letter')openCoverLetter()
})();
