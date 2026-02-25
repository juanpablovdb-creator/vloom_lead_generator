# Teams (removed)

The app previously had a **team** concept (shared workspaces). It was removed in migration `008_remove_teams.sql`.

- All data is now **per user** (user_id). API keys, saved searches, and leads are scoped by `user_id`.
- The `is_shared` flag on leads still exists for future use (e.g. sharing with other users without teams).
