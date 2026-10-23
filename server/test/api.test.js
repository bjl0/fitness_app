import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seedExercises } from '../src/db.js';
import { createApp } from '../src/app.js';

let base;
let db;

before(async () => {
  db = openDb(':memory:');
  seedExercises(db);
  const server = createApp(db, { rateLimits: false }).listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://localhost:${server.address().port}/api`;
  server.unref();
});

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function user(name) {
  const r = await call('POST', '/auth/register', {
    body: { username: name, email: `${name}@x.io`, password: 'password123' },
  });
  assert.equal(r.status, 201);
  return r.body.token;
}

const lines = (...ids) => ids.map((exercise_id) => ({ exercise_id, sets: 3, reps: 10 }));
async function published(token, name, ids = [1, 2]) {
  const w = await call('POST', '/workouts', { token, body: { name, exercises: lines(...ids) } });
  assert.equal(w.status, 201);
  const p = await call('POST', `/workouts/${w.body.id}/publish`, { token });
  assert.equal(p.status, 200);
  return w.body.id;
}

test('seed loads 63 exercises and filters work', async () => {
  const all = await call('GET', '/exercises');
  assert.equal(all.body.total, 63);
  assert.equal(all.body.items.length, 20);
  const chest = await call('GET', '/exercises?muscle=Chest&difficulty=Beginner');
  assert.deepEqual(chest.body.items.map((e) => e.name), ['Push-Up']);
  const q = await call('GET', '/exercises?q=curl');
  assert.ok(q.body.total >= 5);
});

test('auth: duplicate, bad login, short password', async () => {
  await user('dupe');
  const dup = await call('POST', '/auth/register', { body: { username: 'DUPE', email: 'z@x.io', password: 'password123' } });
  assert.equal(dup.status, 409);
  const short = await call('POST', '/auth/register', { body: { username: 'new1', email: 'n@x.io', password: 'short' } });
  assert.equal(short.status, 400);
  const login = await call('POST', '/auth/login', { body: { login: 'dupe', password: 'nope' } });
  assert.equal(login.status, 401);
  const ok = await call('POST', '/auth/login', { body: { login: 'dupe@x.io', password: 'password123' } });
  assert.equal(ok.status, 200);
});

test('workout validation: needs reps or duration, known exercises', async () => {
  const t = await user('val');
  const noReps = await call('POST', '/workouts', { token: t, body: { name: 'x', exercises: [{ exercise_id: 1, sets: 3 }] } });
  assert.equal(noReps.status, 400);
  const unknown = await call('POST', '/workouts', { token: t, body: { name: 'x', exercises: lines(9999) } });
  assert.equal(unknown.status, 400);
  const dur = await call('POST', '/workouts', {
    token: t,
    body: { name: 'plank', exercises: [{ exercise_id: 50, sets: 3, duration_sec: 45 }] },
  });
  assert.equal(dur.status, 201);
});

test('owner-only edit/delete/publish; drafts are private', async () => {
  const a = await user('owner1');
  const b = await user('other1');
  const w = await call('POST', '/workouts', { token: a, body: { name: 'Draft', exercises: lines(1, 2, 3) } });
  const id = w.body.id;
  assert.deepEqual(w.body.exercises.map((e) => e.position), [0, 1, 2]);
  assert.equal((await call('GET', `/workouts/${id}`)).status, 404);
  assert.equal((await call('GET', `/workouts/${id}`, { token: b })).status, 404);
  assert.equal((await call('GET', `/workouts/${id}`, { token: a })).status, 200);
  assert.equal((await call('PUT', `/workouts/${id}`, { token: b, body: { name: 'hax', exercises: lines(1) } })).status, 403);
  assert.equal((await call('POST', `/workouts/${id}/publish`, { token: b })).status, 403);
  assert.equal((await call('DELETE', `/workouts/${id}`, { token: b })).status, 403);
  const upd = await call('PUT', `/workouts/${id}`, { token: a, body: { name: 'Renamed', exercises: lines(3, 1) } });
  assert.equal(upd.body.name, 'Renamed');
  assert.deepEqual(upd.body.exercises.map((e) => e.exercise_id), [3, 1]);
  assert.equal((await call('DELETE', `/workouts/${id}`, { token: a })).status, 204);
});

test('favorites: no self-favorite, one per user, counters, idempotent', async () => {
  const a = await user('fav_owner');
  const b = await user('fav_b');
  const id = await published(a, 'Fav me');
  assert.equal((await call('PUT', `/workouts/${id}/favorite`, { token: a })).status, 403);
  assert.equal((await call('PUT', `/workouts/${id}/favorite`)).status, 401);
  const f1 = await call('PUT', `/workouts/${id}/favorite`, { token: b });
  assert.equal(f1.body.favorite_count, 1);
  const f2 = await call('PUT', `/workouts/${id}/favorite`, { token: b });
  assert.equal(f2.body.favorite_count, 1);
  const feed = await call('GET', '/feed', { token: b });
  assert.equal(feed.body.items.find((w) => w.id === id).viewer_has_favorited, true);
  const un = await call('DELETE', `/workouts/${id}/favorite`, { token: b });
  assert.equal(un.body.favorite_count, 0);
  assert.equal((await call('DELETE', `/workouts/${id}/favorite`, { token: b })).body.favorite_count, 0);
});

test('comments: add, delete rights, counter, escaped length cap', async () => {
  const a = await user('com_owner');
  const b = await user('com_b');
  const c = await user('com_c');
  const id = await published(a, 'Talk about me');
  const mine = await call('POST', `/workouts/${id}/comments`, { token: b, body: { body: '<b>nice</b>' } });
  assert.equal(mine.status, 201);
  assert.equal((await call('POST', `/workouts/${id}/comments`, { token: b, body: { body: 'x'.repeat(1001) } })).status, 400);
  assert.equal((await call('POST', `/workouts/${id}/comments`, { token: b, body: { body: '  ' } })).status, 400);
  const other = await call('POST', `/workouts/${id}/comments`, { token: c, body: { body: 'hi' } });
  assert.equal((await call('GET', `/workouts/${id}`)).body.comment_count, 2);
  // a stranger can't delete; the commenter and the workout owner can
  assert.equal((await call('DELETE', `/comments/${other.body.id}`, { token: b })).status, 403);
  assert.equal((await call('DELETE', `/comments/${other.body.id}`, { token: a })).status, 204);
  assert.equal((await call('DELETE', `/comments/${mine.body.id}`, { token: b })).status, 204);
  assert.equal((await call('GET', `/workouts/${id}`)).body.comment_count, 0);
});

test('unpublish hides from feed but keeps favorites and comments', async () => {
  const a = await user('unp_owner');
  const b = await user('unp_b');
  const id = await published(a, 'Hide me');
  await call('PUT', `/workouts/${id}/favorite`, { token: b });
  await call('POST', `/workouts/${id}/comments`, { token: b, body: { body: 'keep' } });
  await call('POST', `/workouts/${id}/unpublish`, { token: a });
  const feed = await call('GET', '/feed');
  assert.ok(!feed.body.items.some((w) => w.id === id));
  assert.equal((await call('GET', `/workouts/${id}/comments`)).status, 404);
  assert.equal((await call('PUT', `/workouts/${id}/favorite`, { token: b })).status, 404);
  await call('POST', `/workouts/${id}/publish`, { token: a });
  const w = await call('GET', `/workouts/${id}`);
  assert.equal(w.body.favorite_count, 1);
  assert.equal(w.body.comment_count, 1);
});

test('feed ranking: favorites, then comments, then newest; filters', async () => {
  const author = await user('rank_author');
  const f1 = await user('rank_f1');
  const f2 = await user('rank_f2');
  const legs = await published(author, 'Legs', [32, 33]); // Quads, barbell
  const arms = await published(author, 'Arms', [22, 23]); // Biceps
  const chest = await published(author, 'Chest', [1, 3]);
  await call('PUT', `/workouts/${legs}/favorite`, { token: f1 });
  await call('PUT', `/workouts/${arms}/favorite`, { token: f1 });
  await call('PUT', `/workouts/${arms}/favorite`, { token: f2 });
  await call('POST', `/workouts/${legs}/comments`, { token: f1, body: { body: 'c1' } });
  await call('POST', `/workouts/${legs}/comments`, { token: f2, body: { body: 'c2' } });
  const feed = await call('GET', '/feed?sort=top');
  const order = feed.body.items.map((w) => w.id).filter((i) => [legs, arms, chest].includes(i));
  assert.deepEqual(order, [arms, legs, chest]); // arms: 2 favs; legs: 1 fav + 2 comments
  const biceps = await call('GET', '/feed?muscle=Biceps');
  assert.ok(biceps.body.items.every((w) => w.muscle_groups.includes('Biceps')));
  assert.ok(biceps.body.items.some((w) => w.id === arms));
  const dumbbell = await call('GET', '/feed?equipment=Dumbbell');
  assert.ok(!dumbbell.body.items.some((w) => w.id === chest));
});

test('deleting a workout cascades', async () => {
  const a = await user('casc_owner');
  const b = await user('casc_b');
  const id = await published(a, 'Gone');
  await call('PUT', `/workouts/${id}/favorite`, { token: b });
  await call('POST', `/workouts/${id}/comments`, { token: b, body: { body: 'bye' } });
  await call('DELETE', `/workouts/${id}`, { token: a });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM favorites WHERE workout_id = ?').get(id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM comments WHERE workout_id = ?').get(id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM workout_exercises WHERE workout_id = ?').get(id).n, 0);
});
