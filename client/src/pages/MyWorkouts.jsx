import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useDraft } from '../state.jsx';
import WorkoutCard from '../components/WorkoutCard.jsx';

export default function MyWorkouts() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const { draft, clear } = useDraft();
  const nav = useNavigate();

  useEffect(() => { api('GET', '/workouts/mine').then(setItems).catch((e) => setError(e.message)); }, []);
  const replace = (w) => setItems((xs) => xs.map((x) => (x.id === w.id ? { ...x, ...w } : x)));

  async function toggle(w) {
    try {
      const r = await api('POST', `/workouts/${w.id}/${w.is_published ? 'unpublish' : 'publish'}`);
      replace(r);
    } catch (e) { setError(e.message); }
  }
  async function remove(w) {
    if (!confirm(`Delete "${w.name}"? This also removes its favorites and comments.`)) return;
    try {
      await api('DELETE', `/workouts/${w.id}`);
      setItems((xs) => xs.filter((x) => x.id !== w.id));
      if (draft.id === w.id) clear();
    } catch (e) { setError(e.message); }
  }

  return (
    <section>
      <div className="row between">
        <h1>My workouts</h1>
        <button className="btn primary" onClick={() => { clear(); nav('/build'); }}>+ New workout</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items && items.length === 0 && <p className="empty">No workouts yet. <Link to="/">Pick some exercises</Link> to get started.</p>}
      <div className="grid">
        {items?.map((w) => (
          <div key={w.id} className="mine">
            <WorkoutCard workout={w} onChange={replace}>
              <span className={`status ${w.is_published ? 'pub' : ''}`}>{w.is_published ? 'Published' : 'Draft'}</span>
            </WorkoutCard>
            <div className="row gap actions">
              <Link className="btn small" to={`/build/${w.id}`}>Edit</Link>
              <button className="btn small" onClick={() => toggle(w)}>{w.is_published ? 'Unpublish' : 'Publish'}</button>
              <button className="btn small danger" onClick={() => remove(w)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
