/* ════════════════════════════════════════════════
   DealerPulse v3.0 — Shared Utilities (Cloud Edition)
   Backed by Firebase Firestore — synced across devices
   ════════════════════════════════════════════════ */

const TODAY = new Date().toISOString().slice(0,10);

/* ════════════════════════════════════════════════
   🔥 FIREBASE CONFIG — PASTE YOUR PROJECT CONFIG HERE
   Get this from: Firebase Console → ⚙ Project Settings
   → scroll to "Your apps" → Web app → SDK setup snippet
   ════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyBK22hE2gGkc3vf0UKHZ543SQo9sepv7EM",
  authDomain: "dealerpulse-d46dc.firebaseapp.com",
  projectId: "dealerpulse-d46dc",
  storageBucket: "dealerpulse-d46dc.firebasestorage.app",
  messagingSenderId: "721199360835",
  appId: "1:721199360835:web:b5e56091788abd8d24ddf6"
};

const FIREBASE_CONFIGURED = !Object.values(firebaseConfig).some(v=>String(v).includes('PASTE_YOUR'));

let db = null;
if(FIREBASE_CONFIGURED && typeof firebase !== 'undefined'){
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}

// ── CONFIG GUARD BANNER ──────────────────────────
function showConfigWarningIfNeeded(){
  if(FIREBASE_CONFIGURED) return;
  const b=document.createElement('div');
  b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#EF4444;color:#fff;text-align:center;padding:10px 16px;font-family:Inter,sans-serif;font-size:.82rem;font-weight:600';
  b.innerHTML='⚠️ Firebase is not configured yet — this site is running with no live data connection. Paste your Firebase config into <code style="background:rgba(0,0,0,.25);padding:1px 6px;border-radius:4px">assets/shared.js</code>.';
  document.body.prepend(b);
}

/* ════════════════════════════════════════════════
   🛡 ADMIN PANEL LOGIN — SET YOUR OWN CREDENTIALS HERE
   This is the username/password for admin.html only.
   Change these to something only you know, then redeploy.
   ════════════════════════════════════════════════ */
const ADMIN_CREDS = { user: "admin", pass: "ChangeThisPassword123!" };

// ── SESSION AUTH (kept local — each device keeps its own login session) ──
function getAuth(){try{return JSON.parse(localStorage.getItem('dp_auth'))||null;}catch{return null;}}
function setAuth(a){try{localStorage.setItem('dp_auth',JSON.stringify(a));}catch{}}
function clearAuth(){localStorage.removeItem('dp_auth');}

// ══════════════════════════════════════════════════
//  CLOUD DATA LAYER — all reads/writes go to Firestore
// ══════════════════════════════════════════════════

// ---- USERS ----
async function fetchAllUsers(){
  const snap = await db.collection('users').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchUserByUsername(username){
  const uname = username.toLowerCase().trim();
  const snap = await db.collection('users').where('username','==',uname).limit(1).get();
  if(snap.empty) return null;
  const d = snap.docs[0];
  return {id:d.id, ...d.data()};
}
async function createUser(user){
  const ref = await db.collection('users').add(user);
  return ref.id;
}
async function updateUserDoc(id, patch){
  await db.collection('users').doc(id).update(patch);
}

// Live listener: fires immediately + whenever the users collection changes anywhere
function listenAllUsers(callback){
  return db.collection('users').onSnapshot(snap=>{
    callback(snap.docs.map(d=>({id:d.id, ...d.data()})));
  }, err=>console.error('listenAllUsers error:', err));
}
function listenPendingUsers(callback){
  return db.collection('users').where('status','==','pending').onSnapshot(snap=>{
    callback(snap.docs.map(d=>({id:d.id, ...d.data()})));
  }, err=>console.error('listenPendingUsers error:', err));
}

// ---- LOGIN HISTORY ----
async function addHistoryEntry({userId,name,username,role,status,reason}){
  if(!db) return;
  await db.collection('history').add({
    userId: userId||null, name: name||'Unknown', username: username||'',
    role: role||'unknown', status, reason: reason||'',
    timestamp: new Date().toISOString(),
    browser: (navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg|Opera)/i)||['Unknown'])[0]
  });
}
function listenHistory(callback, limitN){
  limitN = limitN || 200;
  return db.collection('history').orderBy('timestamp','desc').limit(limitN).onSnapshot(snap=>{
    callback(snap.docs.map(d=>({id:d.id, ...d.data()})));
  }, err=>console.error('listenHistory error:', err));
}

// ── MATH / FORMAT HELPERS (unchanged — pure functions, no data dependency) ──
function fmtINR(n){
  n=n||0;const a=Math.abs(n);
  const s=a>=10000000?'₹'+(a/10000000).toFixed(2)+' Cr':a>=100000?'₹'+(a/100000).toFixed(2)+' L':'₹'+Math.round(a).toLocaleString('en-IN');
  return n<0?'-'+s:s;
}
function pct(a,b){return b>0?Math.min(100,Math.round(a/b*100)):0;}
function score(r){return Math.round(pct(r.current.dealers,r.targets.dealers)*.5+pct(r.current.newDealers,r.targets.newDealers)*.5);}

// ══════════════════════════════════════════════════
//  ORGANIZATIONS — self-service registration, admin-approved
// ══════════════════════════════════════════════════
async function fetchOrgs(){
  const snap = await db.collection('organizations').orderBy('name').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchApprovedOrgs(){
  const all = await fetchOrgs();
  return all.filter(o=>o.status==='approved');
}
async function fetchOrgById(orgId){
  if(!orgId) return null;
  const doc = await db.collection('organizations').doc(orgId).get();
  return doc.exists ? {id:doc.id, ...doc.data()} : null;
}
// Admin creates an org directly — auto-approved, no review needed
async function createOrg(name){
  const ref = await db.collection('organizations').add({
    name:name.trim(), status:'approved', createdAt:new Date().toISOString(),
    approvedAt:new Date().toISOString(), requestedBy:null
  });
  return ref.id;
}
// A signing-up user requests a brand new org — goes in as 'pending' until admin approves
async function createOrgRequest(name, requestedByName){
  const ref = await db.collection('organizations').add({
    name:name.trim(), status:'pending', createdAt:new Date().toISOString(),
    approvedAt:null, requestedBy:requestedByName||null
  });
  return ref.id;
}
async function approveOrg(orgId){
  await db.collection('organizations').doc(orgId).update({status:'approved', approvedAt:new Date().toISOString()});
}
async function rejectOrg(orgId){
  await db.collection('organizations').doc(orgId).delete();
}
async function deleteOrg(orgId){
  await db.collection('organizations').doc(orgId).delete();
}
function listenOrgs(callback){
  return db.collection('organizations').orderBy('name').onSnapshot(snap=>{
    callback(snap.docs.map(d=>({id:d.id, ...d.data()})));
  }, err=>console.error('listenOrgs error:', err));
}

// ══════════════════════════════════════════════════
//  TEAMS — one doc per manager: {orgId, managerId, managerName, reps[], incentives{}}
// ══════════════════════════════════════════════════
const DEFAULT_TEAM_INCENTIVES = {perRepSale:500,perRepNewDealer:2500,channelBonus:1000,channelPeriod:3};

async function fetchTeam(managerId){
  const doc = await db.collection('teams').doc(managerId).get();
  if(doc.exists) return doc.data();
  return null;
}
async function ensureTeam(managerId, managerName, orgId){
  const ref = db.collection('teams').doc(managerId);
  const doc = await ref.get();
  if(!doc.exists){
    const fresh = {orgId, managerId, managerName, reps:[], incentives:{...DEFAULT_TEAM_INCENTIVES}};
    await ref.set(fresh);
    return fresh;
  }
  return doc.data();
}
async function saveTeam(managerId, data){
  await db.collection('teams').doc(managerId).set(data);
}
function listenTeam(managerId, callback){
  return db.collection('teams').doc(managerId).onSnapshot(doc=>{
    if(doc.exists) callback(doc.data());
  }, err=>console.error('listenTeam error:', err));
}
async function fetchManagersInOrg(orgId){
  const snap = await db.collection('users').where('orgId','==',orgId).where('role','==','manager').where('status','==','approved').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

// ══════════════════════════════════════════════════
//  ORG FINANCIALS — one shared P&L per organization
// ══════════════════════════════════════════════════
const DEFAULT_ORG_FINANCIALS = {revenue:0,cogs:0,salaries:0,marketing:0,logistics:0,otherOpEx:0,otherIncome:0,taxRate:25,monthsElapsed:1};

async function fetchOrgFinancials(orgId){
  const ref = db.collection('orgFinancials').doc(orgId);
  const doc = await ref.get();
  if(doc.exists) return doc.data();
  await ref.set(DEFAULT_ORG_FINANCIALS);
  return {...DEFAULT_ORG_FINANCIALS};
}
async function saveOrgFinancials(orgId, data){
  await db.collection('orgFinancials').doc(orgId).set(data);
}
function listenOrgFinancials(orgId, callback){
  return db.collection('orgFinancials').doc(orgId).onSnapshot(doc=>{
    if(doc.exists) callback(doc.data());
  }, err=>console.error('listenOrgFinancials error:', err));
}

// ══════════════════════════════════════════════════
//  SHARE REQUESTS — Manager A asks to view Manager B's team (read-only)
// ══════════════════════════════════════════════════
async function createShareRequest({orgId,fromManagerId,fromManagerName,toManagerId,toManagerName}){
  await db.collection('shareRequests').add({
    orgId,fromManagerId,fromManagerName,toManagerId,toManagerName,
    status:'pending', createdAt:new Date().toISOString(), respondedAt:null
  });
}
async function updateShareRequest(id, patch){
  await db.collection('shareRequests').doc(id).update(patch);
}
function listenIncomingShareRequests(managerId, callback){
  return db.collection('shareRequests').where('toManagerId','==',managerId).onSnapshot(snap=>{
    callback(snap.docs.map(d=>({id:d.id, ...d.data()})));
  }, err=>console.error('listenIncomingShareRequests error:', err));
}
function listenOutgoingShareRequests(managerId, callback){
  return db.collection('shareRequests').where('fromManagerId','==',managerId).onSnapshot(snap=>{
    callback(snap.docs.map(d=>({id:d.id, ...d.data()})));
  }, err=>console.error('listenOutgoingShareRequests error:', err));
}

function uid(){return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);}
function escAttr(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function calcPL(f){
  const opEx=(f.salaries||0)+(f.marketing||0)+(f.logistics||0)+(f.otherOpEx||0);
  const gross=(f.revenue||0)-(f.cogs||0);
  const operating=gross-opEx;
  const npbt=operating+(f.otherIncome||0);
  const tax=npbt>0?npbt*(f.taxRate||0)/100:0;
  return{gross,opEx,operating,npbt,tax,pat:npbt-tax,grossPct:f.revenue?Math.round(gross/f.revenue*100):0};
}
function projectQ(f){
  const m=Math.max(1,f.monthsElapsed||1),k=3/m;
  return calcPL({...f,revenue:f.revenue*k,cogs:f.cogs*k,salaries:f.salaries*k,
    marketing:f.marketing*k,logistics:f.logistics*k,otherOpEx:f.otherOpEx*k});
}
function plRow(label,value,isTotal,indent){
  const neg=value<0;
  const cls='pl-row'+(isTotal?' pl-t':'')+(indent?' pl-i':'');
  const vCls=neg?'pl-vn':isTotal?(value>=0?'pl-vg':'pl-vn'):'pl-mv';
  const txt=neg?'('+fmtINR(Math.abs(value))+')':fmtINR(value);
  return '<div class="'+cls+'"><span class="pl-ml">'+label+'</span><span class="'+vCls+'">'+txt+'</span></div>';
}
function timeSince(ts){
  if(!ts)return 'Never';
  const s=Math.floor((Date.now()-new Date(ts))/1000);
  if(s<60)return s+'s ago';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
function fmtDT(ts){
  if(!ts)return '—';
  return new Date(ts).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

// ── UI HELPERS ────────────────────────────────────
function toast(msg,icon){
  icon=icon||'✓';
  const w=document.getElementById('toast-wrap');if(!w)return;
  const t=document.createElement('div');t.className='toast';
  t.innerHTML='<span>'+icon+'</span>'+msg;
  w.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut .3s ease forwards';setTimeout(()=>t.remove(),300);},2800);
}
function openModal(id){const e=document.getElementById(id);if(e)e.classList.add('on');}
function closeModal(id){const e=document.getElementById(id);if(e)e.classList.remove('on');}
function toggleMob(){document.getElementById('mob-ovl')?.classList.toggle('on');document.getElementById('mob-drawer')?.classList.toggle('on');}
function closeMob(){document.getElementById('mob-ovl')?.classList.remove('on');document.getElementById('mob-drawer')?.classList.remove('on');}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeMob();document.querySelectorAll('.modal-ov.on,.confirm-ov.on').forEach(el=>el.classList.remove('on'));}
});
document.addEventListener('DOMContentLoaded', showConfigWarningIfNeeded);
