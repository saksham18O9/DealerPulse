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

// ── DEFAULT SEED DATA (used only the very first time the database is empty) ──
const DEFAULT_SALES_DATA = {
  reps:[
    {id:'r1',name:'Ravi Sharma',territory:'Pataudi',
     targets:{dealers:45,newDealers:8},
     current:{dealers:32,newDealers:5,location:'Pataudi Main Market',updatedAt:'2026-06-12'},
     expenses:[{id:'e1',date:'2026-06-10',desc:'Travel to Pataudi',amount:850,status:'pending'},
               {id:'e2',date:'2026-06-08',desc:'Client lunch meeting',amount:1200,status:'approved'}]},
    {id:'r2',name:'Priya Mehta',territory:'Bilaspur',
     targets:{dealers:40,newDealers:6},
     current:{dealers:28,newDealers:4,location:'Bilaspur Central',updatedAt:'2026-06-13'},
     expenses:[{id:'e3',date:'2026-06-11',desc:'Fuel reimbursement',amount:1100,status:'pending'}]},
    {id:'r3',name:'Arjun Singh',territory:'HaileyMandi',
     targets:{dealers:50,newDealers:10},
     current:{dealers:41,newDealers:8,location:'HaileyMandi Hub',updatedAt:TODAY},
     expenses:[{id:'e4',date:'2026-06-09',desc:'Demo materials',amount:2200,status:'approved'}]},
  ],
  incentives:{perRepSale:500,perRepNewDealer:2500,channelBonus:1000,channelPeriod:3},
  financials:{revenue:4200000,cogs:2800000,salaries:380000,marketing:120000,logistics:95000,
              otherOpEx:55000,otherIncome:50000,taxRate:25,monthsElapsed:2}
};

const DEFAULT_USERS_SEED = [
  {name:'Manager',username:'manager',password:'Admin@123',role:'manager',repId:null,territory:null,
   status:'approved',createdAt:new Date().toISOString(),approvedAt:new Date().toISOString(),approvedBy:'system',
   rejectedAt:null,rejectionNote:'',lastLoginAt:null,loginCount:0},
  {name:'Ravi Sharma',username:'ravi.sharma',password:'Sales@123',role:'rep',repId:'r1',territory:'Pataudi',
   status:'approved',createdAt:new Date().toISOString(),approvedAt:new Date().toISOString(),approvedBy:'system',
   rejectedAt:null,rejectionNote:'',lastLoginAt:null,loginCount:0},
  {name:'Priya Mehta',username:'priya.mehta',password:'Sales@123',role:'rep',repId:'r2',territory:'Bilaspur',
   status:'approved',createdAt:new Date().toISOString(),approvedAt:new Date().toISOString(),approvedBy:'system',
   rejectedAt:null,rejectionNote:'',lastLoginAt:null,loginCount:0},
  {name:'Arjun Singh',username:'arjun.singh',password:'Sales@123',role:'rep',repId:'r3',territory:'HaileyMandi',
   status:'approved',createdAt:new Date().toISOString(),approvedAt:new Date().toISOString(),approvedBy:'system',
   rejectedAt:null,rejectionNote:'',lastLoginAt:null,loginCount:0},
];

// ── SEEDING (runs once, only if the database is empty) ──
let _seedPromise = null;
function seedIfEmpty(){
  if(!db) return Promise.resolve();
  if(_seedPromise) return _seedPromise;
  _seedPromise = (async()=>{
    const snap = await db.collection('users').limit(1).get();
    if(snap.empty){
      const batch = db.batch();
      DEFAULT_USERS_SEED.forEach(u=>{
        const ref = db.collection('users').doc();
        batch.set(ref, u);
      });
      batch.set(db.collection('salesData').doc('main'), DEFAULT_SALES_DATA);
      await batch.commit();
    } else {
      const sd = await db.collection('salesData').doc('main').get();
      if(!sd.exists) await db.collection('salesData').doc('main').set(DEFAULT_SALES_DATA);
    }
  })();
  return _seedPromise;
}

// ── SESSION AUTH (kept local — each device keeps its own login session) ──
function getAuth(){try{return JSON.parse(localStorage.getItem('dp_auth'))||null;}catch{return null;}}
function setAuth(a){try{localStorage.setItem('dp_auth',JSON.stringify(a));}catch{}}
function clearAuth(){localStorage.removeItem('dp_auth');}

// ══════════════════════════════════════════════════
//  CLOUD DATA LAYER — all reads/writes go to Firestore
// ══════════════════════════════════════════════════

// ---- USERS ----
async function fetchAllUsers(){
  await seedIfEmpty();
  const snap = await db.collection('users').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchUserByUsername(username){
  await seedIfEmpty();
  const uname = username.toLowerCase().trim();
  const snap = await db.collection('users').where('username','==',uname).limit(1).get();
  if(snap.empty) return null;
  const d = snap.docs[0];
  return {id:d.id, ...d.data()};
}
async function createUser(user){
  await seedIfEmpty();
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

// ---- SALES DATA (reps, incentives, financials) ----
async function fetchSalesData(){
  await seedIfEmpty();
  const doc = await db.collection('salesData').doc('main').get();
  return doc.exists ? doc.data() : DEFAULT_SALES_DATA;
}
async function saveSalesData(data){
  await db.collection('salesData').doc('main').set(data);
}
function listenSalesData(callback){
  return db.collection('salesData').doc('main').onSnapshot(doc=>{
    if(doc.exists) callback(doc.data());
  }, err=>console.error('listenSalesData error:', err));
}

// ── MATH / FORMAT HELPERS (unchanged — pure functions, no data dependency) ──
function fmtINR(n){
  n=n||0;const a=Math.abs(n);
  const s=a>=10000000?'₹'+(a/10000000).toFixed(2)+' Cr':a>=100000?'₹'+(a/100000).toFixed(2)+' L':'₹'+Math.round(a).toLocaleString('en-IN');
  return n<0?'-'+s:s;
}
function pct(a,b){return b>0?Math.min(100,Math.round(a/b*100)):0;}
function score(r){return Math.round(pct(r.current.dealers,r.targets.dealers)*.5+pct(r.current.newDealers,r.targets.newDealers)*.5);}
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
