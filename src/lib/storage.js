const LEGACY_KEY = 'fitquest-save-v1';

const clone = value =>
  JSON.parse(JSON.stringify(value));


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


// ---------------------------------------------------------
// ORIGINAL FRIDAY / SATURDAY RECOVERY
// ---------------------------------------------------------

function recoverDay2Workout(data) {
  data.ui ||= {};
  data.ui.migrations ||= {};

  if (data.ui.migrations.day2RecoveryV1) {
    return data;
  }

  const friday =
    (data.workouts || []).find(
      workout =>
        workout.date === DAY_1_DATE
    );

  if (
    !friday ||
    !Array.isArray(friday.exercises)
  ) {
    return data;
  }

  const unmatchedDay1 =
    new Set(DAY_1_EXERCISES);

  const keepFriday = [];
  const moveToSaturday = [];

  for (const exercise of friday.exercises) {
    const name =
      String(exercise?.name || '')
        .trim()
        .toLowerCase();

    if (unmatchedDay1.has(name)) {
      keepFriday.push(exercise);
      unmatchedDay1.delete(name);
    } else {
      moveToSaturday.push(exercise);
    }
  }

  if (!moveToSaturday.length) {
    return data;
  }

  friday.exercises = keepFriday;

  let saturday =
    (data.workouts || []).find(
      workout =>
        workout.date === DAY_2_DATE
    );

  if (!saturday) {
    saturday = {
      id: '2026-08-01-day-2-recovered',
      date: DAY_2_DATE,
      day: 'Saturday',
      title: 'Day 2: Building Momentum',
      startTime: '',
      startTimeExact: null,
      note:
        'Recovered from the original Day 1 record after the date-tracking repair.',
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

  data.workouts.sort(
    (a, b) =>
      String(a.date || '')
        .localeCompare(
          String(b.date || '')
        )
  );

  data.ui.migrations.day2RecoveryV1 = {
    applied: true,
    movedExercises:
      moveToSaturday.length,
    from: DAY_1_DATE,
    to: DAY_2_DATE
  };

  return data;
}


// ---------------------------------------------------------
// SAVE MIGRATION / MERGE
// ---------------------------------------------------------

export function mergeSave(
  saved,
  seed
) {
  const merged = clone(seed);

  if (
    !saved ||
    typeof saved !== 'object'
  ) {
    return merged;
  }

  merged.version = 4;

  merged.profile = {
    ...merged.profile,
    ...(saved.profile || {})
  };

  merged.profile.dateOfBirth ||= null;

  merged.profile.heightDisplay ||=
    saved.profile?.heightDisplay ||
    null;

  merged.profile.heightInches ||=
    saved.profile?.heightInches ||
    null;

  merged.profile.heightCm ||=
    saved.profile?.heightCm ||
    null;


  merged.workouts =
    Array.isArray(saved.workouts) &&
    saved.workouts.length
      ? saved.workouts
      : merged.workouts;


  merged.nutrition =
    Array.isArray(saved.nutrition)
      ? saved.nutrition
      : [];


  merged.checkIns =
    Array.isArray(saved.checkIns)
      ? saved.checkIns
      : [];


  merged.ui = {
    ...merged.ui,
    ...(saved.ui || {})
  };


  // Preserve old profile weight as a check-in.
  if (
    !merged.checkIns.length &&
    saved.profile?.weight
  ) {
    const date =
      merged.workouts?.[
        merged.workouts.length - 1
      ]?.date ||
      new Date()
        .toISOString()
        .slice(0, 10);

    merged.checkIns.push({
      id:
        `migrated-${date}`,
      date,
      weight:
        Number(saved.profile.weight),
      weightUnit:
        saved.profile.weightUnit ||
        'lb',
      sleepHours: null,
      waterOz: 0,
      migrated: true
    });
  }


  recoverDay2Workout(merged);


  const learned =
    Array.isArray(
      saved.exerciseLibrary
    )
      ? saved.exerciseLibrary
      : [];


  const fromWorkouts =
    merged.workouts
      .flatMap(
        workout =>
          workout.exercises || []
      )
      .map(exercise => ({
        id:
          slugify(exercise.name),

        name:
          exercise.name,

        type:
          exercise.type ||
          'strength',

        icon:
          exercise.icon ||
          (
            exercise.type ===
            'cardio'
              ? '🏃'
              : '⚔️'
          )
      }));


  merged.exerciseLibrary =
    dedupeLibrary([
      ...merged.exerciseLibrary,
      ...learned,
      ...fromWorkouts
    ]);


  return merged;
}


// ---------------------------------------------------------
// CLOUD SAVE
// ---------------------------------------------------------

async function fetchCloudSave() {
  const response =
    await fetch('/api/save', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

  if (response.status === 401) {
    throw new Error(
      'You are not signed in.'
    );
  }

  const result =
    await response.json();

  if (
    !response.ok ||
    !result.ok
  ) {
    throw new Error(
      result.error ||
      'Unable to load cloud save.'
    );
  }

  return result.save || null;
}


async function sendCloudSave(data) {
  const response =
    await fetch('/api/save', {
      method: 'PUT',

      credentials: 'same-origin',

      headers: {
        'Content-Type':
          'application/json'
      },

      body:
        JSON.stringify({
          save: data
        })
    });

  const result =
    await response.json();

  if (
    !response.ok ||
    !result.ok
  ) {
    throw new Error(
      result.error ||
      'Unable to save progress.'
    );
  }

  return true;
}


// ---------------------------------------------------------
// PUBLIC STORAGE FUNCTIONS
// ---------------------------------------------------------

export async function loadSave(seed) {
  try {
    const cloudSave =
      await fetchCloudSave();

    // Existing cloud save wins.
    if (cloudSave) {
      return mergeSave(
        cloudSave,
        seed
      );
    }


    // No cloud save yet:
    // migrate the old browser save once.
    const legacyText =
      localStorage.getItem(
        LEGACY_KEY
      );

    if (legacyText) {
      try {
        const legacySave =
          JSON.parse(legacyText);

        const migrated =
          mergeSave(
            legacySave,
            seed
          );

        await sendCloudSave(
          migrated
        );

        // Cloud copy succeeded,
        // so remove the old local save.
        localStorage.removeItem(
          LEGACY_KEY
        );

        return migrated;

      } catch (error) {
        console.error(
          'Legacy save migration failed:',
          error
        );
      }
    }


    // Brand-new account.
    return clone(seed);

  } catch (error) {
    console.error(
      'Cloud load failed:',
      error
    );

    return clone(seed);
  }
}


export async function writeSave(
  data
) {
  try {
    await sendCloudSave(data);

    return true;

  } catch (error) {
    console.error(
      'Cloud save failed:',
      error
    );

    return false;
  }
}


// Currently only clears the old browser copy.
// We won't delete cloud data accidentally.
export function resetSave() {
  localStorage.removeItem(
    LEGACY_KEY
  );
}


// ---------------------------------------------------------
// EXERCISE HELPERS
// ---------------------------------------------------------

export function slugify(
  text = ''
) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(
        /[^a-z0-9]+/g,
        '-'
      )
      .replace(
        /(^-|-$)/g,
        ''
      ) ||
    `exercise-${Date.now()}`
  );
}


export function dedupeLibrary(
  items = []
) {
  const seen =
    new Map();

  items.forEach(item => {
    if (!item?.name) {
      return;
    }

    const key =
      item.name
        .trim()
        .toLowerCase();

    if (!seen.has(key)) {
      seen.set(
        key,
        {
          ...item,

          id:
            item.id ||
            slugify(item.name)
        }
      );
    }
  });

  return [
    ...seen.values()
  ];
}
