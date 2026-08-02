const KEY = 'fitquest-save-v1';
const clone = value => JSON.parse(JSON.stringify(value));

const DAY_1_DATE = '2026-07-31';
const DAY_2_DATE = '2026-08-01';
const DAY_1_EXERCISES = [
  'treadmill',
  'bicep curl',
  'shoulder press',
  'vertical row',
  'seated leg curl',
  'deltoid fly'
];

function recoverDay2Workout(data) {
  data.ui ||= {};
  data.ui.migrations ||= {};

  // One-time repair for the original Friday/Saturday save bug.
  if (data.ui.migrations.day2RecoveryV1) return data;

  const friday = (data.workouts || []).find(w => w.date === DAY_1_DATE);
  if (!friday || !Array.isArray(friday.exercises)) return data;

  // Day 1 is known to contain these six baseline activities.
  // Keep the first occurrence of each on Friday; move all extras to Saturday.
  const unmatchedDay1 = new Set(DAY_1_EXERCISES);
  const keepFriday = [];
  const moveToSaturday = [];

  for (const exercise of friday.exercises) {
    const name = String(exercise?.name || '').trim().toLowerCase();

    if (unmatchedDay1.has(name)) {
      keepFriday.push(exercise);
      unmatchedDay1.delete(name);
    } else {
      moveToSaturday.push(exercise);
    }
  }

  // If Friday contains only the known Day 1 workout, do nothing.
  if (!moveToSaturday.length) return data;

  friday.exercises = keepFriday;

  let saturday = (data.workouts || []).find(w => w.date === DAY_2_DATE);

  if (!saturday) {
    saturday = {
      id: '2026-08-01-day-2-recovered',
      date: DAY_2_DATE,
      day: 'Saturday',
      title: 'Day 2: Building Momentum',
      startTime: '',
      startTimeExact: null,
      note: 'Recovered from the original Day 1 record after the date-tracking repair.',
      exercises: []
    };

    data.workouts.push(saturday);
  }

  saturday.exercises ||= [];
  saturday.exercises.push(
    ...moveToSaturday.map(exercise => ({
      ...exercise,
      recoveredFromDate: DAY_1_DATE
    }))
  );

  data.workouts.sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || ''))
  );

  data.ui.migrations.day2RecoveryV1 = {
    applied: true,
    movedExercises: moveToSaturday.length,
    from: DAY_1_DATE,
    to: DAY_2_DATE
  };

  return data;
}

export function mergeSave(saved, seed) {
  const merged = clone(seed);
  if (!saved || typeof saved !== 'object') return merged;

  merged.version = 4;
  merged.profile = { ...merged.profile, ...(saved.profile || {}) };

  // v0.4 migrates changing measurements away from permanent identity fields.
  merged.profile.dateOfBirth ||= null;
  merged.profile.heightDisplay ||= saved.profile?.heightDisplay || null;
  merged.profile.heightInches ||= saved.profile?.heightInches || null;
  merged.profile.heightCm ||= saved.profile?.heightCm || null;

  merged.workouts =
    Array.isArray(saved.workouts) && saved.workouts.length
      ? saved.workouts
      : merged.workouts;

  merged.nutrition = Array.isArray(saved.nutrition) ? saved.nutrition : [];
  merged.checkIns = Array.isArray(saved.checkIns) ? saved.checkIns : [];
  merged.ui = { ...merged.ui, ...(saved.ui || {}) };

  // Preserve a prior saved weight by creating a non-destructive migration check-in.
  if (!merged.checkIns.length && saved.profile?.weight) {
    const date =
      merged.workouts?.[merged.workouts.length - 1]?.date ||
      new Date().toISOString().slice(0, 10);

    merged.checkIns.push({
      id: `migrated-${date}`,
      date,
      weight: Number(saved.profile.weight),
      weightUnit: saved.profile.weightUnit || 'lb',
      sleepHours: null,
      waterOz: 0,
      migrated: true
    });
  }

  recoverDay2Workout(merged);

  const learned = Array.isArray(saved.exerciseLibrary)
    ? saved.exerciseLibrary
    : [];

  const fromWorkouts = merged.workouts
    .flatMap(w => w.exercises || [])
    .map(e => ({
      id: slugify(e.name),
      name: e.name,
      type: e.type || 'strength',
      icon: e.icon || (e.type === 'cardio' ? '🏃' : '⚔️')
    }));

  merged.exerciseLibrary = dedupeLibrary([
    ...merged.exerciseLibrary,
    ...learned,
    ...fromWorkouts
  ]);

  return merged;
}

export const loadSave = seed => {
  try {
    return mergeSave(JSON.parse(localStorage.getItem(KEY)), seed);
  } catch {
    return clone(seed);
  }
};

export const writeSave = data =>
  localStorage.setItem(KEY, JSON.stringify(data));

export const resetSave = () => localStorage.removeItem(KEY);

export function slugify(text = '') {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `exercise-${Date.now()}`
  );
}

export function dedupeLibrary(items = []) {
  const seen = new Map();

  items.forEach(item => {
    if (!item?.name) return;
    const key = item.name.trim().toLowerCase();

    if (!seen.has(key)) {
      seen.set(key, {
        ...item,
        id: item.id || slugify(item.name)
      });
    }
  });

  return [...seen.values()];
}
