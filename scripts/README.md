Run migration files without `psql` using Node

1) Install dependency (in project root):

```
npm install pg
```

2) Run the migration file (set `DATABASE_URL` to your connection string):

Windows PowerShell:

```
$env:DATABASE_URL = "postgresql://postgres:YOUR_PASSWORD@db.edfxrcznnobhtfzxumes.supabase.co:5432/postgres"
node scripts/run_migration.js supabase/migrations/008_parent_admission_integration.sql
```

macOS / Linux:

```
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.edfxrcznnobhtfzxumes.supabase.co:5432/postgres"
node scripts/run_migration.js supabase/migrations/008_parent_admission_integration.sql
```

Notes:
- If your password contains special characters such as `@` or `#`, URL-encode them (e.g. `@` → `%40`).
- Alternatively, run the SQL via the Supabase Dashboard SQL editor.
