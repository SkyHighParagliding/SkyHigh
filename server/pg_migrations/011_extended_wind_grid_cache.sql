-- Cache for computed extended wind grids (bilinear interpolation results)
CREATE TABLE IF NOT EXISTS extended_wind_grids (
  id TEXT PRIMARY KEY,
  "windData" TEXT NOT NULL,
  "computedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extended_wind_grids_id ON extended_wind_grids(id);
