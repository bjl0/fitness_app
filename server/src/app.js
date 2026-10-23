import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const PAGE_SIZE = 20;
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

const toInt = (v) => (Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);
const str = (v, max) => (typeof v === 'string' && v.trim().length && v.trim().length <= max ? v.trim() : null);

export function createApp(db, { rateLimits = true } = {}) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  const limiter = (windowMs, max) =>
    rateLimits ? rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false }) : (_q, _s, n) => n();
  const authLimiter = limiter(15 * 60 * 1000, 30);
  const writeLimiter = limiter(60 * 1000, 30);

  // ---- auth helpers -------------------------------------------------------
  const sign = (u) => jwt.sign({ sub: u.id, username: u.username }, SECRET, { expiresIn: '7d' });

  function readToken(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return null;
    try {
      const p = jwt.verify(m[1], SECRET);
      return { id: p.sub, username: p.username };
    } catch {
      return null;
    }
  }
  const optionalAuth = (req, _res, next) => {
    req.user = readToken(req);
    next();
  };
  const requireAuth = (req, _res, next) => {
    req.user = readToken(req);
    next(req.user ? undefined : new HttpError(401, 'Sign in required'));
  };

  // ---- auth ---------------------------------------------------------------
  app.post('/api/auth/register', authLimiter, (req, res) => {
    const username = str(req.body.username, 30);
    const email = str(req.body.email, 120)?.toLowerCase();
    const password = req.body.password;
    if (!username || !/^[\w.-]+$/.test(username)) throw bad('Username must be 1-30 letters, numbers, . _ -');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw bad('A valid email is required');
    if (typeof password !== 'string' || password.length < 8) throw bad('Password must be at least 8 characters');
    const dup = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE OR email = ?').get(username, email);
    if (dup) throw new HttpError(409, 'Username or email already in use');
    const info = db
      .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
      .run(username, email, bcrypt.hashSync(password, 10));
    const user = { id: Number(info.lastInsertRowid), username };
    res.status(201).json({ token: sign(user), user });
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    const { login, password } = req.body;
    if (typeof login !== 'string' || typeof password !== 'string') throw bad('Login and password required');
    const row = db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ?')
      .get(login.trim(), login.trim().toLowerCase());
    if (!row || !bcrypt.compareSync(password, row.password_hash)) throw new HttpError(401, 'Invalid credentials');
    const user = { id: row.id, username: row.username };
    res.json({ token: sign(user), user });
  });

  // ---- exercises ----------------------------------------------------------
  app.get('/api/exercises/meta', (_req, res) => {
    const col = (c) => db.prepare(`SELECT DISTINCT ${c} v FROM exercises ORDER BY v`).all().map((r) => r.v);
    res.json({
      muscles: col('muscle_group'),
      equipment: col('equipment'),
      difficulties: ['Beginner', 'Intermediate', 'Advanced'],
    });
  });

  app.get('/api/exercises', (req, res) => {
    const { q, muscle, equipment, difficulty } = req.query;
    const where = [];
    const args = [];
    if (typeof q === 'string' && q.trim()) {
      where.push("name LIKE ? ESCAPE '\\'");
      args.push(`%${q.trim().replace(/[\\%_]/g, '\\$&')}%`);
    }
    for (const [col, val] of [['muscle_group', muscle], ['equipment', equipment], ['difficulty', difficulty]]) {
      if (typeof val === 'string' && val) {
        where.push(`${col} = ?`);
        args.push(val);
      }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, toInt(req.query.page) || 1);
    const total = db.prepare(`SELECT COUNT(*) n FROM exercises ${clause}`).get(...args).n;
    const items = db
      .prepare(`SELECT * FROM exercises ${clause} ORDER BY name LIMIT ? OFFSET ?`)
      .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  });

  app.get('/api/exercises/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
    if (!row) throw new HttpError(404, 'Exercise not found');
    res.json(row);
  });

  // ---- workouts -----------------------------------------------------------
  const exerciseLines = db.prepare(
    `SELECT we.id, we.exercise_id, we.position, we.sets, we.reps, we.duration_sec, we.rest_sec, we.notes,
            e.name, e.muscle_group, e.equipment, e.difficulty
     FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
     WHERE we.workout_id = ? ORDER BY we.position`
  );

  const workoutSelect = (viewerId) => `
    SELECT w.id, w.user_id, u.username AS author, w.name, w.description, w.is_published, w.published_at,
           w.favorite_count, w.comment_count, w.created_at, w.updated_at,
           (SELECT group_concat(DISTINCT e.muscle_group) FROM workout_exercises we
              JOIN exercises e ON e.id = we.exercise_id WHERE we.workout_id = w.id) AS muscle_groups,
           (SELECT COUNT(*) FROM workout_exercises we WHERE we.workout_id = w.id) AS exercise_count,
           ${viewerId ? `EXISTS(SELECT 1 FROM favorites f WHERE f.workout_id = w.id AND f.user_id = ${Number(viewerId)})` : '0'} AS viewer_has_favorited
    FROM workouts w JOIN users u ON u.id = w.user_id`;

  const shape = (r) => ({
    ...r,
    is_published: !!r.is_published,
    viewer_has_favorited: !!r.viewer_has_favorited,
    muscle_groups: r.muscle_groups ? r.muscle_groups.split(',') : [],
  });

  function parseWorkout(body) {
    const name = str(body.name, 100);
    if (!name) throw bad('Workout name is required (max 100 characters)');
    const description = body.description == null || body.description === '' ? null : str(body.description, 500);
    if (body.description && !description) throw bad('Description is too long (max 500 characters)');
    if (!Array.isArray(body.exercises) || body.exercises.length === 0) throw bad('Add at least one exercise');
    if (body.exercises.length > 50) throw bad('A workout can have at most 50 exercises');
    const known = db.prepare('SELECT 1 FROM exercises WHERE id = ?');
    // Positions are assigned from array order, so they are always contiguous (0..n-1).
    const lines = body.exercises.map((x, i) => {
      const exercise_id = toInt(x.exercise_id);
      if (exercise_id === null || !known.get(exercise_id)) throw bad(`Line ${i + 1}: unknown exercise`);
      const sets = toInt(x.sets);
      if (sets === null || sets < 1 || sets > 20) throw bad(`Line ${i + 1}: sets must be 1-20`);
      const reps = x.reps == null || x.reps === '' ? null : toInt(x.reps);
      const duration_sec = x.duration_sec == null || x.duration_sec === '' ? null : toInt(x.duration_sec);
      if (reps === null && duration_sec === null) throw bad(`Line ${i + 1}: set reps or a duration`);
      if (reps !== null && (reps < 1 || reps > 500)) throw bad(`Line ${i + 1}: reps must be 1-500`);
      if (duration_sec !== null && (duration_sec < 1 || duration_sec > 7200)) throw bad(`Line ${i + 1}: duration must be 1-7200s`);
      const rest_sec = x.rest_sec == null || x.rest_sec === '' ? 60 : toInt(x.rest_sec);
      if (rest_sec === null || rest_sec > 3600) throw bad(`Line ${i + 1}: rest must be 0-3600s`);
      const notes = x.notes ? str(x.notes, 300) : null;
      if (x.notes && !notes) throw bad(`Line ${i + 1}: notes too long (max 300)`);
      return { exercise_id, position: i, sets, reps, duration_sec, rest_sec, notes };
    });
    return { name, description, lines };
  }

  const insertLine = db.prepare(
    `INSERT INTO workout_exercises (workout_id, exercise_id, position, sets, reps, duration_sec, rest_sec, notes)
     VALUES (@workout_id, @exercise_id, @position, @sets, @reps, @duration_sec, @rest_sec, @notes)`
  );

  function loadOwned(req) {
    const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id);
    if (!w) throw new HttpError(404, 'Workout not found');
    if (w.user_id !== req.user.id) throw new HttpError(403, 'Only the owner can do that');
    return w;
  }

  function detail(id, viewer) {
    const row = db.prepare(`${workoutSelect(viewer?.id)} WHERE w.id = ?`).get(id);
    if (!row) throw new HttpError(404, 'Workout not found');
    if (!row.is_published && row.user_id !== viewer?.id) throw new HttpError(404, 'Workout not found');
    return { ...shape(row), exercises: exerciseLines.all(id) };
  }

  app.get('/api/workouts/mine', requireAuth, (req, res) => {
    const rows = db
      .prepare(`${workoutSelect(req.user.id)} WHERE w.user_id = ? ORDER BY w.updated_at DESC, w.id DESC`)
      .all(req.user.id);
    res.json(rows.map(shape));
  });

  app.post('/api/workouts', requireAuth, writeLimiter, (req, res) => {
    const { name, description, lines } = parseWorkout(req.body);
    const id = db.transaction(() => {
      const wid = Number(
        db.prepare('INSERT INTO workouts (user_id, name, description) VALUES (?, ?, ?)').run(req.user.id, name, description)
          .lastInsertRowid
      );
      lines.forEach((l) => insertLine.run({ ...l, workout_id: wid }));
      return wid;
    })();
    res.status(201).json(detail(id, req.user));
  });

  app.get('/api/workouts/:id', optionalAuth, (req, res) => res.json(detail(req.params.id, req.user)));

  app.put('/api/workouts/:id', requireAuth, writeLimiter, (req, res) => {
    const w = loadOwned(req);
    const { name, description, lines } = parseWorkout(req.body);
    db.transaction(() => {
      db.prepare("UPDATE workouts SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?").run(
        name,
        description,
        w.id
      );
      db.prepare('DELETE FROM workout_exercises WHERE workout_id = ?').run(w.id);
      lines.forEach((l) => insertLine.run({ ...l, workout_id: w.id }));
    })();
    res.json(detail(w.id, req.user));
  });

  app.delete('/api/workouts/:id', requireAuth, (req, res) => {
    const w = loadOwned(req);
    db.prepare('DELETE FROM workouts WHERE id = ?').run(w.id);
    res.status(204).end();
  });

  const setPublished = (on) => (req, res) => {
    const w = loadOwned(req);
    if (on) {
      const n = db.prepare('SELECT COUNT(*) n FROM workout_exercises WHERE workout_id = ?').get(w.id).n;
      if (!n) throw bad('Add exercises before publishing');
      db.prepare(
        "UPDATE workouts SET is_published = 1, published_at = COALESCE(published_at, datetime('now')) WHERE id = ?"
      ).run(w.id);
    } else {
      db.prepare('UPDATE workouts SET is_published = 0 WHERE id = ?').run(w.id);
    }
    res.json(detail(w.id, req.user));
  };
  app.post('/api/workouts/:id/publish', requireAuth, setPublished(true));
  app.post('/api/workouts/:id/unpublish', requireAuth, setPublished(false));

  // Copy a published workout (or one of your own) into the caller's library as a private draft.
  app.post('/api/workouts/:id/copy', requireAuth, writeLimiter, (req, res) => {
    const src = db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id);
    if (!src || (!src.is_published && src.user_id !== req.user.id)) throw new HttpError(404, 'Workout not found');
    const id = db.transaction(() => {
      const wid = Number(
        db.prepare('INSERT INTO workouts (user_id, name, description) VALUES (?, ?, ?)')
          .run(req.user.id, `Copy of ${src.name}`.slice(0, 100), src.description).lastInsertRowid
      );
      db.prepare(
        `INSERT INTO workout_exercises (workout_id, exercise_id, position, sets, reps, duration_sec, rest_sec, notes)
         SELECT ?, exercise_id, position, sets, reps, duration_sec, rest_sec, notes
         FROM workout_exercises WHERE workout_id = ?`
      ).run(wid, src.id);
      return wid;
    })();
    res.status(201).json(detail(id, req.user));
  });

  // ---- feed ---------------------------------------------------------------
  app.get('/api/feed', optionalAuth, (req, res) => {
    const where = ['w.is_published = 1'];
    const args = [];
    const { muscle, equipment } = req.query;
    if (typeof muscle === 'string' && muscle) {
      where.push(`EXISTS (SELECT 1 FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
                          WHERE we.workout_id = w.id AND e.muscle_group = ?)`);
      args.push(muscle);
    }
    if (typeof equipment === 'string' && equipment) {
      where.push(`EXISTS (SELECT 1 FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
                          WHERE we.workout_id = w.id AND e.equipment = ?)`);
      args.push(equipment);
    }
    // Separate rankings: "top" = most favorited, "comments" = most commented, "new" = newest.
    const ORDERS = {
      top: 'w.favorite_count DESC, w.comment_count DESC, w.published_at DESC, w.id DESC',
      comments: 'w.comment_count DESC, w.favorite_count DESC, w.published_at DESC, w.id DESC',
      new: 'w.published_at DESC, w.id DESC',
    };
    const order = ORDERS[req.query.sort] || ORDERS.top;
    const page = Math.max(1, toInt(req.query.page) || 1);
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) n FROM workouts w WHERE ${clause}`).get(...args).n;
    const rows = db
      .prepare(`${workoutSelect(req.user?.id)} WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    res.json({ items: rows.map(shape), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  });

  // ---- favorites ----------------------------------------------------------
  function publishedWorkout(id) {
    const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id);
    if (!w || !w.is_published) throw new HttpError(404, 'Workout not found');
    return w;
  }
  const counts = (id) => db.prepare('SELECT favorite_count, comment_count FROM workouts WHERE id = ?').get(id);

  app.put('/api/workouts/:id/favorite', requireAuth, writeLimiter, (req, res) => {
    const w = publishedWorkout(req.params.id);
    if (w.user_id === req.user.id) throw new HttpError(403, "You can't favorite your own workout");
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, workout_id) VALUES (?, ?)').run(req.user.id, w.id);
    res.json({ ...counts(w.id), viewer_has_favorited: true });
  });

  app.delete('/api/workouts/:id/favorite', requireAuth, writeLimiter, (req, res) => {
    const w = publishedWorkout(req.params.id);
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND workout_id = ?').run(req.user.id, w.id);
    res.json({ ...counts(w.id), viewer_has_favorited: false });
  });

  // ---- comments -----------------------------------------------------------
  app.get('/api/workouts/:id/comments', optionalAuth, (req, res) => {
    const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id);
    if (!w || (!w.is_published && w.user_id !== req.user?.id)) throw new HttpError(404, 'Workout not found');
    const rows = db
      .prepare(
        `SELECT c.id, c.user_id, u.username AS author, c.body, c.created_at
         FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.workout_id = ? ORDER BY c.created_at, c.id`
      )
      .all(w.id);
    res.json(
      rows.map((c) => ({
        ...c,
        can_delete: !!req.user && (c.user_id === req.user.id || w.user_id === req.user.id),
      }))
    );
  });

  app.post('/api/workouts/:id/comments', requireAuth, writeLimiter, (req, res) => {
    const w = publishedWorkout(req.params.id);
    const body = str(req.body.body, 1000);
    if (!body) throw bad('Comment must be 1-1000 characters');
    const info = db
      .prepare('INSERT INTO comments (workout_id, user_id, body) VALUES (?, ?, ?)')
      .run(w.id, req.user.id, body);
    const row = db
      .prepare(
        `SELECT c.id, c.user_id, u.username AS author, c.body, c.created_at
         FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
      )
      .get(info.lastInsertRowid);
    res.status(201).json({ ...row, can_delete: true });
  });

  app.delete('/api/comments/:id', requireAuth, (req, res) => {
    const c = db
      .prepare('SELECT c.*, w.user_id AS owner_id FROM comments c JOIN workouts w ON w.id = c.workout_id WHERE c.id = ?')
      .get(req.params.id);
    if (!c) throw new HttpError(404, 'Comment not found');
    if (c.user_id !== req.user.id && c.owner_id !== req.user.id) throw new HttpError(403, 'Not allowed');
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
    res.status(204).end();
  });

  // ---- errors -------------------------------------------------------------
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
  });

  return app;
}
