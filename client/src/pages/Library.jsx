import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useDraft } from '../state.jsx';
import Chips from '../components/Chips.jsx';
import Pager from '../components/Pager.jsx';
import BuilderPanel from '../components/BuilderPanel.jsx';

export default function Library() {
  const { draft, addExercise } = useDraft();
  const [meta, setMeta] = useState({ muscles: [], equipment: [], difficulties: [] });
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [f, setF] = useState({ muscle: '', equipment: '', difficulty: '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ items: [], total: 0, pages: 1 });
  const [error, setError] = useState('');

  useEffect(() => { api('GET', '/exercises/meta').then(setMeta).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let live = true;
    api('GET', `/exercises${qs({ q: debouncedQ, ...f, page: page > 1 ? page : '' })}`)
      .then((r) => live && (setRes(r), setError('')))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [debouncedQ, f, page]);

  const setFilter = (k) => (v) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  const inDraft = (id) => draft.lines.filter((l) => l.exercise_id === id).length;

  return (
    <div className="split">
      <section>
        <h1>Exercise library</h1>
        <input type="search" className="search" placeholder="Search exercises…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Chips label="Muscle" options={meta.muscles} value={f.muscle} onChange={setFilter('muscle')} />
        <Chips label="Equipment" options={meta.equipment} value={f.equipment} onChange={setFilter('equipment')} />
        <Chips label="Difficulty" options={meta.difficulties} value={f.difficulty} onChange={setFilter('difficulty')} />
        {error && <p className="error" role="alert">{error}</p>}
        <p className="muted">{res.total} exercise{res.total === 1 ? '' : 's'}</p>
        <div className="grid">
          {res.items.map((ex) => (
            <article key={ex.id} className="card">
              <h3>{ex.name}</h3>
              <div className="tags">
                <span className="tag">{ex.muscle_group}</span>
                <span className="tag">{ex.equipment}</span>
                <span className={`tag level ${ex.difficulty}`}>{ex.difficulty}</span>
              </div>
              <button className="btn small" onClick={() => addExercise(ex)}>
                + Add to workout{inDraft(ex.id) > 0 && ` (${inDraft(ex.id)})`}
              </button>
            </article>
          ))}
        </div>
        {res.items.length === 0 && !error && <p className="empty">No exercises match those filters.</p>}
        <Pager page={page} pages={res.pages} onPage={setPage} />
      </section>
      <BuilderPanel compact />
    </div>
  );
}
