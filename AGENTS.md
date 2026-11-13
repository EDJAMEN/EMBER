## Project architecture
- Next.js (App Router) + Tailwind v4. Pages live in `app/`; each has a server `page.tsx` (metadata) and a `*-client.tsx`.
- The dashboard shows illustrative sample data by default; the "LIVE" toggle fetches NASA FIRMS through `app/api/firms`.
- Supabase (PostGIS) is wired via `lib/supabase.ts`; schema changes go in `supabase/migrations/` only.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, FIRMS keys) must never be imported into client components.
