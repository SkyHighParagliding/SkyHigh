const DB_NAME = "skyhigh-flights";
const DB_VERSION = 1;

export interface Breadcrumb {
  timestamp: number;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
}

export interface LocalFlight {
  id: string;
  serverId?: string;
  pilotId?: string;
  sessionToken?: string;
  siteId?: string;
  siteName?: string;
  startedAt: number;
  endedAt?: number;
  status: "recording" | "completed";
  lastSyncedTimestamp: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("flights")) {
        db.createObjectStore("flights", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("breadcrumbs")) {
        const store = db.createObjectStore("breadcrumbs", { keyPath: ["flightId", "timestamp"] });
        store.createIndex("byFlight", "flightId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFlight(flight: LocalFlight): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("flights", "readwrite");
    tx.objectStore("flights").put(flight);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getFlight(id: string): Promise<LocalFlight | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("flights", "readonly");
    const req = tx.objectStore("flights").get(id);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getAllFlights(): Promise<LocalFlight[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("flights", "readonly");
    const req = tx.objectStore("flights").getAll();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function saveBreadcrumb(flightId: string, crumb: Breadcrumb): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("breadcrumbs", "readwrite");
    tx.objectStore("breadcrumbs").put({ ...crumb, flightId });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveBreadcrumbs(flightId: string, crumbs: Breadcrumb[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("breadcrumbs", "readwrite");
    const store = tx.objectStore("breadcrumbs");
    for (const c of crumbs) {
      store.put({ ...c, flightId });
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getFlightBreadcrumbs(flightId: string): Promise<Breadcrumb[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("breadcrumbs", "readonly");
    const index = tx.objectStore("breadcrumbs").index("byFlight");
    const req = index.getAll(flightId);
    req.onsuccess = () => {
      db.close();
      const crumbs = (req.result || []).sort((a: any, b: any) => a.timestamp - b.timestamp);
      resolve(crumbs);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getUnsyncedBreadcrumbs(flightId: string, lastSyncedTimestamp: number): Promise<Breadcrumb[]> {
  const all = await getFlightBreadcrumbs(flightId);
  return all.filter((c) => c.timestamp > lastSyncedTimestamp);
}

export async function deleteOldFlights(maxAgeHours: number): Promise<void> {
  const flights = await getAllFlights();
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const db = await openDb();
  const tx = db.transaction(["flights", "breadcrumbs"], "readwrite");
  for (const f of flights) {
    if (f.startedAt < cutoff && f.status === "completed") {
      tx.objectStore("flights").delete(f.id);
      const index = tx.objectStore("breadcrumbs").index("byFlight");
      const req = index.getAllKeys(f.id);
      req.onsuccess = () => {
        for (const key of req.result) {
          tx.objectStore("breadcrumbs").delete(key);
        }
      };
    }
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
