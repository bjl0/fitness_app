import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state.jsx';
import { useNavigate } from 'react-router-dom';

export function FavoriteButton({ workout, onChange }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const own = user && workout.user_id === user.id;

  async function toggle() {
    if (!user) return nav('/auth');
    setBusy(true);
    setErr('');
    try {
      const r = await api(workout.viewer_has_favorited ? 'DELETE' : 'PUT', `/workouts/${workout.id}/favorite`);
      onChange({ ...workout, ...r });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button className={`btn small fav ${workout.viewer_has_favorited ? 'on' : ''}`} disabled={busy || own}
              title={own ? "You can't favorite your own workout" : ''} aria-pressed={workout.viewer_has_favorited}
              onClick={toggle}>
        {workout.viewer_has_favorited ? '★' : '☆'} {workout.favorite_count}
      </button>
      {err && <span className="error inline">{err}</span>}
    </span>
  );
}

export default function WorkoutCard({ workout, onChange, children }) {
  return (
    <article className="card workout">
      <div className="row between">
        <h3><Link to={`/workouts/${workout.id}`}>{workout.name}</Link></h3>
        {children}
      </div>
      <p className="muted">
        by {workout.author} · {workout.exercise_count} exercise{workout.exercise_count === 1 ? '' : 's'}
      </p>
      <div className="tags">{workout.muscle_groups.map((m) => <span key={m} className="tag">{m}</span>)}</div>
      {workout.description && <p className="desc">{workout.description}</p>}
      <div className="row stats">
        <FavoriteButton workout={workout} onChange={onChange} />
        <Link className="btn small" to={`/workouts/${workout.id}`}>💬 {workout.comment_count}</Link>
      </div>
    </article>
  );
}
