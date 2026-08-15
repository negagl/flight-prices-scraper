import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LegDetail } from "./flightSource.js";

export interface PriceRecord {
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO
  price: number;
  currency: string;
  outbound: LegDetail;
  inbound?: LegDetail;
}

const HISTORY_PATH = path.resolve(process.cwd(), "data", "history.json");

export async function loadHistory(): Promise<PriceRecord[]> {
  try {
    const raw = await readFile(HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as PriceRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function appendRecord(record: PriceRecord): Promise<PriceRecord[]> {
  const history = await loadHistory();
  history.push(record);
  history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
  return history;
}
