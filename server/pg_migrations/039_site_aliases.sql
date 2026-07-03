-- Migration 039: Add aliases column to sites and seed known site aliases
--
-- aliases: semicolon-separated list of alternative names, common misspellings,
-- and short-forms used by pilots. Consumed by server/utils/siteResolver.ts to
-- perform exact and fuzzy name resolution in the AI Smart Search assistant.
--
-- Seeds only overwrite when the column is currently empty (idempotent).

ALTER TABLE sites ADD COLUMN IF NOT EXISTS aliases TEXT NOT NULL DEFAULT '';

UPDATE sites SET aliases = 'Flowerdale;3 Sisters;Three Sisters;Fowlerdale'
  WHERE id = 'three-sisters-flowerdale'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Thirteenth Beach;13th Beach;Barwen Heads;Thurteenth'
  WHERE id = 'barwon-heads-13th-beach'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Southside;Bels Beach'
  WHERE id = 'bells-beach'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Winkipop;Winki Pop'
  WHERE id = 'bells-beach-winkipop'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Monument;The Monument;Flindas Monument'
  WHERE id = 'flinders-monument'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Spion;Spion Kop;Fairhaven;Moggs Creek;Aireys Inlet'
  WHERE id = 'spion-kop-fairhaven-aireys-moggs'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Ben Neavis'
  WHERE id = 'ben-nevis'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Reeds Lookout;Reed''s Lookout;Mt Buffelo;Mt Buffalo Reeds Lookout'
  WHERE id = 'mt-buffalo-reed-s-lookout-paraglider-launch'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Landscape;Ex Landscape'
  WHERE id = 'great-missenden'
    AND (aliases IS NULL OR aliases = '');

UPDATE sites SET aliases = 'Thistle Hill;Mt Broughton;Mount Broughton'
  WHERE id = 'mt-broughton-thistle-hill'
    AND (aliases IS NULL OR aliases = '');
