import { readCloudSave, writeSave } from './lib/storage.js';
import { calculateStats } from './lib/progression.js';
import { achievementSummary } from './lib/achievements.js';

const $ = selector => document.querySelector(selector);

const CLASSES = [
  {
    id: 'vanguard',
    icon: '🛡️',
    name: 'Vanguard',
    unlockLevel: 1,
    tagline: 'Consistency before spectacle.',
    flavor: 'A durable campaign class built around showing up, stacking sessions, and refusing to disappear.',
    affinity: 'Streaks & completed Adventures'
  },
  {
    id: 'ironborn',
    icon: '⚔️',
    name: 'Ironborn',
    unlockLevel: 1,
    tagline: 'Built in the forge.',
    flavor: 'A strength-focused identity for adventurers who like sets, reps, and making fictional bosses regret clocking in.',
    affinity: 'Strength sets & boss strikes'
  },
  {
    id: 'pathfinder',
    icon: '🥾',
    name: 'Pathfinder',
    unlockLevel: 1,
    tagline: 'Every mile opens the map.',
    flavor: 'A movement-focused class for cardio, distance, steps, and turning ordinary travel into campaign territory.',
    affinity: 'Cardio & distance'
  },
  {
    id: 'sentinel',
    icon: '⌚',
    name: 'Sentinel',
    unlockLevel: 3,
    tagline: 'The day itself becomes training.',
    flavor: 'Unlocked for players who make movement, recovery, and Apple Watch activity part of the campaign.',
    affinity: 'Daily activity & recovery'
  },
  {
    id: 'warlord',
    icon: '👑',
    name: 'Warlord',
    unlockLevel: 5,
    tagline: 'Bosses become weekly paperwork.',
    flavor: 'A later-game class reserved for campaigns with enough XP to prove this is no temporary enthusiasm.',
    affinity: 'Boss victories & high-level play'
  }
];

const TITLES = [
  { id:'first-step', name:'The Initiate', icon:'🌱', requirement:'Log your first Adventure', test:({stats}) => stats.workouts >= 1 },
  { id:'iron-hand', name:'Forge Hand', icon:'⚒️', requirement:'Reach 25 strength sets', test:({stats}) => stats.strengthSets >= 25 },
  { id:'road-walker', name:'Road Walker', icon:'🥾', requirement:'Record 60 cardio minutes', test:({stats}) => stats.cardio >= 60 },
  { id:'streak-keeper', name:'Keeper of the Flame', icon:'🔥', requirement:'Reach a 3-day streak', test:({stats}) => stats.streak >= 3 },
  { id:'bossbreaker', name:'Wardenbreaker', icon:'💥', requirement:'Defeat a campaign boss', test:({bossDefeated}) => bossDefeated },
  { id:'level-three', name:'Veteran of the First Forge', icon:'🏅', requirement:'Reach Level 3', test:({stats}) => stats.level >= 3 },
  { id:'relic-bearer', name:'Relic Bearer', icon:'🔱', requirement:'Own 3 campaign relics', test:({inventory}) => inventory.length >= 3 },
  { id:'centurion', name:'The Centurion', icon:'💯', requirement:'Complete 100 strength sets', test:({stats}) => stats.strengthSets >= 100 }
];

const PATHS = [
  {
    id:'discipline',
    icon:'🔥',
    name:'Discipline',
    description:'Your consistency path.',
    nodes:[
      {name:'Spark', requirement:'1 Adventure', unlocked: c => c.stats.workouts >= 1},
      {name:'Ember', requirement:'3-day streak', unlocked: c => c.stats.streak >= 3},
      {name:'Inferno', requirement:'7-day streak', unlocked: c => c.stats.streak >= 7}
    ]
  },
  {
    id:'might',
    icon:'⚔️',
    name:'Might',
    description:'Your strength path.',
    nodes:[
      {name:'Grip', requirement:'10 sets', unlocked: c => c.stats.strengthSets >= 10},
      {name:'Forge', requirement:'50 sets', unlocked: c => c.stats.strengthSets >= 50},
      {name:'Titan', requirement:'150 sets', unlocked: c => c.stats.strengthSets >= 150}
    ]
  },
  {
    id:'exploration',
    icon:'🗺️',
    name:'Exploration',
    description:'Your movement path.',
    nodes:[
      {name:'Trailhead', requirement:'30 cardio min', unlocked: c => c.stats.cardio >= 30},
      {name:'Wayfinder', requirement:'120 cardio min', unlocked: c => c.stats.cardio >= 120},
      {name:'Horizon', requirement:'300 cardio min', unlocked: c => c.stats.cardio >= 300}
    ]
  }
];

let busy = false;

function styles() {
  if ($('#fitquestCharacterProgressionStyles')) return;

  const style = document.createElement('style');
  style.id = 'fitquestCharacterProgressionStyles';
  style.textContent = `
    .fq-progression-card{
      grid-column:1/-1;padding:22px;border-radius:22px;
      border:1px solid rgba(255,255,255,.08);
      background:
        radial-gradient(circle at 90% 0%,rgba(142,92,255,.09),transparent 36%),
        rgba(15,22,41,.94);color:#f4f6ff
    }
    .fq-progression-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:17px}
    .fq-progression-head p{margin:0;color:#8f9bb5;font-size:10px;font-weight:950;letter-spacing:.14em}
    .fq-progression-head h3{margin:4px 0 0;font-size:22px}
    .fq-progression-chip{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.05);color:#a7b2c9;font-size:10px;font-weight:900;white-space:nowrap}
    .fq-class-hero{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:15px;align-items:center;padding:17px;border-radius:18px;border:1px solid rgba(151,119,255,.18);background:rgba(111,83,255,.065)}
    .fq-class-icon{width:72px;height:72px;display:grid;place-items:center;border-radius:20px;background:linear-gradient(145deg,rgba(113,91,255,.18),rgba(176,76,239,.12));border:1px solid rgba(255,255,255,.09);font-size:35px}
    .fq-class-copy small,.fq-class-copy strong{display:block}.fq-class-copy small{color:#9a87ff;font-size:10px;font-weight:950;letter-spacing:.09em}.fq-class-copy strong{margin-top:4px;font-size:22px}
    .fq-class-copy span{display:block;margin-top:5px;color:#8f9ab2;font-size:12px;line-height:1.45}
    .fq-title-equipped{margin-top:8px;color:#d9caff;font-size:12px;font-weight:850}
    .fq-select-btn{min-height:42px;padding:0 13px;border-radius:12px;border:1px solid rgba(159,119,255,.23);background:rgba(137,91,255,.09);color:#ded3ff;font:inherit;font-size:11px;font-weight:900;cursor:pointer}
    .fq-section-label{margin:21px 0 10px;color:#8995ad;font-size:10px;font-weight:950;letter-spacing:.14em}
    .fq-class-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    .fq-class-option{position:relative;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);cursor:pointer}
    .fq-class-option.active{border-color:rgba(131,112,255,.33);background:rgba(113,84,255,.10)}
    .fq-class-option.locked{opacity:.48;cursor:not-allowed}
    .fq-class-option .icon{font-size:27px}.fq-class-option strong{display:block;margin-top:8px;font-size:13px}.fq-class-option small{display:block;margin-top:4px;color:#7f8ba5;font-size:9px;line-height:1.35}
    .fq-lock{position:absolute;right:10px;top:10px;font-size:12px}
    .fq-title-grid{display:flex;gap:8px;overflow:auto;padding-bottom:4px}
    .fq-title-btn{min-width:145px;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);color:#dce2f2;text-align:left;font:inherit;cursor:pointer}
    .fq-title-btn.locked{opacity:.42;cursor:not-allowed}.fq-title-btn.active{border-color:rgba(105,232,177,.28);background:rgba(105,232,177,.07)}
    .fq-title-btn span{font-size:21px}.fq-title-btn strong,.fq-title-btn small{display:block}.fq-title-btn strong{margin-top:5px;font-size:11px}.fq-title-btn small{margin-top:4px;color:#77839b;font-size:8px;line-height:1.35}
    .fq-path-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .fq-path{padding:14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.065)}
    .fq-path-head{display:flex;gap:9px;align-items:center;margin-bottom:10px}.fq-path-head span{font-size:23px}.fq-path-head strong{font-size:13px}.fq-path-head small{display:block;color:#77849e;font-size:8px;margin-top:2px}
    .fq-node-row{display:grid;gap:6px}.fq-node{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 9px;border-radius:10px;background:rgba(255,255,255,.035);color:#7f8aa2;font-size:9px}
    .fq-node.unlocked{color:#9cecc8;background:rgba(105,232,177,.065);border:1px solid rgba(105,232,177,.10)}
    .fq-vault-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .fq-vault-item{padding:12px;border-radius:14px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.065);min-width:0}
    .fq-vault-item span{display:block;font-size:26px}.fq-vault-item strong{display:block;margin-top:7px;font-size:10px;line-height:1.25;overflow-wrap:anywhere}.fq-vault-item small{display:block;margin-top:3px;color:#7b879f;font-size:8px;text-transform:uppercase}
    .fq-empty{grid-column:1/-1;padding:16px;border-radius:14px;border:1px dashed rgba(255,255,255,.10);color:#77839c;text-align:center;font-size:11px}
    .fq-medal-strip{display:flex;gap:7px;overflow:auto}.fq-medal{min-width:92px;padding:10px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);text-align:center}.fq-medal span{font-size:23px}.fq-medal strong{display:block;margin-top:5px;font-size:9px;line-height:1.2}
    @media(max-width:800px){.fq-class-grid,.fq-path-grid{grid-template-columns:1fr}.fq-vault-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fq-class-hero{grid-template-columns:62px minmax(0,1fr)}.fq-class-icon{width:62px;height:62px}.fq-class-hero>.fq-select-btn{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);
}

function context(data) {
  const stats = calculateStats(data);
  const achievements = achievementSummary(data, stats);
  const inventory = data.ui?.rpg?.inventory || [];
  const bosses = data.ui?.rpg?.bosses || {};
  const bossDefeated = Object.values(bosses).some(boss => boss?.defeated);

  return {
    stats,
    achievements,
    inventory,
    bossDefeated
  };
}

function unlockedTitles(ctx) {
  return TITLES.filter(title => title.test(ctx));
}

function activeClass(data, ctx) {
  const selected = data.ui?.rpg?.character?.classId;
  const usable = CLASSES.find(c => c.id === selected && ctx.stats.level >= c.unlockLevel);
  return usable || CLASSES[0];
}

function activeTitle(data, ctx) {
  const available = unlockedTitles(ctx);
  const selected = data.ui?.rpg?.character?.titleId;
  return available.find(t => t.id === selected) || available[0] || null;
}

async function saveCharacterSetting(key, value) {
  if (busy) return;
  busy = true;

  try {
    const cloud = await readCloudSave();
    const data = cloud?.save;
    if (!data) throw new Error('No cloud save is available.');

    data.ui ||= {};
    data.ui.rpg ||= {};
    data.ui.rpg.character ||= {};
    data.ui.rpg.character[key] = value;
    data.ui.rpg.character.updatedAt = new Date().toISOString();

    const ok = await writeSave(data);
    if (!ok) throw new Error('Unable to save character progression.');

    await renderFromCloud();
    window.dispatchEvent(new CustomEvent('fitquest:character-updated'));
  } catch (error) {
    window.alert(error?.message || 'Unable to update your character.');
  } finally {
    busy = false;
  }
}

function render(data) {
  const grid = $('#fitquestScreenGrid-character');
  if (!grid) return;

  let card = $('#fitquestCharacterProgression');

  if (!card) {
    card = document.createElement('section');
    card.id = 'fitquestCharacterProgression';
    card.className = 'fq-progression-card';
    grid.appendChild(card);
  }

  const ctx = context(data);
  const cls = activeClass(data, ctx);
  const title = activeTitle(data, ctx);
  const titles = unlockedTitles(ctx);
  const inventory = ctx.inventory;
  const medals = ctx.achievements.unlocked.slice(-8).reverse();

  card.innerHTML = `
    <div class="fq-progression-head">
      <div>
        <p>CHARACTER PROGRESSION · CAMPAIGN IDENTITY</p>
        <h3>Your Adventurer</h3>
      </div>
      <span class="fq-progression-chip">LVL ${ctx.stats.level} · ${ctx.stats.xp.toLocaleString()} XP</span>
    </div>

    <div class="fq-class-hero">
      <div class="fq-class-icon">${cls.icon}</div>

      <div class="fq-class-copy">
        <small>ACTIVE CLASS</small>
        <strong>${cls.name}</strong>
        <span>${cls.tagline} ${cls.flavor}</span>
        <div class="fq-title-equipped">
          ${title ? `${title.icon} ${title.name}` : 'No title equipped yet'}
        </div>
      </div>

      <button class="fq-select-btn" type="button" id="fqCycleTitle">
        🏷️ Change Title
      </button>
    </div>

    <div class="fq-section-label">CHOOSE YOUR CLASS · COSMETIC IDENTITY</div>

    <div class="fq-class-grid">
      ${CLASSES.map(option => {
        const unlocked = ctx.stats.level >= option.unlockLevel;
        return `
          <button
            class="fq-class-option ${option.id === cls.id ? 'active' : ''} ${unlocked ? '' : 'locked'}"
            type="button"
            data-class="${option.id}"
            ${unlocked ? '' : 'disabled'}
          >
            ${unlocked ? '' : `<span class="fq-lock">🔒</span>`}
            <span class="icon">${option.icon}</span>
            <strong>${option.name}</strong>
            <small>${unlocked ? option.affinity : `Unlocks at Level ${option.unlockLevel}`}</small>
          </button>
        `;
      }).join('')}
    </div>

    <div class="fq-section-label">UNLOCKED TITLES</div>

    <div class="fq-title-grid">
      ${TITLES.map(item => {
        const unlocked = item.test(ctx);
        return `
          <button
            class="fq-title-btn ${title?.id === item.id ? 'active' : ''} ${unlocked ? '' : 'locked'}"
            type="button"
            data-title="${item.id}"
            ${unlocked ? '' : 'disabled'}
          >
            <span>${unlocked ? item.icon : '🔒'}</span>
            <strong>${item.name}</strong>
            <small>${unlocked ? 'Tap to equip' : item.requirement}</small>
          </button>
        `;
      }).join('')}
    </div>

    <div class="fq-section-label">SKILL PATHS · EARNED, NOT SPENT</div>

    <div class="fq-path-grid">
      ${PATHS.map(path => `
        <div class="fq-path">
          <div class="fq-path-head">
            <span>${path.icon}</span>
            <div>
              <strong>${path.name}</strong>
              <small>${path.description}</small>
            </div>
          </div>

          <div class="fq-node-row">
            ${path.nodes.map(node => {
              const unlocked = node.unlocked(ctx);
              return `
                <div class="fq-node ${unlocked ? 'unlocked' : ''}">
                  <span>${unlocked ? '✓' : '🔒'} ${node.name}</span>
                  <span>${node.requirement}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="fq-section-label">BOSS REWARDS & RELICS</div>

    <div class="fq-vault-grid">
      ${inventory.length
        ? [...inventory].reverse().map(item => `
          <div class="fq-vault-item">
            <span>${item.icon || '🎁'}</span>
            <strong>${item.name || 'Unknown Relic'}</strong>
            <small>${item.rarity || item.source || 'Campaign Relic'}</small>
          </div>
        `).join('')
        : `<div class="fq-empty">The vault is empty. Bosses and special campaign moments can change that.</div>`
      }
    </div>

    <div class="fq-section-label">RECENT MEDALS</div>

    <div class="fq-medal-strip">
      ${medals.length
        ? medals.map(item => `
          <div class="fq-medal">
            <span>${item.icon || '🏆'}</span>
            <strong>${item.name}</strong>
          </div>
        `).join('')
        : `<div class="fq-empty">Your first medals are waiting for you.</div>`
      }
    </div>
  `;

  card.querySelectorAll('[data-class]').forEach(button => {
    button.addEventListener('click', () => {
      void saveCharacterSetting('classId', button.dataset.class);
    });
  });

  card.querySelectorAll('[data-title]').forEach(button => {
    button.addEventListener('click', () => {
      void saveCharacterSetting('titleId', button.dataset.title);
    });
  });

  $('#fqCycleTitle')?.addEventListener('click', () => {
    if (!titles.length) return;

    const currentIndex = Math.max(
      0,
      titles.findIndex(item => item.id === title?.id)
    );

    const next = titles[(currentIndex + 1) % titles.length];
    void saveCharacterSetting('titleId', next.id);
  });

  // Mirror equipped progression into the original dossier without replacing it.
  const rank = $('#rankTitle');
  if (rank) rank.textContent = `${cls.icon} ${cls.name}`;

  const goal = $('#characterGoal');
  if (goal && title) {
    goal.textContent = `${title.icon} ${title.name} · ${cls.affinity}`;
  }
}

async function renderFromCloud() {
  try {
    const cloud = await readCloudSave();
    if (cloud?.save) render(cloud.save);
  } catch (error) {
    console.warn('Character progression refresh failed:', error);
  }
}

function boot() {
  styles();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;

    if ($('#fitquestScreenGrid-character')) {
      clearInterval(timer);
      void renderFromCloud();
    } else if (attempts > 140) {
      clearInterval(timer);
    }
  }, 120);

  window.addEventListener('fitquest:navigation', event => {
    if (event.detail?.screen === 'character') {
      void renderFromCloud();
    }
  });

  window.addEventListener('fitquest:remote-update', () => {
    void renderFromCloud();
  });

  window.addEventListener('fitquest:boss-hit', () => {
    void renderFromCloud();
  });

  window.addEventListener('fitquest:character-updated', () => {
    void renderFromCloud();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once:true });
} else {
  boot();
}
