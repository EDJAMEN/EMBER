-- 20261113114819_init_ember_schema.sql
-- Enable PostGIS extension for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Wildfire hotspots table for normalized telemetry ingestion
CREATE TABLE IF NOT EXISTS wildfire_hotspots (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    confidence TEXT NOT NULL,
    brightness FLOAT,
    acq_date DATE NOT NULL,
    acq_time TEXT NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Essential PostGIS GiST index for fast spatial indexing (ST_DWithin, ST_Distance, bbox queries)
CREATE INDEX IF NOT EXISTS idx_wildfire_hotspots_location 
ON wildfire_hotspots USING GIST (location);
