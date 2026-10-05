import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { withCacheLock } from './cache-lock';

// Day-by-day usage state that has to survive between status line renders and
// across Claude Code sessions. Modeled on terminal-width-cache.ts: one JSON
// file, a best-effort lock around each read-modify-write, atomic writes, and
// injected dependencies so tests never touch the real home directory.

const STATE_VERSION = 1 as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Month-to-date extra usage spend (cents) at the start of a UTC day, and the latest value seen. */
export interface SpendDayRecord {
    day: string;
    baselineUsed: number;
    lastSeenDay: string;
    lastSeenUsed: number;
}

export interface DailyState {
    version: typeof STATE_VERSION;
    /** Keyed by the login's token fingerprint, so accounts never mix. */
    spend: Record<string, SpendDayRecord>;
}

export interface DailyStateDeps {
    readFileSync: (path: string) => string;
    writeFileSync: (path: string, data: string) => void;
    renameSync: (from: string, to: string) => void;
    mkdirSync: (path: string) => void;
    now: () => number;
    statePath: string;
}

const defaultDeps: DailyStateDeps = {
    readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
    writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, 'utf-8'); },
    renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
    mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
    now: () => Date.now(),
    statePath: path.join(os.homedir(), '.cache', 'ccstatusline', 'daily.json')
};

/** The UTC calendar day of a timestamp, as `YYYY-MM-DD`. */
export function utcDayKey(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
}

/** The UTC calendar day before the one containing a timestamp. */
export function previousUtcDayKey(nowMs: number): string {
    return utcDayKey(nowMs - DAY_MS);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isSpendDayRecord(value: unknown): value is SpendDayRecord {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    return typeof entry.day === 'string'
        && isFiniteNumber(entry.baselineUsed)
        && typeof entry.lastSeenDay === 'string'
        && isFiniteNumber(entry.lastSeenUsed);
}

function emptyState(): DailyState {
    return { version: STATE_VERSION, spend: {} };
}

/** Reads the state file. A missing or corrupt file, or an invalid record, reads as absent; never throws. */
export function readDailyState(deps: DailyStateDeps = defaultDeps): DailyState {
    try {
        const parsed = JSON.parse(deps.readFileSync(deps.statePath)) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return emptyState();
        }

        const data = parsed as { version?: unknown; spend?: unknown };
        if (data.version !== STATE_VERSION || typeof data.spend !== 'object' || data.spend === null) {
            return emptyState();
        }

        const spend: Record<string, SpendDayRecord> = {};
        for (const [key, value] of Object.entries(data.spend)) {
            if (isSpendDayRecord(value)) {
                spend[key] = value;
            }
        }

        return { version: STATE_VERSION, spend };
    } catch {
        return emptyState();
    }
}

// Only today and yesterday are ever needed: a day's starting point comes from
// the previous day at most.
function prune(state: DailyState, nowMs: number): DailyState {
    const oldestKept = previousUtcDayKey(nowMs);
    const spend = Object.fromEntries(
        Object.entries(state.spend).filter(([, entry]) => entry.lastSeenDay >= oldestKept)
    );
    return { ...state, spend };
}

/**
 * Applies `update` to the current state under the cache lock and writes the
 * result atomically; `null` from `update` means nothing changed and nothing is
 * written. Returns false when another writer held the lock and `update` never
 * ran. Best-effort: never throws.
 */
export function updateDailyState(
    update: (state: DailyState) => DailyState | null,
    deps: DailyStateDeps = defaultDeps
): boolean {
    let ran = false;
    try {
        // The lock file lives next to the state file, so the directory has to
        // exist before the lock can be taken on the very first write.
        deps.mkdirSync(path.dirname(deps.statePath));

        withCacheLock(deps.statePath, () => {
            ran = true;
            const next = update(readDailyState(deps));
            if (next === null) {
                return;
            }

            const tempPath = `${deps.statePath}.${process.pid}.tmp`;
            deps.writeFileSync(tempPath, JSON.stringify(prune(next, deps.now())));
            deps.renameSync(tempPath, deps.statePath);
        });
    } catch {
        // Best-effort state; the status line must render regardless.
    }
    return ran;
}
