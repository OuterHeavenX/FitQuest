import { seedData } from './data/defaultData.js';
import { loadSave, writeSave } from './lib/storage.js';
import { calculateStats } from './lib/progression.js';

const $ = selector => document.querySelector(selector);
const localDateISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

let busy = false;

function styles() {
  if ($('#fitquestCompletionStyles')) return;
  const style = document.createElement('style');
  style.id = 'fitquestCompletionStyles';
  style.textContent = `
    .fitquest-adventure-actions{display:flex;gap:9px;align-items:stretch}
    .finish-adventure-btn,.end-adventure-btn{
      min-height:42px;border-radius:13px;padding:0 16px;font:inherit;font-weight:900;cursor:pointer
    }
    .finish-adventure-btn{
      border:1px solid rgba(109,232,177,.28);
      background:linear-gradient(135deg,rgba(73,202,159,.17),rgba(93,119,255,.17));
      color:#b9ffe2
    }
    .end-adventure-btn{
      border:1px solid rgba(172,112,255,.25);
      background:rgba(145,89,255,.08);color:#d9c6ff
    }
    .finish-adventure-btn:disabled,.end-adventure-btn:disabled{opacity:.55;cursor:default}
    .fitquest-strike-note{margin-top:14px;padding:12px 14px;border-radius:14px;
      border:1px solid rgba(105,232,177,.20);background:rgba(105,232,177,.07);
      color:#9eeec9;font-size:13px;line-height:1.45}
    @media(max-width:700px){.fitquest-adventure-actions{flex:1;min-width:0}
      .finish-adventure-btn,.end-adventure-btn{padding:0 11px;font-size:12px}}
  `;
  document.head.appendChild(style);
}

function currentWorkout(data) {
  return (data.workouts || []).find(w => w.date === localDateISO()) || null;
}

function exerciseCount(workout) {
  return Array.isArray(workout?.exercises) ? workout.exercises.length : 0;
}

function submittedCount(workout) {
  return Math.max(0, Number(workout?.bossSubmittedExerciseCount) || 0);
}

function pendingCount(workout) {
  return Math.max(0, exerciseCount(workout) - submittedCount(workout));
}

function getWorkoutBonus(workout) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const sets = exercises.filter(e => e.type === 'strength')
    .reduce((n,e) => n + (Number(e.sets)||0), 0);
  const cardio = exercises.filter(e => e.type === 'cardio')
    .reduce((n,e) => n + (Number(e.duration)||0), 0);
  return Math.max(50, Math.min(150, Math.round(
    35 + exercises.length * 8 + sets * 2 + Math.floor(cardio/5) * 3
  )));
}

function buttons() {
  return {
    strike: $('#finishAdventureBtn'),
    end: $('#endAdventureBtn')
  };
}

function setState(workout) {
  const { strike, end } = buttons();
  if (!strike || !end) return;

  const total = exerciseCount(workout);
  const pending = pendingCount(workout);

  if (workout?.completed) {
    strike.disabled = true;
    end.disabled = true;
    strike.textContent = '✓ Adventure Ended';
    end.textContent = `+${Number(workout.completionXp)||0} XP`;
    return;
  }

  strike.disabled = pending <= 0;
  strike.textContent = pending > 0
    ? `⚔️ Submit Strike · ${pending} new ${pending === 1 ? 'move' : 'moves'}`
    : total > 0 ? '⚔️ All Moves Submitted' : '⚔️ Log a Move First';

  end.disabled = total <= 0;
  end.textContent = total > 0
    ? `🏁 End Adventure · +${getWorkoutBonus(workout)} XP`
    : '🏁 End Adventure';
}

function note(workout) {
  $('#fitquestCompletionNote')?.remove();
  const list = $('#workoutList');
  if (!list || !workout) return;

  const el = document.createElement('div');
  el.id = 'fitquestCompletionNote';
  el.className = 'fitquest-strike-note';

  if (workout.completed) {
    const time = workout.completedAt
      ? new Date(workout.completedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})
      : '';
    el.textContent = `✓ Adventure ended${time ? ` at ${time}` : ''} · +${Number(workout.completionXp)||0} completion XP`;
  } else {
    const pending = pendingCount(workout);
    el.textContent = pending > 0
      ? `⚔️ ${pending} new ${pending === 1 ? 'move is' : 'moves are'} ready to strike the boss.`
      : exerciseCount(workout) > 0
        ? '✓ Every logged move has been submitted to the boss. Keep training to build another strike.'
        : 'Log exercises throughout the day. Submit them to the boss whenever you want.';
  }
  list.insertAdjacentElement('afterend', el);
}

async function submitStrike() {
  if (busy) return;
  busy = true;
  const { strike } = buttons();
  try {
    if (strike) { strike.disabled = true; strike.textContent = 'Charging Strike…'; }
    await new Promise(r => setTimeout(r, 650));
    const data = await loadSave(seedData);
    const workout = currentWorkout(data);
    const pending = pendingCount(workout);
    if (!workout || pending <= 0) throw new Error('No new exercises are waiting to be submitted.');

    workout.bossStrikeRequestedCount = exerciseCount(workout);
    workout.bossStrikeRequestedAt = new Date().toISOString();

    const ok = await writeSave(data);
    if (!ok) throw new Error('FitQuest could not save this strike.');

    window.dispatchEvent(new CustomEvent('fitquest:boss-strike-requested'));
    await new Promise(r => setTimeout(r, 450));
    await sync();
  } catch (e) {
    window.alert(e?.message || 'Unable to submit strike.');
  } finally {
    busy = false;
    void sync();
  }
}

async function endAdventure() {
  if (busy) return;
  busy = true;
  const { end } = buttons();
  try {
    if (end) { end.disabled = true; end.textContent = 'Ending Adventure…'; }
    await new Promise(r => setTimeout(r, 650));
    const data = await loadSave(seedData);
    const workout = currentWorkout(data);
    if (!workout || exerciseCount(workout) === 0) throw new Error('Log at least one exercise first.');
    if (workout.completed) return;

    // Any unsubmitted moves are automatically queued for one final boss strike.
    if (pendingCount(workout) > 0) {
      workout.bossStrikeRequestedCount = exerciseCount(workout);
      workout.bossStrikeRequestedAt = new Date().toISOString();
    }

    const oldStats = calculateStats(data);
    workout.completed = true;
    workout.completedAt = new Date().toISOString();
    workout.completionXp = getWorkoutBonus(workout);
    workout.completionSummary = `${exerciseCount(workout)} moves completed · +${workout.completionXp} completion XP`;

    const ok = await writeSave(data);
    if (!ok) throw new Error('FitQuest could not end this Adventure.');

    const newStats = calculateStats(data);
    window.dispatchEvent(new CustomEvent('fitquest:boss-strike-requested'));
    window.dispatchEvent(new CustomEvent('fitquest:adventure-ended', {
      detail: { oldLevel: oldStats.level, newLevel: newStats.level }
    }));

    await sync();
  } catch (e) {
    window.alert(e?.message || 'Unable to end Adventure.');
  } finally {
    busy = false;
    void sync();
  }
}

function inject() {
  if ($('#finishAdventureBtn') && $('#endAdventureBtn')) return true;
  const add = $('#addExerciseBtn');
  if (!add) return false;

  $('#finishAdventureBtn')?.remove();

  const wrap = document.createElement('div');
  wrap.className = 'fitquest-adventure-actions';

  const strike = document.createElement('button');
  strike.id = 'finishAdventureBtn';
  strike.type = 'button';
  strike.className = 'finish-adventure-btn';
  strike.textContent = '⚔️ Submit Strike';

  const end = document.createElement('button');
  end.id = 'endAdventureBtn';
  end.type = 'button';
  end.className = 'end-adventure-btn';
  end.textContent = '🏁 End Adventure';

  wrap.append(strike, end);
  add.insertAdjacentElement('beforebegin', wrap);
  strike.addEventListener('click', submitStrike);
  end.addEventListener('click', endAdventure);
  return true;
}

async function sync() {
  try {
    const data = await loadSave(seedData);
    const workout = currentWorkout(data);
    setState(workout);
    note(workout);
  } catch (e) {
    console.warn('Adventure strike UI sync failed:', e);
  }
}

function boot() {
  styles();
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if ($('#appRoot') && !$('#appRoot').hidden && inject()) {
      clearInterval(timer);
      void sync();
    } else if (tries > 120) clearInterval(timer);
  }, 120);

  window.addEventListener('fitquest:remote-update', () => void sync());
  window.addEventListener('fitquest:navigation', e => {
    if (e.detail?.screen === 'training' || e.detail?.screen === 'home') void sync();
  });
  // Exercise logging changes the workout without reloading.
  setInterval(() => { if ($('#finishAdventureBtn')) void sync(); }, 2500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once:true });
} else boot();
