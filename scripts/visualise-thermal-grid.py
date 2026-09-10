"""
Visualise thermal grid: current layout vs 4-column optimised layout.
Run with: uv run scripts/visualise-thermal-grid.py
"""
import os
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.colors as mcolors
import numpy as np

FINE_LAT_MIN = -39.5
FINE_LAT_MAX = -33.5
FINE_LON_MIN = 140.0
FINE_LON_MAX = 151.0
THERMAL_DELTA = 0.09
THERMAL_MAX_PER_TILE = 300

vic_lon = [
    140.96, 141.0,  141.5,  142.0,  142.2,  142.5,  143.0,  143.5,
    144.0,  144.5,  144.75, 145.0,  145.5,  146.0,  146.4,  146.9,
    147.3,  147.8,  148.2,  148.6,  149.0,  149.4,  149.97,
    149.97, 149.8,  149.5,  149.2,  149.0,
    148.5,  148.0,  147.5,  147.0,  146.8,
    146.4,
    146.0,  145.5,  145.2,  145.0,
    144.85, 144.68, 144.55,
    144.38, 144.25, 144.10,
    143.8,  143.5,  143.0,  142.5,  142.0,  141.5,  141.0,  140.96,
    140.96,
]
vic_lat = [
    -34.00, -34.00, -34.02, -34.18, -34.25, -34.50, -35.38, -35.62,
    -36.05, -36.12, -36.13, -36.03, -36.05, -36.02, -36.00, -36.07,
    -35.98, -36.10, -36.52, -37.00, -37.30, -37.50, -37.55,
    -37.75, -37.95, -38.10, -38.20, -38.30,
    -38.40, -38.35, -38.55, -38.65, -38.75,
    -39.13,
    -38.85, -38.60, -38.50, -38.43,
    -38.50, -38.35, -38.15,
    -38.20, -38.13, -38.43,
    -38.68, -38.70, -38.58, -38.42, -38.17, -38.10, -38.05, -38.05,
    -34.00,
]

def point_in_polygon(px, py, poly_x, poly_y):
    n = len(poly_x)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly_x[i], poly_y[i]
        xj, yj = poly_x[j], poly_y[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

# Current layout
all_lats = np.round(np.arange(FINE_LAT_MIN, FINE_LAT_MAX + THERMAL_DELTA * 0.5, THERMAL_DELTA), 4)
all_lons = np.round(np.arange(FINE_LON_MIN, FINE_LON_MAX + THERMAL_DELTA * 0.5, THERMAL_DELTA), 4)
current_points = [(lon, lat) for lat in all_lats for lon in all_lons]
current_tiles = [current_points[i:i+THERMAL_MAX_PER_TILE] for i in range(0, len(current_points), THERMAL_MAX_PER_TILE)]
print(f"CURRENT:    {len(current_points):,} points  {len(current_tiles)} tiles")

# Optimised: 4 lon columns, each with tight lat bounds derived from Victoria polygon
BUFFER = 0.2
NUM_COLS = 4
col_width = (FINE_LON_MAX - FINE_LON_MIN) / NUM_COLS

columns = []
for c in range(NUM_COLS):
    col_lon_min = FINE_LON_MIN + c * col_width
    col_lon_max = FINE_LON_MIN + (c + 1) * col_width

    vic_lats_in_col = [lat for lon, lat in zip(vic_lon, vic_lat)
                       if col_lon_min - BUFFER <= lon <= col_lon_max + BUFFER]
    if not vic_lats_in_col:
        continue

    lat_min = round(max(FINE_LAT_MIN, min(vic_lats_in_col) - BUFFER), 2)
    lat_max = round(min(FINE_LAT_MAX, max(vic_lats_in_col) + BUFFER), 2)

    col_lats = np.round(np.arange(lat_min, lat_max + THERMAL_DELTA * 0.5, THERMAL_DELTA), 4)
    col_lons = np.round(np.arange(col_lon_min, col_lon_max + THERMAL_DELTA * 0.5, THERMAL_DELTA), 4)
    pts = [(lon, lat) for lat in col_lats for lon in col_lons]
    tiles = [pts[i:i+THERMAL_MAX_PER_TILE] for i in range(0, len(pts), THERMAL_MAX_PER_TILE)]

    columns.append({'id': c+1, 'lon_min': col_lon_min, 'lon_max': col_lon_max,
                    'lat_min': lat_min, 'lat_max': lat_max, 'points': pts, 'tiles': tiles})
    print(f"  Col {c+1} ({col_lon_min:.1f}-{col_lon_max:.1f}E):  "
          f"lat {lat_min} to {lat_max}  = {len(pts):,} pts / {len(tiles)} tiles")

opt_tiles  = sum(len(col['tiles'])  for col in columns)
opt_points = sum(len(col['points']) for col in columns)
saving_pct = (1 - opt_tiles / len(current_tiles)) * 100
print(f"OPTIMISED:  {opt_points:,} points  {opt_tiles} tiles  ({saving_pct:.0f}% fewer tiles)")

# Classify current tiles by % inside Victoria
def tile_vic_pct(tile):
    inside = sum(1 for lon, lat in tile if point_in_polygon(lon, lat, vic_lon, vic_lat))
    return inside / len(tile)

print("Classifying current tiles...")
current_tile_pcts = [tile_vic_pct(t) for t in current_tiles]

# Plot: two side-by-side panels
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(20, 9))
fig.patch.set_facecolor('#1a2332')

cmap = plt.cm.RdYlGn

def draw_vic(ax):
    poly = plt.Polygon(list(zip(vic_lon, vic_lat)), closed=True,
                       fill=False, edgecolor='#f5c518', linewidth=2.0, zorder=10)
    ax.add_patch(poly)

def setup_ax(ax, title):
    ax.set_facecolor('#1a2332')
    ax.set_xlim(FINE_LON_MIN - 0.3, FINE_LON_MAX + 0.3)
    ax.set_ylim(FINE_LAT_MIN - 0.3, FINE_LAT_MAX + 0.3)
    ax.set_aspect('equal')
    ax.set_title(title, color='white', fontsize=10, pad=8)
    ax.set_xlabel('Longitude', color='#aaaaaa', fontsize=8)
    ax.set_ylabel('Latitude',  color='#aaaaaa', fontsize=8)
    ax.tick_params(colors='#aaaaaa', labelsize=7)
    for spine in ax.spines.values():
        spine.set_edgecolor('#444444')

# Left panel: current tiles
setup_ax(ax1, f'CURRENT: {len(current_tiles)} tiles  (full bounding box, horizontal bands)')
for idx, (tile, pct) in enumerate(zip(current_tiles, current_tile_pcts)):
    lons_t = [p[0] for p in tile]
    lats_t = [p[1] for p in tile]
    color = cmap(pct)
    rect = mpatches.FancyBboxPatch(
        (min(lons_t) - THERMAL_DELTA/2, min(lats_t) - THERMAL_DELTA/2),
        (max(lons_t) - min(lons_t)) + THERMAL_DELTA,
        (max(lats_t) - min(lats_t)) + THERMAL_DELTA,
        boxstyle="square,pad=0", linewidth=0.5,
        edgecolor='white', facecolor=(*color[:3], 0.35), zorder=2)
    ax1.add_patch(rect)
    cx = (min(lons_t) + max(lons_t)) / 2
    cy = (min(lats_t) + max(lats_t)) / 2
    ax1.text(cx, cy, str(idx+1), color='white', fontsize=5, ha='center', va='center',
             fontweight='bold', zorder=5,
             bbox=dict(boxstyle='round,pad=0.1', facecolor='#00000066', edgecolor='none'))
draw_vic(ax1)

# Right panel: optimised 4-column tiles
col_colors = ['#4488ff', '#ff8844', '#44cc88', '#cc44ff']
setup_ax(ax2, f'OPTIMISED: {opt_tiles} tiles  (4 columns, lat-clipped per column)  '
              f'— {saving_pct:.0f}% fewer')

tile_num = 1
for col in columns:
    col_color = col_colors[col['id'] - 1]
    # Column bounding box outline
    col_rect = mpatches.FancyBboxPatch(
        (col['lon_min'], col['lat_min']),
        col['lon_max'] - col['lon_min'],
        col['lat_max'] - col['lat_min'],
        boxstyle="square,pad=0", linewidth=1.5,
        edgecolor=col_color, facecolor='none', linestyle='--', zorder=3)
    ax2.add_patch(col_rect)

    for tile in col['tiles']:
        lons_t = [p[0] for p in tile]
        lats_t = [p[1] for p in tile]
        pct = tile_vic_pct(tile)
        color = cmap(pct)
        rect = mpatches.FancyBboxPatch(
            (min(lons_t) - THERMAL_DELTA/2, min(lats_t) - THERMAL_DELTA/2),
            (max(lons_t) - min(lons_t)) + THERMAL_DELTA,
            (max(lats_t) - min(lats_t)) + THERMAL_DELTA,
            boxstyle="square,pad=0", linewidth=0.5,
            edgecolor=col_color, facecolor=(*color[:3], 0.35), zorder=2)
        ax2.add_patch(rect)
        cx = (min(lons_t) + max(lons_t)) / 2
        cy = (min(lats_t) + max(lats_t)) / 2
        ax2.text(cx, cy, str(tile_num), color='white', fontsize=5, ha='center', va='center',
                 fontweight='bold', zorder=5,
                 bbox=dict(boxstyle='round,pad=0.1', facecolor='#00000066', edgecolor='none'))
        tile_num += 1

    ax2.text(col['lon_min'] + (col['lon_max']-col['lon_min'])/2,
             col['lat_max'] + 0.15, f"Col {col['id']}\n({len(col['tiles'])} tiles)",
             color=col_color, fontsize=7, ha='center', va='bottom', zorder=6)

draw_vic(ax2)

# Shared legend
legend_patches = [
    mpatches.Patch(facecolor=cmap(1.0), alpha=0.6, label='Mostly inside Victoria'),
    mpatches.Patch(facecolor=cmap(0.5), alpha=0.6, label='Mixed (border tile)'),
    mpatches.Patch(facecolor=cmap(0.0), alpha=0.6, label='Mostly outside (wasted)'),
    mpatches.Patch(facecolor='none', edgecolor='#f5c518', linewidth=2, label='Victoria boundary'),
]
fig.legend(handles=legend_patches, loc='lower center', ncol=4, fontsize=8,
           framealpha=0.3, facecolor='#1a2332', labelcolor='white', bbox_to_anchor=(0.5, 0.01))

plt.tight_layout(rect=[0, 0.06, 1, 1])
output = r'C:\Users\User\thermal-grid-coverage.png'
plt.savefig(output, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
print(f"\nSaved: {output}")
plt.close()
