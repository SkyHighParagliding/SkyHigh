-- Migration 014: Populate site banners with random images from library
-- Assigns each site a random banner image based on its type (coastal/inland)

DO $$
DECLARE
  v_lib JSONB;
  v_coastal JSONB[];
  v_inland JSONB[];
  v_site RECORD;
  v_pool JSONB[];
  v_rand_idx INTEGER;
BEGIN
  -- Get the image library from settings
  SELECT value::JSONB INTO v_lib
  FROM settings
  WHERE key = 'imageLibrary';

  IF v_lib IS NULL THEN
    RAISE NOTICE 'No image library found in settings, skipping banner population';
    RETURN;
  END IF;

  -- Extract coastal and inland images
  v_coastal := ARRAY_AGG(elem) FILTER (WHERE elem->>'category' IS NULL OR elem->>'category' = 'coastal')
    FROM jsonb_array_elements(v_lib) AS elem;
  v_inland := ARRAY_AGG(elem) FILTER (WHERE elem->>'category' = 'inland' OR (elem->>'category' IS NULL AND elem->>'banner' IS NOT NULL))
    FROM jsonb_array_elements(v_lib) AS elem;

  RAISE NOTICE 'Found % coastal images and % inland images', array_length(v_coastal, 1), array_length(v_inland, 1);

  -- Iterate through all sites and assign random banner images
  FOR v_site IN SELECT id, name, type FROM sites LOOP
    -- Determine if site is inland or coastal
    IF LOWER(COALESCE(v_site.type, '')) ~* 'inland|mountain|ridge|tow' THEN
      v_pool := v_inland;
    ELSE
      v_pool := v_coastal;
    END IF;

    -- Skip if no images available for this category
    IF array_length(v_pool, 1) IS NULL OR array_length(v_pool, 1) = 0 THEN
      RAISE NOTICE 'No images available for %', v_site.name;
      CONTINUE;
    END IF;

    -- Pick a random image using deterministic seeding based on site ID hash
    -- (ensures consistent results across deployments while still looking random)
    v_rand_idx := (
      (abs(hashtext(v_site.id))::bigint % array_length(v_pool, 1)) + 1
    )::INTEGER;

    -- Update the site with the selected banner image
    UPDATE sites
    SET image = v_pool[v_rand_idx]->>'banner'
    WHERE id = v_site.id;
  END LOOP;

  RAISE NOTICE 'Site banner population complete';
END $$;
