import './navigation.js';
import './dailyActivity.js';
import { readCloudSave, writeSave } from './lib/storage.js';

const $ = selector => document.querySelector(selector);

const BOSS = {
  id:'iron-warden-v1', name:'The Iron Warden', title:'Gatekeeper of the First Forge',
  icon:'🛡️', maxHp:600, rewardXp:100,
  loot:{id:'iron-warden-sigil',name:'Sigil of the First Forge',icon:'🔱',rarity:'Rare',
    description:'Proof that the First Forge has fallen.'}
};
let busy = false;

function styles(){
  if ($('#fitquestBossStyles')) return;
  const s=document.createElement('style'); s.id='fitquestBossStyles';
  s.textContent=`
  .fitquest-boss-card{margin:22px 0;padding:24px;border-radius:24px;border:1px solid rgba(255,112,112,.18);
    background:radial-gradient(circle at 80% 0%,rgba(255,91,91,.13),transparent 38%),linear-gradient(145deg,rgba(21,28,52,.97),rgba(11,17,34,.97));color:#f6f8ff}
  .fitquest-boss-head{display:flex;justify-content:space-between;gap:18px;margin-bottom:18px}.fitquest-boss-heading{display:flex;gap:14px;align-items:center}
  .fitquest-boss-icon{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;font-size:30px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09)}
  .fitquest-boss-eyebrow{margin:0 0 5px;color:#ff9a9a;font-size:11px;font-weight:900;letter-spacing:.16em}.fitquest-boss-heading h3{margin:0;font-size:23px}.fitquest-boss-heading small{color:#8f9bb5}
  .fitquest-boss-status{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.05);color:#ffb1b1;font-size:11px;font-weight:900}
  .fitquest-boss-hp-row{display:flex;justify-content:space-between;margin-bottom:8px;color:#aeb8cd;font-size:12px;font-weight:800}
  .fitquest-boss-bar{height:13px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.07)}.fitquest-boss-bar>i{display:block;height:100%;background:linear-gradient(90deg,#ff6d72,#ffab66)}
  .fitquest-boss-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.fitquest-boss-grid>div{padding:12px;border-radius:14px;background:rgba(255,255,255,.045)}
  .fitquest-boss-grid small,.fitquest-boss-grid strong{display:block}.fitquest-boss-grid small{color:#8793ad;font-size:10px;text-transform:uppercase}.fitquest-boss-callout{margin-top:14px;color:#b2bdd2;font-size:13px;line-height:1.5}
  .fitquest-boss-ready{margin-top:14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(105,232,177,.2);background:rgba(105,232,177,.07);color:#9eeec9;font-weight:800}
  .fitquest-boss-loot{margin-top:14px;padding:13px;border-radius:14px;border:1px solid rgba(172,112,255,.22);background:rgba(145,89,255,.08);color:#d9c6ff}
  .fitquest-boss-flash{animation:fqhit .6s ease}@keyframes fqhit{20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
  @media(max-width:700px){.fitquest-boss-head{flex-direction:column}.fitquest-boss-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}

function ensureBoss(data){
  data.ui ||= {}; data.ui.rpg ||= {}; data.ui.rpg.inventory ||= []; data.ui.rpg.bosses ||= {};
  data.ui.rpg.bosses[BOSS.id] ||= {id:BOSS.id,name:BOSS.name,title:BOSS.title,maxHp:BOSS.maxHp,hp:BOSS.maxHp,attacks:[],defeated:false,rewardGranted:false};
  const b=data.ui.rpg.bosses[BOSS.id]; b.attacks ||= []; b.maxHp=Number(b.maxHp)||BOSS.maxHp; b.hp=Math.max(0,Math.min(b.maxHp,Number(b.hp??b.maxHp))); return b;
}
function streakFor(data,date){
  const dates=[...new Set((data.workouts||[]).filter(w=>w.completed&&w.date&&w.date<=date).map(w=>w.date))].sort();
  if(!dates.length)return 0; let s=1;
  for(let i=dates.length-1;i>0;i--){const a=new Date(dates[i]+'T12:00:00'),b=new Date(dates[i-1]+'T12:00:00');if(Math.round((a-b)/86400000)===1)s++;else break;} return s;
}
function sliceDamage(exercises=[],streak=0){
  const sets=exercises.filter(e=>e.type==='strength').reduce((n,e)=>n+(Number(e.sets)||0),0);
  const cardio=exercises.filter(e=>e.type==='cardio').reduce((n,e)=>n+(Number(e.duration)||0),0);
  if(!exercises.length)return 0;
  return Math.max(12,Math.min(150,Math.round(exercises.length*12+sets*3+cardio*1.5+Math.min(20,streak*2))));
}
function activityDamage(c){
  if(!c)return 0;
  return Math.max(0,Math.min(60,Math.floor((Number(c.steps)||0)/1000)*2+Math.floor((Number(c.activeCalories)||0)/100)*2+Math.floor((Number(c.exerciseMinutes)||0)/15)*3+((Number(c.standHours)||0)>=10?5:0)));
}
function strike(boss,{id,date,damage,at,source}){
  const before=boss.hp,after=Math.max(0,before-damage);
  const attack={id,date,damage,hpBefore:before,hpAfter:after,source,at};
  boss.hp=after;boss.attacks.push(attack);boss.lastAttack=attack;
  return after===0&&!boss.defeated;
}
function grantVictory(data,boss,at){
  if(boss.rewardGranted)return; boss.rewardGranted=true; data.ui.rpg.bossVictoryXp=(Number(data.ui.rpg.bossVictoryXp)||0)+BOSS.rewardXp;
  if(!data.ui.rpg.inventory.some(i=>i.id===BOSS.loot.id))data.ui.rpg.inventory.push({...BOSS.loot,earnedAt:at,source:BOSS.name});
}
function applyPending(data){
  const boss=ensureBoss(data); let changed=false,last=null;
  for(const w of (data.workouts||[])){
    if(boss.defeated)break;
    const ex=Array.isArray(w.exercises)?w.exercises:[];
    const submitted=Math.max(0,Number(w.bossSubmittedExerciseCount)||0);
    const requested=Math.min(ex.length,Math.max(submitted,Number(w.bossStrikeRequestedCount)||0));
    if(requested<=submitted)continue;
    const chunk=ex.slice(submitted,requested),damage=sliceDamage(chunk,streakFor(data,w.date)),at=w.bossStrikeRequestedAt||new Date().toISOString();
    if(damage>0){
      const defeated=strike(boss,{id:`boss-move-${w.id||w.date}-${submitted}-${requested}`,date:w.date,damage,at,source:'adventure'});
      w.bossSubmittedExerciseCount=requested; w.bossLastStrikeDamage=damage; w.bossLastStrikeAt=at; changed=true; last=boss.lastAttack;
      if(defeated){boss.defeated=true;boss.defeatedAt=at;grantVictory(data,boss,at);}
    }
  }
  // Apple Watch is incremental: saving larger totals can create another field strike later.
  for(const c of (data.checkIns||[])){
    if(boss.defeated)break;
    const total=activityDamage(c),applied=Math.max(0,Number(c.bossActivityDamageApplied)||0),delta=Math.max(0,total-applied);
    if(delta<=0)continue;
    const at=c.activityUpdatedAt||new Date().toISOString();
    const defeated=strike(boss,{id:`boss-activity-${c.id||c.date}-${applied}-${total}`,date:c.date,damage:delta,at,source:'activity'});
    c.bossActivityDamageApplied=total;c.bossActivityApplied={bossId:BOSS.id,damage:total,at};changed=true;last=boss.lastAttack;
    if(defeated){boss.defeated=true;boss.defeatedAt=at;grantVictory(data,boss,at);}
  }
  return {boss,changed,last};
}
function readyDamage(data){
  const today=new Date(),iso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const w=(data.workouts||[]).find(x=>x.date===iso), ex=Array.isArray(w?.exercises)?w.exercises:[];
  const submitted=Math.max(0,Number(w?.bossSubmittedExerciseCount)||0);
  const move=sliceDamage(ex.slice(submitted),streakFor(data,iso));
  const c=(data.checkIns||[]).find(x=>x.date===iso), total=activityDamage(c), applied=Math.max(0,Number(c?.bossActivityDamageApplied)||0);
  return {move,activity:Math.max(0,total-applied)};
}
function render(data){
  const grid=$('.stats-grid'); if(!grid)return;
  let card=$('#fitquestBossBattle'); if(!card){card=document.createElement('section');card.id='fitquestBossBattle';card.className='fitquest-boss-card';grid.insertAdjacentElement('afterend',card);window.dispatchEvent(new CustomEvent('fitquest:boss-ready'));}
  const b=ensureBoss(data),pct=b.maxHp?b.hp/b.maxHp*100:0,total=b.attacks.reduce((n,a)=>n+(Number(a.damage)||0),0),ready=readyDamage(data);
  const last=b.lastAttack?.damage?`${b.lastAttack.damage} damage · ${b.lastAttack.source==='activity'?'⌚ Activity':'⚔️ Adventure'}`:'No strikes yet';
  const loot=data.ui.rpg.inventory.find(i=>i.id===BOSS.loot.id);
  card.innerHTML=`<div class="fitquest-boss-head"><div class="fitquest-boss-heading"><div class="fitquest-boss-icon">${BOSS.icon}</div><div><p class="fitquest-boss-eyebrow">WEEKLY BOSS · FIRST FORGE</p><h3>${BOSS.name}</h3><small>${BOSS.title}</small></div></div><span class="fitquest-boss-status">${b.defeated?'✓ DEFEATED':'⚔️ ACTIVE BATTLE'}</span></div>
  <div class="fitquest-boss-hp-row"><span>Boss Health</span><strong>${b.hp} / ${b.maxHp} HP</strong></div><div class="fitquest-boss-bar"><i style="width:${pct}%"></i></div>
  <div class="fitquest-boss-grid"><div><small>Strikes Landed</small><strong>${b.attacks.length}</strong></div><div><small>Total Damage</small><strong>${total}</strong></div><div><small>Last Strike</small><strong>${last}</strong></div></div>
  ${!b.defeated&&(ready.move||ready.activity)?`<div class="fitquest-boss-ready">⚔️ Ready: ${ready.move?`${ready.move} workout damage`:''}${ready.move&&ready.activity?' + ':''}${ready.activity?`${ready.activity} activity damage`:''}</div>`:''}
  <p class="fitquest-boss-callout">${b.defeated?'The gate is broken. The First Forge has fallen.':'Keep training all day. Use Submit Strike whenever new exercises are ready. Apple Watch totals add field damage as new activity is saved.'}</p>
  <div class="fitquest-boss-loot">${loot?`${loot.icon} Victory Reward Earned: ${loot.name} + ${BOSS.rewardXp} XP`:`🔒 Victory Reward: ${BOSS.loot.name} + ${BOSS.rewardXp} XP`}</div>`;
}
async function refresh(){
  if(busy)return;busy=true;
  try{const cloud=await readCloudSave(),data=cloud?.save;if(!data)return;const r=applyPending(data);if(r.changed)await writeSave(data);render(data);
    if(r.last){const c=$('#fitquestBossBattle');c?.classList.add('fitquest-boss-flash');setTimeout(()=>c?.classList.remove('fitquest-boss-flash'),700);window.dispatchEvent(new CustomEvent('fitquest:boss-hit',{detail:r.last}));}}
  catch(e){console.warn('Boss refresh failed:',e)}finally{busy=false}
}
function boot(){styles();let n=0;const t=setInterval(()=>{n++;if($('#appRoot')&&!$('#appRoot').hidden&&$('.stats-grid')){clearInterval(t);void refresh()}else if(n>120)clearInterval(t)},120);
  ['fitquest:boss-strike-requested','fitquest:remote-update'].forEach(name=>window.addEventListener(name,()=>setTimeout(()=>void refresh(),180)));
  window.addEventListener('fitquest:navigation',e=>{if(e.detail?.screen==='home')void refresh()});
  setInterval(()=>void refresh(),5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
