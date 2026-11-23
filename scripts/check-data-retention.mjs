import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const app = fs.readFileSync(new URL('index.html', root), 'utf8');
const schema = fs.readFileSync(new URL('supabase/migrations/001_food_tracker.sql', root), 'utf8');
const problems = [];
const requireText = (text, expected, label) => {
  if (!text.includes(expected)) problems.push(label);
};
const forbid = (text, pattern, label) => {
  if (pattern.test(text)) problems.push(label);
};

// The browser must never contain a hard-delete path for inventory or its
// consumption history. A used-up food remains a retained record.
forbid(app, /\.from\('(?:food_items|food_events)'\)\.delete\(/, 'Client contains a hard-delete request for food data.');
forbid(app, /\.from\('food_events'\)\.(?:update|delete)\(/, 'Client mutates or deletes consumption history.');
forbid(app, /update\(\{[^}]*deleted_at\s*:/, 'Client can hide a food record by changing deleted_at.');
requireText(app, ".from('food_items').select('*').is('deleted_at',null)", 'Active inventory does not explicitly filter soft-deleted rows.');
requireText(app, 'food_items:allFoods||[],food_events:events||[]', 'Offline backup does not include both inventory and consumption history.');

// Database policy must leave deletion unavailable to browser users. Food events
// are append-only; food items are private and are updated only by their owner.
requireText(schema, 'alter table public.food_items enable row level security;', 'food_items RLS is not enabled.');
requireText(schema, 'alter table public.food_events enable row level security;', 'food_events RLS is not enabled.');
requireText(schema, 'for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);', 'food_items owner update policy is incomplete.');
requireText(schema, 'for insert with check ((select auth.uid()) = user_id);', 'food_items owner insert policy is incomplete.');
requireText(schema, 'create policy "owners append food events" on public.food_events\n  for insert with check ((select auth.uid()) = user_id);', 'food event append policy is incomplete.');
forbid(schema, /create\s+policy[\s\S]{0,180}for\s+delete/i, 'Schema grants a client delete policy.');
forbid(schema, /on\s+delete\s+cascade/i, 'Food records would cascade-delete with an account.');
const eventPolicies = schema.slice(schema.indexOf('create policy "food events are private"'));
forbid(eventPolicies, /create\s+policy[\s\S]{0,180}for\s+update/i, 'Schema lets browser users rewrite consumption history.');

if (problems.length) {
  console.error(`Data-retention check failed: ${problems.length} issue(s).`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Data-retention check passed: client hard deletes are absent; food records are private and consumption history is append-only.');
}
