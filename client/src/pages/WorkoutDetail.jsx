import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state.jsx';
import { FavoriteButton } from '../components/WorkoutCard.jsx';

const fmtLine = (e) => `${e.sets} × ${e.reps != null ? `${e.reps} reps` : `${e.duration_sec}s`}${e.rest_sec ? ` · rest ${e.rest_sec}s` : ''}`;

export default function WorkoutDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [w, setW] = useState(null);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setW(null); setError('');
    api('GET', `/workouts/${id}`).then(setW).catch((e) => setError(e.message));
    api('GET', `/workouts/${id}/comments`).then(setComments).catch(() => setComments([]));
  }, [id, user]);

  if (error) return <p className="error">{error === 'Workout not found' ? 'This workout is private or no longer exists.' : error}</p>;
  if (!w) return <p className="muted">Loading…</p>;

  const own = user && w.user_id === user.id;
  const bump = (n) => setW((x) => ({ ...x, comment_count: x.comment_count + n }));

  async function post(e) {
    e.preventDefault();
    if (!user) return nav('/auth', { state: { from: `/workouts/${id}` } });
    setPosting(true);
    try {
      const c = await api('POST', `/workouts/${id}/comments`, { body });
      setComments((cs) => [...cs, c]); bump(1); setBody(''); setError('');
    } catch (err) { alert(err.message); } finally { setPosting(false); }
  }
  async function del(c) {
    try {
      await api('DELETE', `/comments/${c.id}`);
      setComments((cs) => cs.filter((x) => x.id !== c.id)); bump(-1);
    } catch (err) { alert(err.message); }
  }

  return (
    <article className="narrow">
      <div className="row between">
        <h1>{w.name}</h1>
        {own && <Link className="btn small" to={`/build/${w.id}`}>Edit</Link>}
      </div>
      <p className="muted">by {w.author}{!w.is_published && ' · Draft (only you can see this)'}</p>
      <div className="tags">{w.muscle_groups.map((m) => <span key={m} className="tag">{m}</span>)}</div>
      {w.description && <p className="desc">{w.description}</p>}
      <ol className="detail-lines">
        {w.exercises.map((e) => (
          <li key={e.id}>
            <strong>{e.name}</strong> <span className="tag">{e.muscle_group}</span>
            <div className="muted">{fmtLine(e)}</div>
            {e.notes && <div className="note">{e.notes}</div>}
          </li>
        ))}
      </ol>
      {w.is_published && (
        <>
          <div className="row gap">
            <FavoriteButton workout={w} onChange={(x) => setW((cur) => ({ ...cur, ...x }))} />
          </div>
          <h2>Comments ({w.comment_count})</h2>
          <ul className="comments">
            {comments.map((c) => (
              <li key={c.id}>
                <div className="row between">
                  <strong>{c.author}</strong>
                  <span className="muted">{c.created_at}</span>
                </div>
                <p>{c.body}</p>
                {c.can_delete && <button className="link" onClick={() => del(c)}>Delete</button>}
              </li>
            ))}
            {comments.length === 0 && <li className="empty">No comments yet.</li>}
          </ul>
          <form onSubmit={post}>
            <textarea rows={3} maxLength={1000} placeholder={user ? 'Add a comment…' : 'Sign in to comment'}
                      value={body} onChange={(e) => setBody(e.target.value)} />
            <button className="btn primary" disabled={posting || !body.trim()}>Post comment</button>
          </form>
        </>
      )}
    </article>
  );
}
