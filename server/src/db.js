import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export function openDb(file = process.env.DB_FILE || path.join(here, '..', 'data', 'app.db')) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  return db;
}

export function seedExercises(db, file = path.join(here, '..', 'data', 'exercises.seed.json')) {
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const insert = db.prepare(
    `INSERT INTO exercises (name, muscle_group, equipment, difficulty, description)
     VALUES (@name, @muscle_group, @equipment, @difficulty, @description)
     ON CONFLICT(name) DO UPDATE SET muscle_group=excluded.muscle_group,
       equipment=excluded.equipment, difficulty=excluded.difficulty`
  );
  db.transaction(() => rows.forEach((r) => insert.run({ description: null, ...r })))();
  return rows.length;
}
