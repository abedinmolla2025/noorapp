import type { DeliveryAttempt, PublicationRecord } from "./types.js";
import type { PlanHistory } from "./plan.js";

const SETTINGS_KEY = "noor_daily_content_settings";
const PUBLICATIONS_KEY = "noor_daily_content_publications";
const DELIVERIES_KEY = "noor_daily_content_deliveries";

export interface DailyContentSettings {
  enabled: boolean;
  updatedAt: string;
}

const DEFAULT_SETTINGS: DailyContentSettings = {
  enabled: false,
  updatedAt: new Date().toISOString(),
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/blocked: admin preview degrades, never crashes the page.
  }
}

/**
 * Local-only store for the admin preview (browser localStorage).
 * Production uses the `daily_content_*` tables instead — same shapes.
 * Nothing here sends, publishes or schedules anything.
 */
export const dailyContentStore = {
  getSettings(): DailyContentSettings {
    return read<DailyContentSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  },
  setEnabled(enabled: boolean): DailyContentSettings {
    const next: DailyContentSettings = {
      enabled,
      updatedAt: new Date().toISOString(),
    };
    write(SETTINGS_KEY, next);
    return next;
  },
  getPublications(): PublicationRecord[] {
    return read<PublicationRecord[]>(PUBLICATIONS_KEY, []);
  },
  savePublication(rec: PublicationRecord): void {
    const all = read<PublicationRecord[]>(PUBLICATIONS_KEY, []);
    const rest = all.filter((r) => r.kolkataDate !== rec.kolkataDate);
    write(PUBLICATIONS_KEY, [rec, ...rest].slice(0, 90));
  },
  getDeliveries(): DeliveryAttempt[] {
    return read<DeliveryAttempt[]>(DELIVERIES_KEY, []);
  },
  saveDeliveries(rows: DeliveryAttempt[]): void {
    write(DELIVERIES_KEY, rows.slice(0, 500));
  },
  /** Rebuild planner history from saved publications (current cycles only). */
  getHistory(): PlanHistory {
    const pubs = this.getPublications();
    const hadithUsedRefs = pubs
      .filter((p) => p.status !== "failed")
      .map((p) => p.hadithRef)
      .filter((r): r is string => !!r);
    const cardUsedRefs = pubs
      .filter((p) => p.status !== "failed")
      .flatMap((p) => p.cards.map((c) => c.recordRef));
    return {
      hadithUsedRefs,
      hadithCycle: 1,
      cardUsedRefs,
      cardCycle: 1,
    };
  },
};
