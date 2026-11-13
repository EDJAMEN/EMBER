# 🔥 EMBER — Project Context & Engineering Practices

> **System Name:** EMBER (*Emergency Monitoring & Burn-zone Early Response*)  
> **Core Mission:** Harmonize fragmented NASA MODIS and VIIRS satellite thermal feeds into a unified, real-time geospatial public safety dashboard for disaster risk management units (DRRMCs) and local communities.

---

## 1. System Overview & Architecture

EMBER eliminates the need for separate backend servers (such as Express) by utilizing a unified full-stack architecture:

* **Frontend & API Layer:** **Next.js (App Router, TypeScript, Tailwind CSS)**
  * Client components render an interactive dark-mode geospatial map, detection confidence toggles, a 7-day timeline playback slider, and a settlement proximity tracker.
  * Server-side Route Handlers (`app/api/...`) securely ingest CSV/JSON feeds from NASA FIRMS, normalize satellite discrepancies, and upsert records into the database.
* **Database & Geospatial Engine:** **Supabase (PostgreSQL + PostGIS)**
  * Stores harmonized hotspot detections as spatial `GEOGRAPHY(Point, 4326)` records.
  * Uses PostGIS spatial indexes (`GIST`) and distance functions (`ST_DWithin`, `ST_Distance`) to calculate fire proximity to populated towns and agricultural zones directly in SQL.

---

## 2. Core Domain & Harmonization Rules

Because **MODIS** and **VIIRS** operate on different spatial resolutions and reporting standards, all ingested data **must** pass through normalization rules before storage or display:

### A. Confidence Score Normalization
* **MODIS** reports numeric percentages (`0` to `100`):
  * `< 30` $\rightarrow$ `'low'`
  * `30 – 79` $\rightarrow$ `'medium'`
  * `>= 80` $\rightarrow$ `'high'`
* **VIIRS** reports categorical strings (`l`, `n`, `h`):
  * `'l'` (low) $\rightarrow$ `'low'`
  * `'n'` (nominal) $\rightarrow$ `'medium'`
  * `'h'` (high) $\rightarrow$ `'high'`

### B. Spatial Resolution & Clustering
* **MODIS** has a pixel resolution of roughly $1\text{ km}^2$, whereas **VIIRS** has a resolution of $375\text{ m}^2$.
* A single fire event frequently triggers overlapping detections across both satellites. Queries and map clustering logic must account for spatial proximity so emergency responders do not receive inflated duplicate alerts.

### C. Coordinate Ordering Convention
* Standard APIs/UI components often use `[Latitude, Longitude]`.
* **PostGIS strictly expects `(Longitude, Latitude)`**—i.e., `POINT(lon lat)` in SRID `4326`. Always verify coordinate order when writing ingestion scripts or spatial queries.

---

## 3. Mandatory Engineering & Database Practices

To keep the repository clean, reproducible, and safe for team collaboration or AI-assisted coding, follow these strict rules:

### Rule 1: All Database Changes Require a Supabase CLI Migration File
* **NEVER** create tables, alter columns, add indexes, or enable extensions manually through the Supabase Web Dashboard SQL Editor.
* Every schema change **must** be captured as a version-controlled SQL migration file inside `supabase/migrations/`:
  1. Generate a migration file:
     ```bash
     npx supabase migration new <descriptive_snake_case_name>
     ```
  2. Write idempotent, clean SQL inside the generated file (e.g., ensuring `CREATE EXTENSION IF NOT EXISTS postgis;` precedes any `GEOGRAPHY` column definitions).
  3. Push the migration to the remote database:
     ```bash
     npx supabase db push --remote
     ```
  4. Commit the new `supabase/migrations/*.sql` file to Git alongside the application code that depends on it.

### Rule 2: Strict Secret & Key Separation
* **Client-Side Safe (`NEXT_PUBLIC_*`):** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be exposed to browser components.
* **Server-Only Secrets:** `SUPABASE_SERVICE_ROLE_KEY` and `NASA_FIRMS_MAP_KEY` must **never** be prefixed with `NEXT_PUBLIC_` or imported into Client Components (`"use client"`). Use them exclusively inside `app/api/...` Route Handlers or Server Actions.
* Never commit `.env.local` to version control.

### Rule 3: PostGIS Spatial Indexing & Performance
* Any new table containing a `GEOGRAPHY` or `GEOMETRY` column **must** include a `GIST` spatial index in the same migration file:
  ```sql
  CREATE INDEX idx_<table>_<column> ON <table> USING GIST (<column>);
  ```
* Perform radius searches and settlement distance calculations in PostgreSQL using `ST_DWithin` (which leverages spatial indexes) rather than fetching raw coordinates and computing Haversine formulas in JavaScript.

### Rule 4: Idempotent Data Ingestion
* NASA FIRMS feeds overlap across rolling 24-hour and 48-hour windows.
* Ingestion routes (`app/api/sync-fires`) should prevent duplicate entries on repeated runs by deduplicating on a composite key (e.g., `source`, rounded coordinates, `acq_date`, and `acq_time`) or using `ON CONFLICT DO NOTHING` upserts.

### Rule 5: Keep Context & Documentation Synced
* Whenever a major architectural decision, table schema, or core harmonization rule changes, update `context.md` and `cheatsheet.md` in the same pull request or commit so onboarding developers and AI assistants always have accurate project context.