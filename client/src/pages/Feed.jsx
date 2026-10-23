import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useAuth } from '../state.jsx';
import Chips from '../components/Chips.jsx';
import Pager from '../components/Pager.jsx';
import WorkoutCard from '../components/WorkoutCard.jsx';

export default function Feed() {
  const { user } = useAuth();
  const [meta, setMeta] = useState({ muscles: [], equipment: [] });
  const [f, setF] = useState({ muscle: '', equipment: '', sort: 'top' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('GET', '/exercises/meta').then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    let live = true;
    api('GET', `/feed${qs({ ...f, page: page > 1 ? page : '' })}`)
      .then((r) => live && (setRes(r), setError('')))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [f, page, user]);

  const setFilter = (k) => (v) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  const replace = (w) => setRes((r) => ({ ...r, items: r.items.map((x) => (x.id === w.id ? { ...x, ...w } : x)) }));

  return (
    <section>
      <div className="row between">
        <h1>Community feed</h1>
        <div className="seg" role="group" aria-label="Sort">
          {[['top', 'Top favorited'], ['comments', 'Most comments'], ['new', 'New']].map(([k, label]) => (
            <button key={k} className={f.sort === k ? 'on' : ''} onClick={() => setFilter('sort')(k)}>{label}</button>
          ))}
        </div>
      </div>
      <Chips label="Muscle" options={meta.muscles} value={f.muscle} onChange={setFilter('muscle')} />
      <Chips label="Equipment" options={meta.equipment} value={f.equipment} onChange={setFilter('equipment')} />
      {error && <p className="error" role="alert">{error}</p>}
      {res && res.items.length === 0 && <p className="empty">Nothing published here yet — be the first!</p>}
      <div className="grid">
        {res?.items.map((w, i) => (
          <div key={w.id} className="ranked">
            {f.sort !== 'new' && <span className="rank">#{(page - 1) * 20 + i + 1}</span>}
            <WorkoutCard workout={w} onChange={replace} />
          </div>
        ))}
      </div>
      {res && <Pager page={page} pages={res.pages} onPage={setPage} />}
    </section>
  );
}
