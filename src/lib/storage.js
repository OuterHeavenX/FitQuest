const LEGACY_KEY = 'fitquest-save-v1';
const clone = value => JSON.parse(JSON.stringify(value));
let lastCloudUpdatedAt = null;

const DAY_1_DATE = '2026-07-31';
const DAY_2_DATE = '2026-08-01';
const DAY_1_EXERCISES = ['treadmill','bicep curl','shoulder press','vertical row','seated leg curl','deltoid fly'];

function notifySync(status, detail = {}) {
  window.dispatchEvent(new CustomEvent('fitquest:sync', { detail: { status, updated_at: lastCloudUpdatedAt, ...detail } }));
}
function normalizeTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (raw.includes('T') || raw.endsWith('Z')) return raw;
  return `${raw.replace(' ', 'T')}Z`;
}
function timestampMs(value) {
  const ms = Date.parse(normalizeTimestamp(value) || '');
  return Number.isFinite(ms) ? ms : 0;
}

function recoverDay2Workout(data) {
  data.ui ||= {};
  data.ui.migrations ||= {};
  if (data.ui.migrations.day2RecoveryV1) return data;
  const friday = (data.workouts || []).find(w => w.date === DAY_1_DATE);
  if (!friday || !Array.isArray(friday.exercises)) return data;
  const unmatched = new Set(DAY_1_EXERCISES);
  const keep = [], move = [];
  for (const exercise of friday.exercises) {
    const name = String(exercise?.name || '').trim().toLowerCase();
    if (unmatched.has(name)) { keep.push(exercise); unmatched.delete(name); }
    else move.push(exercise);
  }
  if (!move.length) return data;
  friday.exercises = keep;
  let saturday = (data.workouts || []).find(w => w.date === DAY_2_DATE);
  if (!saturday) {
    saturday = { id:'2026-08-01-day-2-recovered', date:DAY_2_DATE, day:'Saturday', title:'Day 2: Building Momentum', startTime:'', startTimeExact:null, note:'Recovered from the original Day 1 record after the date-tracking repair.', exercises:[] };
    data.workouts.push(saturday);
  }
  saturday.exercises ||= [];
  saturday.exercises.push(...move.map(exercise => ({ ...exercise, recoveredFromDate: DAY_1_DATE })));
  data.workouts.sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')));
  data.ui.migrations.day2RecoveryV1 = { applied:true, movedExercises:move.length, from:DAY_1_DATE, to:DAY_2_DATE };
  return data;
}

export function mergeSave(saved, seed) {
  const merged = clone(seed);
  if (!saved || typeof saved !== 'object') return merged;
  merged.version = 4;
  merged.profile = { ...merged.profile, ...(saved.profile || {}) };
  merged.profile.dateOfBirth ||= null;
  merged.profile.heightDisplay ||= saved.profile?.heightDisplay || null;
  merged.profile.heightInches ||= saved.profile?.heightInches || null;
  merged.profile.heightCm ||= saved.profile?.heightCm || null;
  merged.workouts = Array.isArray(saved.workouts) && saved.workouts.length ? saved.workouts : merged.workouts;
  merged.nutrition = Array.isArray(saved.nutrition) ? saved.nutrition : [];
  merged.checkIns = Array.isArray(saved.checkIns) ? saved.checkIns : [];
  merged.ui = { ...merged.ui, ...(saved.ui || {}) };
  if (!merged.checkIns.length && saved.profile?.weight) {
    const date = merged.workouts?.[merged.workouts.length - 1]?.date || new Date().toISOString().slice(0,10);
    merged.checkIns.push({ id:`migrated-${date}`, date, weight:Number(saved.profile.weight), weightUnit:saved.profile.weightUnit || 'lb', sleepHours:null, waterOz:0, migrated:true });
  }
  recoverDay2Workout(merged);
  const learned = Array.isArray(saved.exerciseLibrary) ? saved.exerciseLibrary : [];
  const fromWorkouts = merged.workouts.flatMap(w => w.exercises || []).map(e => ({ id:slugify(e.name), name:e.name, type:e.type || 'strength', icon:e.icon || (e.type === 'cardio' ? '🏃' : '⚔️') }));
  merged.exerciseLibrary = dedupeLibrary([...merged.exerciseLibrary, ...learned, ...fromWorkouts]);
  return merged;
}

async function fetchCloudSave() {
  notifySync('loading');
  const response = await fetch('/api/save', { method:'GET', credentials:'same-origin', cache:'no-store' });
  if (response.status === 401) { notifySync('signed-out'); throw new Error('You are not signed in.'); }
  const result = await response.json();
  if (!response.ok || !result.ok) {
    notifySync('error', { error: result.error || 'Unable to load cloud save.' });
    throw new Error(result.error || 'Unable to load cloud save.');
  }
  lastCloudUpdatedAt = result.updated_at || null;
  notifySync('synced');
  return { save: result.save || null, updated_at: result.updated_at || null };
}

async function sendCloudSave(data) {
  notifySync('saving');
  const response = await fetch('/api/save', { method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ save:data }) });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    notifySync('error', { error: result.error || 'Unable to save progress.' });
    throw new Error(result.error || 'Unable to save progress.');
  }
  lastCloudUpdatedAt = result.updated_at || lastCloudUpdatedAt;
  notifySync('synced');
  return { ok:true, updated_at:lastCloudUpdatedAt };
}

export async function readCloudSave() { return fetchCloudSave(); }
export function getLastCloudUpdatedAt() { return lastCloudUpdatedAt; }

export async function checkCloudForNewer() {
  try {
    const response = await fetch('/api/save/meta', { method:'GET', credentials:'same-origin', cache:'no-store' });
    if (response.status === 401) return { authenticated:false, newer:false };
    const result = await response.json();
    if (!response.ok || !result.ok) return { authenticated:true, newer:false };
    const remote = result.updated_at || null;
    const newer = timestampMs(remote) > timestampMs(lastCloudUpdatedAt);
    if (newer) window.dispatchEvent(new CustomEvent('fitquest:remote-update', { detail:{ remote_updated_at:remote, local_updated_at:lastCloudUpdatedAt } }));
    return { authenticated:true, newer, updated_at:remote };
  } catch { return { authenticated:true, newer:false }; }
}

export async function loadSave(seed) {
  try {
    const cloud = await fetchCloudSave();
    if (cloud.save) return mergeSave(cloud.save, seed);
    const legacyText = localStorage.getItem(LEGACY_KEY);
    if (legacyText) {
      try {
        const migrated = mergeSave(JSON.parse(legacyText), seed);
        await sendCloudSave(migrated);
        localStorage.removeItem(LEGACY_KEY);
        return migrated;
      } catch (error) { console.error('Legacy save migration failed:', error); }
    }
    return clone(seed);
  } catch (error) {
    console.error('Cloud load failed:', error);
    return clone(seed);
  }
}

export async function writeSave(data) {
  try { await sendCloudSave(data); return true; }
  catch (error) { console.error('Cloud save failed:', error); return false; }
}

export function resetSave() { localStorage.removeItem(LEGACY_KEY); }
export function slugify(text='') { return text.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || `exercise-${Date.now()}`; }
export function dedupeLibrary(items=[]) {
  const seen = new Map();
  items.forEach(item => {
    if (!item?.name) return;
    const key = item.name.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, { ...item, id:item.id || slugify(item.name) });
  });
  return [...seen.values()];
}
