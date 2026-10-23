import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, useDraft } from '../state.jsx';

function Line({ line, index, count, d, dragState }) {
  const [over, setOver] = useState(false);
  const num = (field, min = 0) => (
    <input type="number" min={min} value={line[field]} aria-label={field}
           onChange={(e) => d.updateLine(line.key, { [field]: e.target.value })} />
  );
  return (
    <li className={`line ${over ? 'over' : ''}`} draggable
        onDragStart={() => (dragState.from = index)}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={() => { setOver(false); d.moveLine(dragState.from, index); }}>
      <div className="row between">
        <strong><span className="grip" aria-hidden>⠿</span> {index + 1}. {line.name}</strong>
        <span className="row gap">
          <button className="icon" aria-label="Move up" disabled={index === 0} onClick={() => d.moveLine(index, index - 1)}>↑</button>
          <button className="icon" aria-label="Move down" disabled={index === count - 1} onClick={() => d.moveLine(index, index + 1)}>↓</button>
          <button className="icon" aria-label={`Remove ${line.name}`} onClick={() => d.removeLine(line.key)}>✕</button>
        </span>
      </div>
      <div className="inputs">
        <label>Sets {num('sets', 1)}</label>
        {line.mode === 'reps' ? <label>Reps {num('reps', 1)}</label> : <label>Seconds {num('duration_sec', 1)}</label>}
        <label>Rest (s) {num('rest_sec')}</label>
        <button className="link" onClick={() => d.updateLine(line.key, { mode: line.mode === 'reps' ? 'time' : 'reps' })}>
          use {line.mode === 'reps' ? 'duration' : 'reps'}
        </button>
      </div>
      <input className="notes" placeholder="Notes (optional)" maxLength={300} value={line.notes}
             onChange={(e) => d.updateLine(line.key, { notes: e.target.value })} />
    </li>
  );
}

export default function BuilderPanel({ compact = false }) {
  const d = useDraft();
  const { user } = useAuth();
  const nav = useNavigate();
  const { draft } = d;
  const [state, setState] = useState({ busy: false, error: '', ok: '' });
  const dragState = useRef({}).current;

  async function save(publish) {
    if (!user) return nav('/auth', { state: { from: '/build' } });
    setState({ busy: true, error: '', ok: '' });
    try {
      const w = draft.id
        ? await api('PUT', `/workouts/${draft.id}`, d.toPayload())
        : await api('POST', '/workouts', d.toPayload());
      if (publish) await api('POST', `/workouts/${w.id}/publish`);
      d.clear();
      nav(publish ? `/workouts/${w.id}` : '/mine');
    } catch (e) {
      setState({ busy: false, error: e.message, ok: '' });
    }
  }

  return (
    <aside className={`panel ${compact ? 'compact' : ''}`}>
      <div className="row between">
        <h2>{draft.id ? 'Editing workout' : 'New workout'}</h2>
        {(draft.lines.length > 0 || draft.name) && (
          <button className="link" onClick={() => confirm('Discard this draft?') && d.clear()}>Discard</button>
        )}
      </div>
      <input placeholder="Workout name" maxLength={100} value={draft.name} onChange={(e) => d.setField('name', e.target.value)} />
      <textarea placeholder="Description (optional)" rows={2} maxLength={500} value={draft.description}
                onChange={(e) => d.setField('description', e.target.value)} />
      {draft.lines.length === 0 ? (
        <p className="empty">No exercises yet. Add some from the <Link to="/">exercise library</Link>.</p>
      ) : (
        <ol className="lines">
          {draft.lines.map((l, i) => <Line key={l.key} line={l} index={i} count={draft.lines.length} d={d} dragState={dragState} />)}
        </ol>
      )}
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <div className="row gap">
        <button className="btn" disabled={state.busy} onClick={() => save(false)}>{draft.id ? 'Save changes' : 'Save draft'}</button>
        <button className="btn primary" disabled={state.busy} onClick={() => save(true)}>Save &amp; publish</button>
      </div>
    </aside>
  );
}
