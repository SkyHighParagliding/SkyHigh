-- Clear the stored weather-grid bounding box so the code constants in
-- server/grid/bounds.ts govern again.
--
-- The stored box (roughly lat -39.5..-34.95) predates both the land-clipped
-- tile builder and the W* thermal grid. Two problems came from it:
--   * buildLandTiles snaps to multiples of the 0.09 deg spacing, so latMax
--     -34.95 produced a northernmost row at -35.01 and Mildura, Swan Hill and
--     the whole Mallee have never had thermal data;
--   * latMin -39.5 stopped short of Bass Strait, leaving the TASMANIA,
--     KING_ISLAND and FLINDERS_ISLAND coverage rings as dead code.
--
-- Deleting rather than rewriting the rows: the box was never deliberately
-- chosen, and removing the override leaves one source of truth. The admin Grid
-- Bounds panel writes these keys back if an operator sets them again.
DELETE FROM settings
WHERE key IN ('gridFineLatMin', 'gridFineLatMax', 'gridFineLonMin', 'gridFineLonMax');
