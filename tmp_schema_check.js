const Database = require('better-sqlite3');
const db = new Database('./data/users.db', { readonly: true });

try {
  console.log("Testing query 1 (plans/route.ts):");
  db.prepare(`
    SELECT COUNT(DISTINCT wd.id) as total_workouts,
           MAX(wd.completed_at) as last_workout
    FROM completed_sets cs
    JOIN workout_exercises we ON cs.workout_exercise_id = we.id
    JOIN workout_days wd ON we.workout_day_id = wd.id
    JOIN workout_plans wp ON wd.plan_id = wp.id
    WHERE wp.user_id = ?
  `).all('test-user');
  console.log("Query 1 success!");
} catch (e) {
  console.error("Query 1 failed:", e);
}

try {
  console.log("Testing query 2 (recommendations/route.ts):");
  db.prepare(`
    SELECT e.name, MAX(cs.weight_kg) as max_weight
    FROM completed_sets cs
    JOIN workout_exercises we ON cs.workout_exercise_id = we.id
    JOIN exercises e ON we.exercise_id = e.id
    JOIN workout_days wd ON we.workout_day_id = wd.id
    JOIN workout_plans wp ON wd.plan_id = wp.id
    WHERE wp.user_id = ? AND cs.completed_at >= DATE('now', '-30 days')
    GROUP BY e.id
    HAVING COUNT(DISTINCT SUBSTR(cs.completed_at, 1, 10)) >= 4
      AND MAX(cs.weight_kg) = MIN(cs.weight_kg)
  `).all('test-user');
  console.log("Query 2 success!");
} catch (e) {
  console.error("Query 2 failed:", e);
}

try {
  console.log("Testing query 3 (progress/route.ts):");
  db.prepare(`
    SELECT 
      STRFTIME('%Y-W%W', cs.completed_at) as week,
      SUM(cs.weight_kg * cs.reps_completed) as volume
    FROM completed_sets cs
    JOIN workout_exercises we ON cs.workout_exercise_id = we.id
    JOIN workout_days wd ON we.workout_day_id = wd.id
    JOIN workout_plans wp ON wd.plan_id = wp.id
    WHERE wp.user_id = ? AND wd.date >= ? AND wd.completed = 1
    GROUP BY week
    ORDER BY week ASC
  `).all('test-user', '2026-05-01');
  console.log("Query 3 success!");
} catch (e) {
  console.error("Query 3 failed:", e);
}
