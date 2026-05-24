#!/usr/bin/env node
/**
 * Run a SQL migration file using node-postgres (no psql required).
 *
 * Usage:
 *   - install dependency: `npm install pg`
 *   - set `DATABASE_URL` env var (Postgres connection string)
 *   - node scripts/run_migration.js supabase/migrations/008_parent_admission_integration.sql
 */

import fs from "fs";
import path from "path";
import pkg from "pg";
const { Client } = pkg;

async function main() {
  const fileArg = process.argv[2] || "supabase/migrations/008_parent_admission_integration.sql";
  const filePath = path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(filePath)) {
    console.error("Migration file not found:", filePath);
    process.exit(2);
  }

  const sql = fs.readFileSync(filePath, "utf8");

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!databaseUrl) {
    console.error("Set DATABASE_URL environment variable to your Postgres connection string.");
    process.exit(3);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("Connected to database. Running migration:", fileArg);

    // Run the full SQL file in one go. pg supports $$ function bodies.
    await client.query(sql);

    console.log("Migration applied successfully.");
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message || err);
    try {
      await client.end();
    } catch {}
    process.exit(4);
  }
}

main();
