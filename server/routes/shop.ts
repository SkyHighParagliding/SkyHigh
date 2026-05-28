import { Router } from "express";
import { queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";
import { tidyhqFetch } from "../utils/tidyhqFetch.js";

const log = createLogger("shop");
const router = Router();

interface MappedProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  images: string[];
  stockStatus: string;
  quantity: number | null;
  slug: string;
  shopUrl: string;
  category: string;
}

let cachedProducts: MappedProduct[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

function mapProduct(p: any): MappedProduct {
  return {
    id: p.id,
    name: p.name || "",
    description: p.description || "",
    price: p.sell_price || p.price || "0.00",
    currency: p.sell_price_currency || p.currency || "AUD",
    images: Array.isArray(p.images) ? p.images.map((img: any) => img.url || img) : (p.image ? [p.image] : []),
    stockStatus: p.quantity != null ? (p.quantity > 0 ? "in_stock" : "out_of_stock") : "available",
    quantity: p.quantity ?? null,
    slug: p.slug || p.id,
    shopUrl: `https://skyhigh.tidyhq.com/public/shop/products/${p.slug || p.id}`,
    category: p.category?.name || "",
  };
}

interface SettingsRow {
  value: string;
}

async function getHiddenProductIds(): Promise<string[]> {
  const row = await queryOne<SettingsRow>("SELECT value FROM settings WHERE key = 'hiddenShopProducts'");
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchTidyHQProducts(): Promise<MappedProduct[]> {
  const now = Date.now();
  if (cachedProducts && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedProducts;
  }

  let response: Response | null = null;
  if (process.env.TIDYHQ_ACCESS_TOKEN) {
    try {
      response = await tidyhqFetch("/shop/products");
      if (!response.ok) {
        log.warn(`Authenticated shop API returned ${response.status}, trying public endpoint`);
        response = null;
      }
    } catch {
      response = null;
    }
  }

  if (!response) {
    response = await fetch("https://skyhigh.tidyhq.com/api/v1/shop/products");
    if (!response.ok) {
      throw new Error(`TidyHQ Shop API responded with status: ${response.status}`);
    }
  }
  const data = await response.json();
  const raw = Array.isArray(data) ? data : [];
  cachedProducts = raw.map(mapProduct);
  cacheTimestamp = now;
  return cachedProducts;
}

fetchTidyHQProducts().catch(e => log.warn("Initial shop products fetch failed", e?.message));

interface AdminSessionRow {
  token: string;
}

async function isAdminRequest(req: any): Promise<boolean> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return false;
  const session = await queryOne<AdminSessionRow>(`
    SELECT admin_sessions.token FROM admin_sessions
    JOIN contacts ON admin_sessions."userId" = contacts.id
    WHERE admin_sessions.token = $1 AND contacts."isAdmin" = 1
  `, [token]);
  return !!session;
}

router.get("/products", asyncHandler(async (req, res) => {
  const isAdmin = req.query.showAll === "true" && await isAdminRequest(req);

  try {
    const products = await fetchTidyHQProducts();
    const hidden = await getHiddenProductIds();
    if (isAdmin) {
      res.json(products.map(p => ({ ...p, hidden: hidden.includes(String(p.id)) })));
    } else {
      res.json(products.filter(p => !hidden.includes(String(p.id))));
    }
  } catch (e: any) {
    log.error("Failed to fetch shop products from TidyHQ", e?.message);
    if (cachedProducts) {
      const hidden = await getHiddenProductIds();
      if (isAdmin) {
        res.json(cachedProducts.map(p => ({ ...p, hidden: hidden.includes(String(p.id)) })));
      } else {
        res.json(cachedProducts.filter(p => !hidden.includes(String(p.id))));
      }
    } else {
      res.status(500).json({ error: "Failed to fetch shop products" });
    }
  }
}));

router.put("/products/:id/visibility", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { hidden } = req.body;
  if (typeof hidden !== "boolean") {
    return res.status(400).json({ error: "hidden must be a boolean" });
  }

  const hiddenIds = await getHiddenProductIds();
  const idStr = String(id);

  let updated: string[];
  if (hidden) {
    updated = hiddenIds.includes(idStr) ? hiddenIds : [...hiddenIds, idStr];
  } else {
    updated = hiddenIds.filter(h => h !== idStr);
  }

  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    ["hiddenShopProducts", JSON.stringify(updated)]
  );

  res.json({ success: true, hiddenProductIds: updated });
}));

export default router;
