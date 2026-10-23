import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useDraft } from '../state.jsx';
import BuilderPanel from '../components/BuilderPanel.jsx';

// /build works on the persisted draft; /build/:id first loads an existing workout into it.
export default function Builder() {
  const { id } = useParams();
  const { draft, load } = useDraft();
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!id || String(draft.id) === id);

  useEffect(() => {
    if (!id || String(draft.id) === id) return;
    api('GET', `/workouts/${id}`).then((w) => { load(w); setReady(true); }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!ready) return <p className="muted">Loading…</p>;
  return (
    <div className="narrow">
      <h1>Workout builder</h1>
      <p className="muted">Need more exercises? <Link to="/">Browse the library</Link> — your draft is saved as you go.</p>
      <BuilderPanel />
    </div>
  );
}
