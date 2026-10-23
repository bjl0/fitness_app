import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import WorkoutCard from '../components/WorkoutCard.jsx';

export default function Favorites() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('GET', '/workouts/favorites').then(setItems).catch((e) => setError(e.message)); }, []);
  // Unfavoriting drops the workout from this list; otherwise just refresh its counts.
  const update = (w) =>
    setItems((xs) => (w.viewer_has_favorited ? xs.map((x) => (x.id === w.id ? { ...x, ...w } : x)) : xs.filter((x) => x.id !== w.id)));

  return (
    <section>
      <h1>Favorited workouts</h1>
      <p className="muted">Workouts you've favorited are saved here automatically. Open one to copy it into My workouts.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items && items.length === 0 && <p className="empty">Nothing here yet. Favorite a workout from the <Link to="/feed">feed</Link> and it will show up here.</p>}
      <div className="grid">
        {items?.map((w) => <WorkoutCard key={w.id} workout={w} onChange={update} />)}
      </div>
    </section>
  );
}
