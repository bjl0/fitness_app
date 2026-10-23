CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  muscle_group TEXT NOT NULL,
  equipment TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Beginner','Intermediate','Advanced')),
  description TEXT
);
CREATE INDEX IF NOT EXISTS idx_exercises_filter ON exercises (muscle_group, equipment, difficulty);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_rank ON workouts (is_published, favorite_count DESC, comment_count DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts (user_id);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL,
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER,
  duration_sec INTEGER,
  rest_sec INTEGER DEFAULT 60,
  notes TEXT,
  UNIQUE (workout_id, position)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, workout_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_workout ON comments (workout_id, created_at);

CREATE TRIGGER IF NOT EXISTS fav_add AFTER INSERT ON favorites BEGIN
  UPDATE workouts SET favorite_count = favorite_count + 1 WHERE id = NEW.workout_id;
END;
CREATE TRIGGER IF NOT EXISTS fav_del AFTER DELETE ON favorites BEGIN
  UPDATE workouts SET favorite_count = favorite_count - 1 WHERE id = OLD.workout_id;
END;
CREATE TRIGGER IF NOT EXISTS com_add AFTER INSERT ON comments BEGIN
  UPDATE workouts SET comment_count = comment_count + 1 WHERE id = NEW.workout_id;
END;
CREATE TRIGGER IF NOT EXISTS com_del AFTER DELETE ON comments BEGIN
  UPDATE workouts SET comment_count = comment_count - 1 WHERE id = OLD.workout_id;
END;
