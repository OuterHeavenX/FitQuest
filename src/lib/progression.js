export function calculateStats(data){
  const workouts = data.workouts || [];
  const exercises = workouts.flatMap(w=>w.exercises || []);

  const strengthSets = exercises
    .filter(e=>e.type==='strength')
    .reduce((n,e)=>n+(Number(e.sets)||0),0);

  const cardio = exercises
    .filter(e=>e.type==='cardio')
    .reduce((n,e)=>n+(Number(e.duration)||0),0);

  const exerciseXp = exercises
    .reduce((n,e)=>n+(Number(e.xp)||0),0);

  const nutritionXp = (data.nutrition || [])
    .reduce((n,e)=>n+(Number(e.xp)||0),0);

  const completionXp = workouts
    .reduce((n,w)=>n+(Number(w.completionXp)||0),0);

  const xp = exerciseXp + nutritionXp + completionXp;

  const distinctDates = [...new Set(
    workouts
      .filter(w =>
        (Array.isArray(w.exercises) && w.exercises.length > 0) ||
        w.completed === true
      )
      .map(w=>w.date)
      .filter(Boolean)
  )].sort();

  const streak = calculateStreak(distinctDates);
  const level = Math.floor(xp / 500) + 1;
  const levelXp = xp % 500;

  return {
    workouts: distinctDates.length,
    strengthSets,
    cardio,
    xp,
    streak,
    level,
    levelXp,
    completionXp
  };
}

function calculateStreak(dateStrings){
  if (!dateStrings.length) return 0;

  let streak = 1;

  for(let i=dateStrings.length-1;i>0;i--){
    const a = new Date(`${dateStrings[i]}T12:00:00`);
    const b = new Date(`${dateStrings[i-1]}T12:00:00`);
    const diff = Math.round((a-b)/86400000);

    if(diff===1) streak++;
    else break;
  }

  return streak;
}

export function nextExerciseXP(type, sets=3, duration=0, distance=0){
  if(type==='cardio') {
    return Math.max(
      20,
      Math.round(
        (Number(duration)||10)*2 +
        (Number(distance)||0)*3
      )
    );
  }

  return 16 + (Number(sets)||1)*4;
}

export function nutritionXP(entry){
  const macroCount = ['protein','carbs','fat']
    .filter(k => Number(entry[k]) > 0)
    .length;

  return 4 + macroCount * 2;
}
