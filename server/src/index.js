import { openDb, seedExercises } from './db.js';
import { createApp } from './app.js';

const db = openDb();
if (db.prepare('SELECT COUNT(*) n FROM exercises').get().n === 0) {
  console.log(`Seeded ${seedExercises(db)} exercises`);
}
const port = process.env.PORT || 3001;
createApp(db).listen(port, () => console.log(`API listening on http://localhost:${port}`));
