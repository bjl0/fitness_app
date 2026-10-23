# Workout Builder (prototype)

Browse an exercise database, assemble named workouts, publish them, and let others favorite and comment.
Built from `Workout Builder App: Product Spec and Data Model`.

**Stack:** React (Vite) · Node + Express · SQLite (better-sqlite3) · JWT auth

## Run it

```bash
npm install
npm run dev        # API on :3001, web on :5173 (proxies /api)
npm test           # API tests (in-memory SQLite)
```

The database is created at `server/data/app.db` and the 63 exercises in
`server/data/exercises.seed.json` are loaded on first start (`npm run seed` re-syncs them).
Set `JWT_SECRET` (and optionally `DB_FILE`, `PORT`) for anything beyond local use.

## What's built

All five flows from the spec: browse/filter exercises, build a workout (drag or arrow-button reordering,
sets/reps-or-duration/rest, notes; draft persists locally), publish/unpublish, ranked feed
(separate **Top favorited** and **Most comments** rankings plus **New**, filterable by muscle/equipment),
favorites + comments, a **Favorited workouts** page (everything you've favorited, saved automatically), and **copying** any published workout into your own library as a private draft.

Rules enforced server-side: owner-only edit/delete/publish; no self-favorites; one favorite per user
(composite PK); comments only on published workouts, 1–1000 chars, deletable by author or workout owner;
unpublishing keeps favorites and comments; contiguous `position` values (assigned from list order);
counters maintained by SQL triggers; bcrypt password hashing; rate limits on auth and write endpoints.

## Deliberately left out of the prototype

- Comment report button / hidden flag, email verification (spec's open questions / pre-launch safeguards)
