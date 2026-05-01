#!/bin/bash
set -e

npm install --ignore-scripts 2>/dev/null || true

if [ ! -f "sites.db" ] && [ -f "sites-seed.db" ]; then
  cp sites-seed.db sites.db
  echo "Copied sites-seed.db → sites.db (fresh environment)"
fi
