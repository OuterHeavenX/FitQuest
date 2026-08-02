import { seedData } from './data/defaultData.js';
import { loadSave, writeSave } from './lib/storage.js';
import { calculateStats } from './lib/progression.js';

const $ = selector => document.querySelector(selector);

const localDateISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

let completionState = null;
let completionBusy = false;

function addStyles() {
  if (document.getElementById('fitquestCompletionStyles')) return;

  const style = document.createElement('style');
  style.id = 'fitquestCompletionStyles';
  style.textContent = `
    .finish-adventure-btn {
      min-height: 42px;
      border: 1px solid rgba(109, 232, 177, .28);
      border-radius: 13px;
      padding: 0 16px;
      background:
        linear-gradient(135deg, rgba(73, 202, 159, .17), rgba(93, 119, 255, .17));
      color: #b9ffe2;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 10px 28px rgba(0,0,0,.18);
    }

    .finish-adventure-btn:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .finish-adventure-btn:disabled {
      opacity: .72;
      cursor: default;
    }

    .finish-adventure-btn.completed {
      border-color: rgba(105, 232, 177, .38);
      background: rgba(105, 232, 177, .11);
      color: #69e8b1;
    }

    .fitquest-completion-note {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(105, 232, 177, .20);
      background: rgba(105, 232, 177, .07);
      color: #9eeec9;
      font-size: 13px;
      line-height: 1.45;
    }

    .fitquest-level-overlay {
      position: fixed;
      inset: 0;
      z-index: 120000;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(3, 7, 18, .78);
      backdrop-filter: blur(16px);
    }

    .fitquest-level-card {
      width: min(100%, 520px);
      padding: 32px;
      border-radius: 28px;
      border: 1px solid rgba(255,255,255,.14);
      background:
        radial-gradient(circle at 50% 0%, rgba(162, 83, 244, .25), transparent 48%),
        #10182d;
      color: #f7f8ff;
      text-align: center;
      box-shadow: 0 35px 100px rgba(0,0,0,.55);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .fitquest-level-icon {
      width: 82px;
      height: 82px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      border-radius: 24px;
      font-size: 40px;
      background: linear-gradient(135deg, rgba(102, 218, 255, .22), rgba(174, 83, 244, .30));
      border: 1px solid rgba(255,255,255,.14);
    }

    .fitquest-level-eyebrow {
      margin: 0 0 8px;
      color: #9faad0;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .18em;
    }

    .fitquest-level-card h2 {
      margin: 0;
      font-size: clamp(30px, 7vw, 46px);
    }

    .fitquest-level-card p {
      color: #b2bdd4;
      line-height: 1.55;
    }

    .fitquest-reward-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 22px 0;
    }

    .fitquest-reward-grid div {
      padding: 14px 8px;
      border-radius: 15px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.08);
    }

    .fitquest-reward-grid small,
    .fitquest-reward-grid strong {
      display: block;
    }

    .fitquest-reward-grid small {
      margin-bottom: 4px;
      color: #8e9ab5;
      font-size: 11px;
    }

    .fitquest-level-close {
      width: 100%;
      min-height: 50px;
      border: 0;
      border-radius: 14px;
      background: linear-gradient(135deg, #716cff, #b053ed);
      color: white;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
    }

    @media (max-width: 700px) {
      .fitquest-reward-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function getWorkoutBonus(workout) {
  const exercises = Array.isArray(workout?.exercises)
    ? workout.exercises
    : [];

  const moveBonus = exercises.length * 8;

  const strengthSets = exercises
    .filter(exercise => exercise.type === 'strength')
    .reduce(
      (total, exercise) =>
        total + (Number(exercise.sets) || 0),
      0
    );

  const cardioMinutes = exercises
    .filter(exercise => exercise.type === 'cardio')
    .reduce(
      (total, exercise) =>
        total + (Number(exercise.duration) || 0),
      0
    );

  const strengthBonus = strengthSets * 2;
  const cardioBonus = Math.floor(cardioMinutes / 5) * 3;

  return Math.max(
    50,
    Math.min(
      150,
      Math.round(
        35 +
        moveBonus +
        strengthBonus +
        cardioBonus
      )
    )
  );
}

function currentWorkout(data) {
  const today = localDateISO();

  return (data.workouts || []).find(
    workout => workout.date === today
  ) || null;
}

function completionButton() {
  return document.getElementById('finishAdventureBtn');
}

function setButtonState(workout) {
  const button = completionButton();
  if (!button) return;

  const exerciseCount =
    Array.isArray(workout?.exercises)
      ? workout.exercises.length
      : 0;

  if (workout?.completed) {
    button.disabled = true;
    button.classList.add('completed');
    button.textContent = `✓ Adventure Complete · +${Number(workout.completionXp) || 0} XP`;
    return;
  }

  button.classList.remove('completed');
  button.disabled = exerciseCount === 0;

  button.textContent =
    exerciseCount === 0
      ? '🏁 Finish Adventure'
      : `🏁 Finish Adventure · Earn ${getWorkoutBonus(workout)} XP`;
}

function addCompletionNote(workout) {
  const list = $('#workoutList');
  if (!list) return;

  document.getElementById('fitquestCompletionNote')?.remove();

  if (!workout?.completed) return;

  const note = document.createElement('div');
  note.id = 'fitquestCompletionNote';
  note.className = 'fitquest-completion-note';

  const completedTime = workout.completedAt
    ? new Date(workout.completedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';

  note.textContent =
    `✓ Adventure completed${completedTime ? ` at ${completedTime}` : ''} · ` +
    `+${Number(workout.completionXp) || 0} completion XP`;

  list.insertAdjacentElement('afterend', note);
}

function patchChronicle(data) {
  const entries = [...document.querySelectorAll('.chronicle-entry')];
  if (!entries.length) return;

  const workouts = [...(data.workouts || [])]
    .filter(workout =>
      Array.isArray(workout.exercises) &&
      workout.exercises.length > 0
    )
    .sort(
      (a, b) =>
        String(b.date || '').localeCompare(
          String(a.date || '')
        )
    )
    .slice(0, entries.length);

  entries.forEach((entry, index) => {
    const workout = workouts[index];
    if (!workout?.completed) return;

    const small = entry.querySelector('small');
    if (!small) return;

    const exerciseXp = (workout.exercises || [])
      .reduce(
        (total, exercise) =>
          total + (Number(exercise.xp) || 0),
        0
      );

    const completionXp =
      Number(workout.completionXp) || 0;

    const totalXp =
      exerciseXp + completionXp;

    small.textContent =
      `${small.textContent.replace(/·\s*\d+\s*XP.*$/i, '').trim()} · ` +
      `${totalXp} XP · ✓ Complete`;
  });
}

function refreshVisibleStats(data) {
  const stats = calculateStats(data);

  const levelValue = $('#levelValue');
  const totalXp = $('#totalXpStat');
  const xpText = $('#xpText');
  const xpBar = $('#xpBar');

  if (levelValue) {
    levelValue.textContent = stats.level;
  }

  if (totalXp) {
    totalXp.textContent = stats.xp;
  }

  if (xpText) {
    xpText.textContent =
      `${stats.levelXp} / 500 XP`;
  }

  if (xpBar) {
    xpBar.style.width =
      `${(stats.levelXp / 500) * 100}%`;
  }
}

function showCompletionCelebration({
  workout,
  oldStats,
  newStats
}) {
  document.getElementById('fitquestLevelOverlay')?.remove();

  const levelUp =
    newStats.level > oldStats.level;

  const overlay = document.createElement('div');
  overlay.id = 'fitquestLevelOverlay';
  overlay.className = 'fitquest-level-overlay';

  const moves =
    Array.isArray(workout.exercises)
      ? workout.exercises.length
      : 0;

  overlay.innerHTML = `
    <div
      class="fitquest-level-card"
      role="dialog"
      aria-modal="true"
      aria-label="Adventure complete"
    >
      <div class="fitquest-level-icon">
        ${levelUp ? '👑' : '🏆'}
      </div>

      <p class="fitquest-level-eyebrow">
        ${levelUp ? 'LEVEL UP' : 'ADVENTURE COMPLETE'}
      </p>

      <h2>
        ${
          levelUp
            ? `Level ${newStats.level} Reached!`
            : 'Quest Cleared!'
        }
      </h2>

      <p>
        ${levelUp
          ? 'Your campaign just crossed another threshold.'
          : 'Your training has been written into the campaign chronicle.'}
      </p>

      <div class="fitquest-reward-grid">
        <div>
          <small>Moves Logged</small>
          <strong>${moves}</strong>
        </div>

        <div>
          <small>Completion XP</small>
          <strong>+${Number(workout.completionXp) || 0}</strong>
        </div>

        <div>
          <small>Total XP</small>
          <strong>${newStats.xp}</strong>
        </div>
      </div>

      <button
        class="fitquest-level-close"
        id="fitquestLevelClose"
        type="button"
      >
        Continue Campaign
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document
    .getElementById('fitquestLevelClose')
    ?.addEventListener(
      'click',
      () => {
        window.location.reload();
      }
    );
}

async function finishAdventure() {
  if (completionBusy) return;

  completionBusy = true;

  const button = completionButton();

  if (button) {
    button.disabled = true;
    button.textContent = 'Saving Adventure…';
  }

  try {
    // Let any normal FitQuest debounced cloud save finish first.
    await new Promise(resolve => setTimeout(resolve, 900));

    const latest = await loadSave(seedData);
    const workout = currentWorkout(latest);

    if (!workout) {
      throw new Error(
        'No adventure exists for today yet.'
      );
    }

    if (
      !Array.isArray(workout.exercises) ||
      workout.exercises.length === 0
    ) {
      throw new Error(
        'Log at least one exercise before finishing the adventure.'
      );
    }

    if (workout.completed) {
      completionState = latest;
      setButtonState(workout);
      addCompletionNote(workout);
      return;
    }

    const oldStats = calculateStats(latest);

    workout.completed = true;
    workout.completedAt = new Date().toISOString();
    workout.completionXp = getWorkoutBonus(workout);
    workout.completionSummary =
      `${workout.exercises.length} moves completed · ` +
      `+${workout.completionXp} completion XP`;

    const saved = await writeSave(latest);

    if (!saved) {
      throw new Error(
        'FitQuest could not save the completed adventure.'
      );
    }

    completionState = latest;

    const newStats = calculateStats(latest);

    setButtonState(workout);
    addCompletionNote(workout);
    refreshVisibleStats(latest);
    patchChronicle(latest);

    showCompletionCelebration({
      workout,
      oldStats,
      newStats
    });

  } catch (error) {
    console.error(
      'Finish adventure error:',
      error
    );

    if (button) {
      button.disabled = false;
      button.textContent = '🏁 Finish Adventure';
    }

    window.alert(
      error?.message ||
      'Unable to finish this adventure.'
    );

  } finally {
    completionBusy = false;
  }
}

function injectFinishButton() {
  if (completionButton()) return true;

  const addExerciseButton =
    $('#addExerciseBtn');

  if (!addExerciseButton) return false;

  const button =
    document.createElement('button');

  button.id = 'finishAdventureBtn';
  button.type = 'button';
  button.className =
    'finish-adventure-btn';

  button.textContent =
    '🏁 Finish Adventure';

  addExerciseButton.insertAdjacentElement(
    'beforebegin',
    button
  );

  button.addEventListener(
    'click',
    finishAdventure
  );

  return true;
}

async function syncCompletionUi() {
  try {
    completionState =
      await loadSave(seedData);

    const workout =
      currentWorkout(
        completionState
      );

    setButtonState(workout);
    addCompletionNote(workout);
    patchChronicle(completionState);

  } catch (error) {
    console.warn(
      'Completion UI sync failed:',
      error
    );
  }
}

async function boot() {
  addStyles();

  let attempts = 0;

  const timer =
    window.setInterval(
      async () => {
        attempts += 1;

        const appRoot =
          $('#appRoot');

        const ready =
          appRoot &&
          !appRoot.hidden &&
          injectFinishButton();

        if (ready) {
          window.clearInterval(timer);
          await syncCompletionUi();
        }

        if (attempts > 80) {
          window.clearInterval(timer);
        }
      },
      150
    );
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    boot,
    { once: true }
  );
} else {
  void boot();
}
