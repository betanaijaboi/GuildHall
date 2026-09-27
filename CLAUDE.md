# Guildhall — notes for agents

- Run `npm run lint && npm test` before committing; tests need Postgres (`guildhall_test` database).
- Schema changes: edit `src/db/schema.ts`, then `npm run db:generate -- --name <change>`. Never edit generated migrations by hand.
- Skill ids in `src/lib/taxonomy.ts` are stored in the database: add new ones freely, never rename or delete existing ids.
- Every server action must authorise through `loadProject(slug, user, minRole)`; never trust ids from the form without scoping them to the project.
- Keep `src/lib/github/events.ts` pure (no I/O); DB effects go in `apply.ts`.
- Never add long-lived GitHub user tokens to the database; installation tokens are minted per call.
