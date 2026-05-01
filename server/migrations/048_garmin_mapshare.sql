ALTER TABLE pilots ADD COLUMN garminMapshare TEXT DEFAULT NULL;
ALTER TABLE retrievals ADD COLUMN positionSource TEXT DEFAULT 'phone';
