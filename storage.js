const KEY = 'fitquest-save-v1';
const clone = value => JSON.parse(JSON.stringify(value));

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
  merged.workouts = Array.isArray(saved.workouts) && saved.workouts.length ? saved.workouts : merged.workouts;
  merged.nutrition = Array.isArray(saved.nutrition) ? saved.nutrition : [];
  merged.checkIns = Array.isArray(saved.checkIns) ? saved.checkIns : [];
  // Preserve a prior saved weight by creating a non-destructive migration check-in.
  if(!merged.checkIns.length && saved.profile?.weight){
    const date = merged.workouts?.[merged.workouts.length-1]?.date || new Date().toISOString().slice(0,10);
    merged.checkIns.push({id:`migrated-${date}`,date,weight:Number(saved.profile.weight),weightUnit:saved.profile.weightUnit||'lb',sleepHours:null,waterOz:0,migrated:true});
  }
  merged.ui = { ...merged.ui, ...(saved.ui || {}) };
  const learned = Array.isArray(saved.exerciseLibrary) ? saved.exerciseLibrary : [];
  const fromWorkouts = merged.workouts.flatMap(w => w.exercises || []).map(e => ({
    id: slugify(e.name), name: e.name, type: e.type || 'strength', icon: e.icon || (e.type === 'cardio' ? '🏃' : '⚔️')
  }));
  merged.exerciseLibrary = dedupeLibrary([...merged.exerciseLibrary, ...learned, ...fromWorkouts]);
  return merged;
}

export const loadSave = seed => {
  try { return mergeSave(JSON.parse(localStorage.getItem(KEY)), seed); }
  catch { return clone(seed); }
};
export const writeSave = data => localStorage.setItem(KEY, JSON.stringify(data));
export const resetSave = () => localStorage.removeItem(KEY);
export function slugify(text='') { return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `exercise-${Date.now()}`; }
export function dedupeLibrary(items=[]){
  const seen = new Map();
  items.forEach(item=>{ if(!item?.name)return; const key=item.name.trim().toLowerCase(); if(!seen.has(key))seen.set(key,{...item,id:item.id||slugify(item.name)}); });
  return [...seen.values()];
}
