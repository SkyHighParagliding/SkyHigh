CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_checkins_site ON checkins(siteId);
CREATE INDEX IF NOT EXISTS idx_weather_obs_site ON weather_observations(siteId);
CREATE INDEX IF NOT EXISTS idx_weather_forecast_site ON weather_forecasts(siteId);
CREATE INDEX IF NOT EXISTS idx_image_submissions_status ON image_submissions(status);
