import { openDb, seedExercises } from './db.js';

const db = openDb();
console.log(`Seeded ${seedExercises(db)} exercises`);
