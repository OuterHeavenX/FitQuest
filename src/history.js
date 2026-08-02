import './history.css';

const SAVE_KEY = 'fitquest-save-v1';

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[c]));

const localDateISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function dayName(date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' })
    .format(new Date(`${date}T12:00:00`));
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function save(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function toast(message) {
  const existing = document.getElementById('toast');
  if (existing) {
    existing.textContent = message;
    existing.classList.add('show');
    clearTimeout(window.__fitquestHistoryToast);
    window.__fitquestHistoryToast = setTimeout(() => existing.classList.remove('show'), 2600);
    return;
  }
  alert(message);
}

function exerciseSummary(e) {
  if (e.type === 'cardio') {
    const distance = Number(e.distance)
      ? ` · ${Number(e.distance).toFixed(Number(e.distance) % 1 ? 2 : 0)} ${e.distanceUnit || 'mi'}`
      : '';
    return `${Number(e.duration) || 0} min${distance}`;
  }
  const weight = e.weight ? ` · ${esc(e.weight)}` : '';
  return `${Number(e.sets) || 0} × ${Number(e.reps) || 0}${weight}`;
}

function workoutTotals(workout) {
  const exercises = workout.exercises || [];
  const strengthSets = exercises
    .filter(e => e.type === 'strength')
    .reduce((sum, e) => sum + (Number(e.sets) || 0), 0);
  const cardio = exercises
    .filter(e => e.type === 'cardio')
    .reduce((sum, e) => sum + (Number(e.duration) || 0), 0);
  const xp = exercises.reduce((sum, e) => sum + (Number(e.xp) || 0), 0);
  return { strengthSets, cardio, xp };
}

function ensureTargetWorkout(data, date) {
  let workout = (data.workouts || []).find(w => w.date === date);
  if (workout) return workout;

  const number = (data.workouts || []).length + 1;
  workout = {
    id: `${date}-history-${Date.now()}`,
    date,
    day: dayName(date),
    title: `Day ${number}: Recovered Adventure`,
    startTime: '',
    startTimeExact: null,
    note: 'Created from Workout History.',
    exercises: []
  };
  data.workouts ||= [];
  data.workouts.push(workout);
  return workout;
}

function sortWorkouts(data) {
  data.workouts = [...(data.workouts || [])].sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || ''))
  );
}

function installUI() {
  if (document.getElementById('workoutHistorySection')) return;

  const chronicle = document.querySelector('.chronicle');
  if (!chronicle) return;

  const section = document.createElement('section');
  section.id = 'workoutHistorySection';
  section.className = 'card history-panel';
  section.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">CAMPAIGN ARCHIVE · EDITABLE INTEL</p>
        <h3>Workout History</h3>
      </div>
      <div class="history-head-actions">
        <button class="ghost mini" id="historyBackupBtn" type="button">⬇ Backup</button>
        <span class="pill" id="historyCount">0 days</span>
      </div>
    </div>
    <p class="muted history-help">
      Inspect past adventures, change an entire workout date, or move one exercise to another day.
      Date changes update the Adventure Map after reload.
    </p>
    <div id="historyList" class="history-list"></div>
  `;
  chronicle.parentNode.insertBefore(section, chronicle);

  const dialog = document.createElement('dialog');
  dialog.id = 'moveExerciseDialog';
  dialog.innerHTML = `
    <form id="moveExerciseForm">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">FIELD TRANSFER</p>
          <h3>Move Exercise</h3>
        </div>
        <button type="button" class="icon-btn" id="moveExerciseClose" aria-label="Close">×</button>
      </div>
      <p class="muted" id="moveExerciseLabel"></p>
      <input type="hidden" id="moveSourceWorkoutId">
      <input type="hidden" id="moveExerciseIndex">
      <label>Move to date
        <input id="moveExerciseDate" type="date" required>
      </label>
      <button class="primary" type="submit">Transfer Exercise</button>
      <p class="dialog-tip">If that date has no adventure yet, FitQuest creates one automatically.</p>
    </form>
  `;
  document.body.appendChild(dialog);

  document.getElementById('moveExerciseClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', ev => {
    if (ev.target === dialog) dialog.close();
  });
  document.getElementById('moveExerciseForm').addEventListener('submit', moveExercise);
  document.getElementById('historyBackupBtn').addEventListener('click', exportBackup);

  renderHistory();
}

function renderHistory() {
  const data = load();
  const list = document.getElementById('historyList');
  if (!data || !list) return;

  const workouts = [...(data.workouts || [])].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
  );

  document.getElementById('historyCount').textContent =
    `${workouts.filter(w => (w.exercises || []).length).length} active day${workouts.filter(w => (w.exercises || []).length).length === 1 ? '' : 's'}`;

  if (!workouts.length) {
    list.innerHTML = `<div class="empty-state">No adventures recorded yet.</div>`;
    return;
  }

  list.innerHTML = workouts.map(workout => {
    const exercises = workout.exercises || [];
    const totals = workoutTotals(workout);
    const empty = exercises.length === 0;

    return `
      <article class="history-day ${empty ? 'history-empty' : ''}" data-history-id="${esc(workout.id)}">
        <div class="history-day-head">
          <div>
            <span class="history-date">${esc(workout.date || 'Unknown date')} · ${esc(workout.day || dayName(workout.date))}</span>
            <strong>${esc(workout.title || 'Untitled Adventure')}</strong>
            <small>
              ${exercises.length} move${exercises.length === 1 ? '' : 's'}
              · ${totals.strengthSets} sets
              · ${totals.cardio} cardio min
              · ${totals.xp} XP
            </small>
          </div>
          <span class="history-status">${empty ? 'EMPTY RECORD' : '✓ LOGGED'}</span>
        </div>

        <div class="history-date-editor">
          <label>Workout date
            <input type="date" value="${esc(workout.date || '')}" data-workout-date="${esc(workout.id)}">
          </label>
          <button type="button" class="ghost mini" data-change-workout-date="${esc(workout.id)}">Move Whole Day</button>
          ${empty ? `<button type="button" class="ghost mini danger-ghost" data-delete-empty="${esc(workout.id)}">Remove Empty</button>` : ''}
        </div>

        <div class="history-exercises">
          ${exercises.length ? exercises.map((e, index) => `
            <div class="history-exercise">
              <span class="history-exercise-icon">${esc(e.icon || (e.type === 'cardio' ? '🏃' : '⚔️'))}</span>
              <div>
                <strong>${esc(e.name || 'Exercise')}</strong>
                <small>${exerciseSummary(e)} · +${Number(e.xp) || 0} XP</small>
              </div>
              <button
                type="button"
                class="history-move-btn"
                data-move-exercise
                data-workout-id="${esc(workout.id)}"
                data-exercise-index="${index}"
              >↪ Move</button>
            </div>
          `).join('') : `<div class="history-no-exercises">No exercises attached to this day.</div>`}
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-change-workout-date]').forEach(btn => {
    btn.addEventListener('click', () => changeWorkoutDate(btn.dataset.changeWorkoutDate));
  });

  document.querySelectorAll('[data-move-exercise]').forEach(btn => {
    btn.addEventListener('click', () =>
      openMoveExercise(btn.dataset.workoutId, Number(btn.dataset.exerciseIndex))
    );
  });

  document.querySelectorAll('[data-delete-empty]').forEach(btn => {
    btn.addEventListener('click', () => deleteEmptyWorkout(btn.dataset.deleteEmpty));
  });
}

function changeWorkoutDate(workoutId) {
  const data = load();
  const source = (data?.workouts || []).find(w => w.id === workoutId);
  const input = document.querySelector(`[data-workout-date="${CSS.escape(workoutId)}"]`);
  const targetDate = input?.value;

  if (!source || !targetDate || targetDate === source.date) {
    toast('📅 Choose a different date first.');
    return;
  }

  const existing = (data.workouts || []).find(w => w.date === targetDate && w.id !== workoutId);

  if (existing) {
    existing.exercises ||= [];
    existing.exercises.push(...(source.exercises || []));
    existing.note = existing.note || source.note;
    data.workouts = data.workouts.filter(w => w.id !== workoutId);
    toast(`🗂️ Adventure merged into ${targetDate}.`);
  } else {
    source.date = targetDate;
    source.day = dayName(targetDate);
    toast(`📅 Adventure moved to ${targetDate}.`);
  }

  sortWorkouts(data);
  save(data);
  setTimeout(() => location.reload(), 350);
}

function openMoveExercise(workoutId, exerciseIndex) {
  const data = load();
  const workout = (data?.workouts || []).find(w => w.id === workoutId);
  const exercise = workout?.exercises?.[exerciseIndex];
  if (!workout || !exercise) return;

  document.getElementById('moveSourceWorkoutId').value = workoutId;
  document.getElementById('moveExerciseIndex').value = String(exerciseIndex);
  document.getElementById('moveExerciseDate').value = workout.date || localDateISO();
  document.getElementById('moveExerciseLabel').textContent =
    `${exercise.name} · currently ${workout.date}`;
  document.getElementById('moveExerciseDialog').showModal();
}

function moveExercise(ev) {
  ev.preventDefault();

  const data = load();
  const workoutId = document.getElementById('moveSourceWorkoutId').value;
  const exerciseIndex = Number(document.getElementById('moveExerciseIndex').value);
  const targetDate = document.getElementById('moveExerciseDate').value;

  const source = (data?.workouts || []).find(w => w.id === workoutId);
  if (!source || !targetDate || !source.exercises?.[exerciseIndex]) return;

  if (targetDate === source.date) {
    toast('📅 That exercise is already on that date.');
    return;
  }

  const [exercise] = source.exercises.splice(exerciseIndex, 1);
  const target = ensureTargetWorkout(data, targetDate);
  target.exercises ||= [];
  target.exercises.push({
    ...exercise,
    movedFromDate: source.date,
    movedAt: new Date().toISOString()
  });

  sortWorkouts(data);
  save(data);
  document.getElementById('moveExerciseDialog').close();
  toast(`↪ ${exercise.name} moved to ${targetDate}.`);
  setTimeout(() => location.reload(), 350);
}

function deleteEmptyWorkout(workoutId) {
  const data = load();
  const workout = (data?.workouts || []).find(w => w.id === workoutId);
  if (!workout || (workout.exercises || []).length) return;

  data.workouts = data.workouts.filter(w => w.id !== workoutId);
  save(data);
  toast('🧹 Empty adventure record removed.');
  setTimeout(() => location.reload(), 350);
}

function exportBackup() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    toast('No FitQuest save found to back up.');
    return;
  }

  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitquest-backup-${localDateISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('⬇ FitQuest save backup exported.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installUI, { once: true });
} else {
  installUI();
}