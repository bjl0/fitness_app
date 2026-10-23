import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken } from './api.js';

// ---- auth ------------------------------------------------------------------
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  });
  const signIn = useCallback((data) => {
    setToken(data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  }, []);
  const signOut = useCallback(() => {
    setToken(null);
    localStorage.removeItem('user');
    setUser(null);
  }, []);
  // Expired/invalid tokens: any 401 on a signed-in session signs the user out.
  useEffect(() => {
    if (!user) return;
    api('GET', '/workouts/mine').catch((e) => e.status === 401 && signOut());
  }, [user, signOut]);
  return <AuthCtx.Provider value={{ user, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

// ---- workout draft (persisted so it survives navigation and reloads) -------
const DraftCtx = createContext(null);
export const useDraft = () => useContext(DraftCtx);

const EMPTY = { id: null, name: '', description: '', lines: [] };
let keySeq = Date.now();
const newKey = () => ++keySeq;

export function DraftProvider({ children }) {
  const [draft, setDraft] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('draft')) || EMPTY;
    } catch {
      return EMPTY;
    }
  });
  useEffect(() => localStorage.setItem('draft', JSON.stringify(draft)), [draft]);

  const api_ = {
    draft,
    setField: (k, v) => setDraft((d) => ({ ...d, [k]: v })),
    addExercise: (ex) =>
      setDraft((d) => ({
        ...d,
        lines: [
          ...d.lines,
          { key: newKey(), exercise_id: ex.id, name: ex.name, muscle_group: ex.muscle_group,
            mode: ex.muscle_group === 'Cardio' ? 'time' : 'reps',
            sets: 3, reps: 10, duration_sec: 60, rest_sec: 60, notes: '' },
        ],
      })),
    updateLine: (key, patch) =>
      setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })),
    removeLine: (key) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== key) })),
    moveLine: (from, to) =>
      setDraft((d) => {
        if (to < 0 || to >= d.lines.length || from === to) return d;
        const lines = [...d.lines];
        lines.splice(to, 0, lines.splice(from, 1)[0]);
        return { ...d, lines };
      }),
    clear: () => setDraft(EMPTY),
    load: (w) =>
      setDraft({
        id: w.id,
        name: w.name,
        description: w.description || '',
        lines: w.exercises.map((e) => ({
          key: newKey(), exercise_id: e.exercise_id, name: e.name, muscle_group: e.muscle_group,
          mode: e.reps == null ? 'time' : 'reps',
          sets: e.sets, reps: e.reps ?? 10, duration_sec: e.duration_sec ?? 60,
          rest_sec: e.rest_sec ?? 60, notes: e.notes || '',
        })),
      }),
    toPayload: () => ({
      name: draft.name,
      description: draft.description,
      exercises: draft.lines.map((l) => ({
        exercise_id: l.exercise_id, sets: Number(l.sets),
        reps: l.mode === 'reps' ? Number(l.reps) : null,
        duration_sec: l.mode === 'time' ? Number(l.duration_sec) : null,
        rest_sec: Number(l.rest_sec), notes: l.notes,
      })),
    }),
  };
  return <DraftCtx.Provider value={api_}>{children}</DraftCtx.Provider>;
}
