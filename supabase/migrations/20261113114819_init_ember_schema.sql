-- 1. Enable PostGIS extension FIRST so GEOGRAPHY type works
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create the unified hotspots table for MODIS and VIIRS
CREATE TABLE wildfire_hotspots (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL, -- 'MODIS' or 'VIIRS'
    confidence TEXT NOT NULL, -- Normalized: 'low', 'medium', 'high'
    brightness FLOAT,
    acq_date DATE NOT NULL,
    acq_time TEXT NOT NULL,
    location GEOGRAPHY (Point, 4326) NOT NULL, -- PostGIS spatial point (Lon, Lat)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add a spatial index for fast proximity queries
CREATE INDEX idx_wildfire_hotspots_location ON wildfire_hotspots USING GIST (location);