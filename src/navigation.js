const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const SCREENS = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'training', label: 'Training', icon: '⚔️' },
  { id: 'nutrition', label: 'Nutrition', icon: '🍎' },
  { id: 'activity', label: 'Activity', icon: '⌚' },
  { id: 'progress', label: 'Progress', icon: '🏆' },
  { id: 'character', label: 'Character', icon: '🧙' }
];

let currentScreen = 'home';
let observer = null;
let arrangeTimer = null;

function styles() {
  if ($('#fitquestNavigationStyles')) return;

  const style = document.createElement('style');
  style.id = 'fitquestNavigationStyles';
  style.textContent = `
    :root {
      --fq-nav-height: 74px;
    }

    #fitquestAppNav {
      position: sticky;
      top: 10px;
      z-index: 900;
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 7px;
      margin: 14px 0 22px;
      padding: 7px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.09);
      background: rgba(9, 15, 31, .88);
      box-shadow: 0 16px 44px rgba(0,0,0,.24);
      backdrop-filter: blur(18px);
    }

    .fitquest-nav-btn {
      min-width: 0;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 10px;
      border: 0;
      border-radius: 13px;
      background: transparent;
      color: #8f9bb5;
      font: inherit;
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
      transition: .18s ease;
    }

    .fitquest-nav-btn:hover {
      background: rgba(255,255,255,.045);
      color: #e9edff;
    }

    .fitquest-nav-btn.active {
      color: #fff;
      background:
        linear-gradient(
          135deg,
          rgba(102, 111, 255, .30),
          rgba(165, 83, 244, .24)
        );
      box-shadow:
        inset 0 0 0 1px rgba(149, 124, 255, .22),
        0 8px 24px rgba(80, 60, 180, .16);
    }

    .fitquest-nav-icon {
      font-size: 16px;
      line-height: 1;
    }

    #fitquestScreenHost {
      min-height: 58vh;
    }

    .fitquest-screen {
      display: none;
      animation: fqScreenIn .18s ease;
    }

    .fitquest-screen.active {
      display: grid;
      gap: 22px;
    }

    .fitquest-screen-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 22px;
    }

    .fitquest-screen > .card,
    .fitquest-screen > article,
    .fitquest-screen > section,
    .fitquest-screen-grid > .card,
    .fitquest-screen-grid > article,
    .fitquest-screen-grid > section {
      margin-top: 0 !important;
      margin-bottom: 0 !important;
    }

    .fitquest-screen .fitquest-boss-card {
      margin: 0 !important;
    }

    .fitquest-screen-title {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      margin: 4px 2px -4px;
    }

    .fitquest-screen-title p {
      margin: 0 0 4px;
      color: #7f8ba5;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    .fitquest-screen-title h2 {
      margin: 0;
      font-size: clamp(22px, 3vw, 30px);
    }

    .fitquest-screen-title small {
      max-width: 420px;
      color: #8793ac;
      line-height: 1.45;
      text-align: right;
    }

    .fitquest-screen-empty {
      padding: 34px 22px;
      border-radius: 20px;
      border: 1px dashed rgba(255,255,255,.12);
      color: #7f8ba5;
      text-align: center;
    }

    @keyframes fqScreenIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 900px) {
      .fitquest-screen-grid {
        grid-template-columns: 1fr;
      }

      .fitquest-screen-title {
        align-items: flex-start;
        flex-direction: column;
        gap: 6px;
      }

      .fitquest-screen-title small {
        text-align: left;
      }
    }

    @media (max-width: 720px) {
      body {
        padding-bottom: calc(var(--fq-nav-height) + env(safe-area-inset-bottom, 0px));
      }

      #fitquestAppNav {
        position: fixed;
        left: 10px;
        right: 10px;
        bottom: calc(8px + env(safe-area-inset-bottom, 0px));
        top: auto;
        z-index: 9990;
        margin: 0;
        grid-template-columns: repeat(6, 1fr);
        gap: 3px;
        padding: 6px;
        border-radius: 19px;
        background: rgba(7, 12, 25, .94);
      }

      .fitquest-nav-btn {
        min-height: 56px;
        padding: 6px 2px;
        gap: 3px;
        flex-direction: column;
        font-size: 9px;
      }

      .fitquest-nav-icon {
        font-size: 18px;
      }

      .topbar {
        margin-bottom: 12px;
      }

      #fitquestScreenHost {
        min-height: 72vh;
      }
    }

    @media (max-width: 420px) {
      #fitquestAppNav {
        left: 6px;
        right: 6px;
      }

      .fitquest-nav-btn {
        font-size: 8px;
      }
    }
  `;

  document.head.appendChild(style);
}

function titleFor(id) {
  const map = {
    home: [
      'COMMAND CENTER',
      'Today',
      'Your current quest, boss battle, recovery intel, and daily objectives.'
    ],
    training: [
      'TRAINING HALL',
      'Training',
      'Log moves, use your Exercise Codex, and review your cloud workout history.'
    ],
    nutrition: [
      'PROVISIONS',
      'Nutrition',
      'Meals, macros, hydration, and food intelligence live here.'
    ],
    activity: [
      'FIELD ACTIVITY',
      'Activity',
      'Enter Apple Watch totals and turn everyday movement into campaign progress.'
    ],
    progress: [
      'CAMPAIGN ARCHIVE',
      'Progress',
      'Weekly maps, achievements, distance milestones, and your Chronicle.'
    ],
    character: [
      'PLAYER DOSSIER',
      'Character',
      'Identity, permanent stats, and the future home of classes, loot, and skill trees.'
    ]
  };

  return map[id];
}

function screenTemplate(id) {
  const [eyebrow, title, help] = titleFor(id);

  const section = document.createElement('section');
  section.id = `fitquestScreen-${id}`;
  section.className = 'fitquest-screen';
  section.dataset.fitquestScreen = id;

  section.innerHTML = `
    <div class="fitquest-screen-title">
      <div>
        <p>${eyebrow}</p>
        <h2>${title}</h2>
      </div>
      <small>${help}</small>
    </div>
    <div
      class="fitquest-screen-grid"
      id="fitquestScreenGrid-${id}"
    ></div>
  `;

  return section;
}

function makeShell() {
  const main = $('#appRoot main');
  if (!main || $('#fitquestAppNav')) return false;

  const nav = document.createElement('nav');
  nav.id = 'fitquestAppNav';
  nav.setAttribute('aria-label', 'FitQuest sections');

  nav.innerHTML = SCREENS.map(screen => `
    <button
      class="fitquest-nav-btn"
      type="button"
      data-fitquest-nav="${screen.id}"
      aria-controls="fitquestScreen-${screen.id}"
    >
      <span class="fitquest-nav-icon">${screen.icon}</span>
      <span>${screen.label}</span>
    </button>
  `).join('');

  const host = document.createElement('div');
  host.id = 'fitquestScreenHost';

  SCREENS.forEach(screen => {
    host.appendChild(screenTemplate(screen.id));
  });

  main.insertBefore(nav, main.firstChild);
  nav.insertAdjacentElement('afterend', host);

  $$('[data-fitquest-nav]').forEach(button => {
    button.addEventListener('click', () => {
      showScreen(button.dataset.fitquestNav);
    });
  });

  return true;
}

function grid(id) {
  return $(`#fitquestScreenGrid-${id}`);
}

function moveIfPresent(node, destination) {
  if (!node || !destination) return;
  if (node.closest('.fitquest-screen') === destination.closest('.fitquest-screen')) return;
  destination.appendChild(node);
}

function findOriginalTwoCols() {
  return [...document.querySelectorAll('#appRoot main > .two-col, #fitquestScreenHost .two-col')];
}

function arrange() {
  if (!$('#fitquestScreenHost')) return;

  const home = grid('home');
  const training = grid('training');
  const nutrition = grid('nutrition');
  const activity = grid('activity');
  const progress = grid('progress');
  const character = grid('character');

  // Home
  moveIfPresent($('.hero.card'), home);
  moveIfPresent($('#verificationBanner'), home);
  moveIfPresent($('.stats-grid'), home);
  moveIfPresent($('#fitquestBossBattle'), home);
  moveIfPresent($('.quest-card'), home);
  moveIfPresent($('.daily-checkin'), home);
  moveIfPresent($('.quest-board'), home);

  // Training
  moveIfPresent($('#exerciseCodexSection'), training);
  moveIfPresent($('#workoutHistorySection'), training);

  // Nutrition
  moveIfPresent($('.nutrition-card'), nutrition);

  // Activity
  moveIfPresent($('#fitquestDailyActivity'), activity);

  // Character
  moveIfPresent($('.character-card'), character);

  // Progress
  const weekGrid = $('#weekGrid');
  moveIfPresent(weekGrid?.closest('.card'), progress);
  moveIfPresent($('.achievement-panel'), progress);
  moveIfPresent($('.atlas-card'), progress);
  moveIfPresent($('.mission-dossier'), progress);
  moveIfPresent($('.chronicle'), progress);

  // Clean up empty structural wrappers left behind.
  findOriginalTwoCols().forEach(wrapper => {
    if (!wrapper.children.length) wrapper.remove();
  });

  // Keep the boss immediately after the stat cards when it appears later.
  if ($('#fitquestBossBattle') && $('#fitquestBossBattle').parentElement !== home) {
    home.appendChild($('#fitquestBossBattle'));
  }

  // Make Nutrition/Activity feel intentional even before data exists.
  if (activity && !activity.querySelector('#fitquestDailyActivity')) {
    if (!activity.querySelector('.fitquest-screen-empty')) {
      const empty = document.createElement('div');
      empty.className = 'fitquest-screen-empty';
      empty.textContent = 'Loading Daily Activity…';
      activity.appendChild(empty);
    }
  } else {
    activity?.querySelector('.fitquest-screen-empty')?.remove();
  }
}

function showScreen(id, options = {}) {
  if (!SCREENS.some(screen => screen.id === id)) id = 'home';
  currentScreen = id;

  $$('.fitquest-screen').forEach(screen => {
    const active = screen.dataset.fitquestScreen === id;
    screen.classList.toggle('active', active);
    screen.hidden = !active;
  });

  $$('[data-fitquest-nav]').forEach(button => {
    const active = button.dataset.fitquestNav === id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });

  try {
    sessionStorage.setItem('fitquest-active-screen', id);
  } catch {}

  if (!options.noScroll) {
    const top = $('#fitquestAppNav');
    if (top && window.innerWidth > 720) {
      top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  window.dispatchEvent(new CustomEvent('fitquest:navigation', {
    detail: { screen: id }
  }));
}

function scheduleArrange() {
  clearTimeout(arrangeTimer);
  arrangeTimer = setTimeout(arrange, 80);
}

function boot() {
  styles();

  let attempts = 0;

  const timer = setInterval(() => {
    attempts++;

    if ($('#appRoot') && !$('#appRoot').hidden && $('#appRoot main')) {
      clearInterval(timer);

      makeShell();
      arrange();

      let saved = 'home';
      try {
        saved = sessionStorage.getItem('fitquest-active-screen') || 'home';
      } catch {}

      showScreen(saved, { noScroll: true });

      observer = new MutationObserver(scheduleArrange);
      observer.observe($('#appRoot main'), {
        childList: true,
        subtree: true
      });

      window.addEventListener('fitquest:activity-ready', scheduleArrange);
      window.addEventListener('fitquest:boss-ready', scheduleArrange);
      window.addEventListener('fitquest:history-ready', scheduleArrange);
    } else if (attempts > 120) {
      clearInterval(timer);
    }
  }, 120);
}

export function navigateFitQuest(screen) {
  showScreen(screen);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
