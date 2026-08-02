import { readCloudSave, writeSave } from './lib/storage.js';

const $ = selector => document.querySelector(selector);

const BOSS = {
  id: 'iron-warden-v1',
  name: 'The Iron Warden',
  title: 'Gatekeeper of the First Forge',
  icon: '🛡️',
  maxHp: 600,
  rewardXp: 100,
  loot: {
    id: 'iron-warden-sigil',
    name: 'Sigil of the First Forge',
    icon: '🔱',
    rarity: 'Rare',
    description: 'Proof that the First Forge has fallen.'
  }
};

let busy = false;
let refreshTimer = null;

function styles() {
  if ($('#fitquestBossStyles')) return;

  const style = document.createElement('style');
  style.id = 'fitquestBossStyles';
  style.textContent = `
    .fitquest-boss-card{margin:22px 0;padding:24px;border-radius:24px;border:1px solid rgba(255,112,112,.18);background:radial-gradient(circle at 80% 0%,rgba(255,91,91,.13),transparent 38%),linear-gradient(145deg,rgba(21,28,52,.97),rgba(11,17,34,.97));box-shadow:0 22px 60px rgba(0,0,0,.24);color:#f6f8ff}
    .fitquest-boss-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.fitquest-boss-heading{display:flex;gap:14px;align-items:center}.fitquest-boss-icon{width:58px;height:58px;display:grid;place-items:center;flex:0 0 auto;border-radius:18px;font-size:30px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09)}
    .fitquest-boss-eyebrow{margin:0 0 5px;color:#ff9a9a;font-size:11px;font-weight:900;letter-spacing:.16em}.fitquest-boss-heading h3{margin:0;font-size:23px}.fitquest-boss-heading small{display:block;margin-top:4px;color:#8f9bb5}.fitquest-boss-status{padding:8px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);color:#ffb1b1;font-size:11px;font-weight:900;white-space:nowrap}.fitquest-boss-status.defeated{color:#76e8b5;border-color:rgba(118,232,181,.20);background:rgba(118,232,181,.08)}
    .fitquest-boss-hp-row{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:#aeb8cd;font-size:12px;font-weight:800}.fitquest-boss-bar{height:13px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.06)}.fitquest-boss-bar>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff6d72,#ffab66);transition:width .35s ease}
    .fitquest-boss-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.fitquest-boss-grid>div{padding:12px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}.fitquest-boss-grid small,.fitquest-boss-grid strong{display:block}.fitquest-boss-grid small{color:#8793ad;margin-bottom:4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.fitquest-boss-grid strong{color:#eef2ff;font-size:13px}
    .fitquest-boss-callout{margin-top:14px;color:#b2bdd2;font-size:13px;line-height:1.5}.fitquest-boss-loot{margin-top:14px;padding:13px 14px;border-radius:14px;border:1px solid rgba(172,112,255,.22);background:rgba(145,89,255,.08);color:#d9c6ff;font-size:13px;line-height:1.45}.fitquest-boss-flash{animation:fitquestBossHit .6s ease}@keyframes fitquestBossHit{0%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}100%{transform:translateX(0)}}
    @media(max-width:700px){.fitquest-boss-head{align-items:stretch;flex-direction:column}.fitquest-boss-grid{grid-template-columns:1fr}}
  `;

  document.head.appendChild(style);
}

function ensureBoss(data) {
  data.ui ||= {};
  data.ui.rpg ||= {};
  data.ui.rpg.inventory ||= [];
  data.ui.rpg.bosses ||= {};

  if (!data.ui.rpg.bosses[BOSS.id]) {
    data.ui.rpg.bosses[BOSS.id] = {
      id: BOSS.id,
      name: BOSS.name,
      title: BOSS.title,
      maxHp: BOSS.maxHp,
      hp: BOSS.maxHp,
      attacks: [],
      defeated: false,
      defeatedAt: null,
      rewardGranted: false
    };
  }

  const boss = data.ui.rpg.bosses[BOSS.id];
  boss.maxHp = Number(boss.maxHp) || BOSS.maxHp;
  boss.hp = Math.max(0, Math.min(boss.maxHp, Number(boss.hp ?? boss.maxHp)));
  boss.attacks ||= [];
  return boss;
}

function streakFor(data, upToDate) {
  const dates = [...new Set(
    (data.workouts || [])
      .filter(w => w.completed && w.date && w.date <= upToDate)
      .map(w => w.date)
  )].sort();

  if (!dates.length) return 0;

  let streak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const a = new Date(`${dates[i]}T12:00:00`);
    const b = new Date(`${dates[i - 1]}T12:00:00`);
    const diff = Math.round((a - b) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function damageFor(workout, streak) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const sets = exercises.filter(e => e.type === 'strength').reduce((n, e) => n + (Number(e.sets) || 0), 0);
  const cardio = exercises.filter(e => e.type === 'cardio').reduce((n, e) => n + (Number(e.duration) || 0), 0);

  return Math.max(
    55,
    Math.min(
      190,
      Math.round(30 + exercises.length * 12 + sets * 3 + cardio * 1.5 + Math.min(35, streak * 5))
    )
  );
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__fitquestBossToast);
  window.__fitquestBossToast = setTimeout(() => el.classList.remove('show'), 3200);
}

function applyPendingAttacks(data) {
  const boss = ensureBoss(data);
  let changed = false;
  let lastResult = null;

  const workouts = [...(data.workouts || [])]
    .filter(w => w.completed && Array.isArray(w.exercises) && w.exercises.length > 0)
    .sort((a, b) => String(a.completedAt || a.date || '').localeCompare(String(b.completedAt || b.date || '')));

  for (const workout of workouts) {
    if (boss.defeated) break;
    if (workout.bossAttackApplied?.bossId === BOSS.id) continue;

    const streak = streakFor(data, workout.date);
    const damage = damageFor(workout, streak);
    const before = boss.hp;
    const after = Math.max(0, before - damage);
    const at = workout.completedAt || new Date().toISOString();

    const attack = {
      id: `boss-hit-${workout.id || Date.now()}`,
      workoutId: workout.id || null,
      date: workout.date || null,
      damage,
      hpBefore: before,
      hpAfter: after,
      streak,
      at
    };

    boss.hp = after;
    boss.attacks.push(attack);
    boss.lastAttack = attack;
    workout.bossAttackApplied = { bossId: BOSS.id, damage, at };
    changed = true;

    let defeatedNow = false;
    if (after === 0 && !boss.defeated) {
      defeatedNow = true;
      boss.defeated = true;
      boss.defeatedAt = at;

      if (!boss.rewardGranted) {
        boss.rewardGranted = true;
        workout.bossRewardXp = BOSS.rewardXp;
        workout.completionXp = (Number(workout.completionXp) || 0) + BOSS.rewardXp;
        workout.completionSummary = `${workout.completionSummary || 'Adventure completed'} · Boss victory +${BOSS.rewardXp} XP`;

        if (!data.ui.rpg.inventory.some(item => item.id === BOSS.loot.id)) {
          data.ui.rpg.inventory.push({ ...BOSS.loot, earnedAt: at, source: BOSS.name });
        }
      }
    }

    lastResult = { attack, defeatedNow };
  }

  return { changed, lastResult, boss };
}

function render(data) {
  const statsGrid = $('.stats-grid');
  if (!statsGrid) return;

  let card = $('#fitquestBossBattle');
  if (!card) {
    card = document.createElement('section');
    card.id = 'fitquestBossBattle';
    card.className = 'fitquest-boss-card';
    statsGrid.insertAdjacentElement('afterend', card);
  }

  const boss = ensureBoss(data);
  const hpPercent = boss.maxHp ? Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100)) : 0;
  const totalDamage = boss.attacks.reduce((sum, attack) => sum + (Number(attack.damage) || 0), 0);
  const lastHit = boss.lastAttack?.damage ? `${boss.lastAttack.damage} damage` : 'No strikes yet';
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const current = (data.workouts || []).find(w => w.date === todayIso);
  const preview = current && !current.completed && (current.exercises || []).length
    ? damageFor(current, streakFor(data, todayIso))
    : null;
  const loot = data.ui.rpg.inventory.find(item => item.id === BOSS.loot.id);

  card.innerHTML = `
    <div class="fitquest-boss-head">
      <div class="fitquest-boss-heading">
        <div class="fitquest-boss-icon">${BOSS.icon}</div>
        <div><p class="fitquest-boss-eyebrow">WEEKLY BOSS · FIRST FORGE</p><h3>${BOSS.name}</h3><small>${BOSS.title}</small></div>
      </div>
      <span class="fitquest-boss-status ${boss.defeated ? 'defeated' : ''}">${boss.defeated ? '✓ DEFEATED' : '⚔ ACTIVE BATTLE'}</span>
    </div>
    <div class="fitquest-boss-hp-row"><span>Boss Health</span><strong>${Math.round(boss.hp)} / ${boss.maxHp} HP</strong></div>
    <div class="fitquest-boss-bar" aria-label="Boss health"><i style="width:${hpPercent}%"></i></div>
    <div class="fitquest-boss-grid">
      <div><small>Adventures Struck</small><strong>${boss.attacks.length}</strong></div>
      <div><small>Total Damage</small><strong>${Math.round(totalDamage)}</strong></div>
      <div><small>Last Strike</small><strong>${lastHit}</strong></div>
    </div>
    <div class="fitquest-boss-callout">${boss.defeated ? 'The gate is broken. Your first campaign boss has fallen.' : preview ? `Finish today’s Adventure to strike for about ${preview} damage. Streaks increase your attack power.` : 'Complete an Adventure to attack. More moves, strength sets, cardio minutes, and streak days increase your damage.'}</div>
    ${loot ? `<div class="fitquest-boss-loot">${loot.icon} <strong>${loot.rarity} Loot Unlocked:</strong> ${loot.name} · +${BOSS.rewardXp} victory XP</div>` : `<div class="fitquest-boss-loot">🔒 Victory Reward: ${BOSS.loot.name} + ${BOSS.rewardXp} XP</div>`}
  `;
}

function flash() {
  const card = $('#fitquestBossBattle');
  if (!card) return;
  card.classList.remove('fitquest-boss-flash');
  void card.offsetWidth;
  card.classList.add('fitquest-boss-flash');
}

async function refresh() {
  if (busy || document.hidden) return;
  if (!$('#appRoot') || $('#appRoot').hidden) return;
  busy = true;

  try {
    const cloud = await readCloudSave();
    const data = cloud?.save;
    if (!data) return;

    const result = applyPendingAttacks(data);
    if (result.changed) await writeSave(data);

    render(data);

    if (result.lastResult) {
      flash();
      if (result.lastResult.defeatedNow) {
        toast(`🏆 ${BOSS.name} defeated! ${BOSS.loot.name} unlocked.`);
      } else {
        toast(`⚔️ Boss strike! ${result.lastResult.attack.damage} damage dealt.`);
      }
    }
  } catch (error) {
    console.warn('Boss Battle refresh failed:', error);
  } finally {
    busy = false;
  }
}

function scheduleRefresh(delay = 450) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refresh(), delay);
}

function boot() {
  styles();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if ($('#appRoot') && !$('#appRoot').hidden && $('.stats-grid')) {
      clearInterval(timer);
      void refresh();
    } else if (attempts > 100) {
      clearInterval(timer);
    }
  }, 150);

  window.addEventListener('fitquest:sync', event => {
    if (event.detail?.status === 'synced') scheduleRefresh(650);
  });

  window.addEventListener('fitquest:remote-update', () => scheduleRefresh(250));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh(200);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
