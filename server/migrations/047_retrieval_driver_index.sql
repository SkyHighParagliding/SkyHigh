CREATE INDEX IF NOT EXISTS idx_retrievals_driver_status ON retrievals(driverId, status, createdAt);
