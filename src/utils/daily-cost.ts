import type {
    DailyStateDeps,
    SessionDayRecord
} from './daily-state';
import {
    previousUtcDayKey,
    readDailyState,
    updateDailyState,
    utcDayKey
} from './daily-state';

// Claude Code reports each session's cost and time as running totals, so
// today's share of a session is its current totals minus where they stood when
// the UTC day began. A session that started today began at zero; an overnight
// session starts from the last totals seen yesterday, or, when it wasn't seen
// yesterday, from the first totals seen today.

/** One session's running totals from the status payload. */
export interface SessionSample {
    cost: number;
    apiMs: number;
    durationMs: number;
}

/** Today's totals across a Claude Code profile's sessions. */
export interface DailyCostTotals {
    claudeCodeCost: number;
    /** Time Claude spent working; parallel sessions add up. */
    activeMs: number;
    /** Wall-clock time any session was running, counted once. */
    clockMs: number;
}

// Totals unchanged for less than this aren't written again, so idle renders
// don't rewrite the file while clock time still stays current.
const REFRESH_UNCHANGED_MS = 60 * 1000;

function utcMidnight(nowMs: number): number {
    const now = new Date(nowMs);
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Folds one status payload's totals into a session's record. */
export function advanceSessionRecord(record: SessionDayRecord | undefined, sample: SessionSample, nowMs: number): SessionDayRecord {
    const today = utcDayKey(nowMs);
    const startedAt = nowMs - sample.durationMs;
    const seen = { lastSeenDay: today, lastSeenAt: nowMs, startedAt, cost: sample.cost, apiMs: sample.apiMs };

    if (record?.lastSeenDay === today) {
        return {
            ...seen,
            dayStartCost: Math.min(record.dayStartCost, sample.cost),
            dayStartApiMs: Math.min(record.dayStartApiMs, sample.apiMs)
        };
    }
    if (startedAt >= utcMidnight(nowMs)) {
        return { ...seen, dayStartCost: 0, dayStartApiMs: 0 };
    }
    if (record?.lastSeenDay === previousUtcDayKey(nowMs)) {
        return {
            ...seen,
            dayStartCost: Math.min(record.cost, sample.cost),
            dayStartApiMs: Math.min(record.apiMs, sample.apiMs)
        };
    }
    return { ...seen, dayStartCost: sample.cost, dayStartApiMs: sample.apiMs };
}

function unionLength(intervals: [number, number][]): number {
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    let total = 0;
    let currentStart: number | null = null;
    let currentEnd = 0;

    for (const [start, end] of sorted) {
        if (currentStart === null || start > currentEnd) {
            if (currentStart !== null) {
                total += currentEnd - currentStart;
            }
            currentStart = start;
            currentEnd = end;
        } else {
            currentEnd = Math.max(currentEnd, end);
        }
    }
    if (currentStart !== null) {
        total += currentEnd - currentStart;
    }
    return total;
}

/** Today's totals across the sessions seen today. */
export function computeDailyTotals(sessions: Record<string, SessionDayRecord>, nowMs: number): DailyCostTotals {
    const today = utcDayKey(nowMs);
    const midnight = utcMidnight(nowMs);
    let claudeCodeCost = 0;
    let activeMs = 0;
    const intervals: [number, number][] = [];

    for (const record of Object.values(sessions)) {
        if (record.lastSeenDay !== today) {
            continue;
        }

        claudeCodeCost += Math.max(0, record.cost - record.dayStartCost);
        activeMs += Math.max(0, record.apiMs - record.dayStartApiMs);
        const start = Math.max(record.startedAt, midnight);
        if (record.lastSeenAt > start) {
            intervals.push([start, record.lastSeenAt]);
        }
    }

    return { claudeCodeCost, activeMs, clockMs: unionLength(intervals) };
}

function isUnchanged(current: SessionDayRecord, next: SessionDayRecord): boolean {
    return current.lastSeenDay === next.lastSeenDay
        && current.cost === next.cost
        && current.apiMs === next.apiMs
        && next.lastSeenAt - current.lastSeenAt < REFRESH_UNCHANGED_MS;
}

/**
 * Records a session's totals under its Claude Code profile and returns today's
 * totals across that profile's sessions. When another ccstatusline process
 * holds the state lock, this sample isn't stored, but it still counts.
 */
export function observeSessionCost(profileKey: string, sessionId: string, sample: SessionSample, deps?: DailyStateDeps): DailyCostTotals {
    const nowMs = deps ? deps.now() : Date.now();
    const result: { sessions?: Record<string, SessionDayRecord> } = {};

    const ran = updateDailyState((state) => {
        const profile = state.sessions[profileKey] ?? {};
        const current = profile[sessionId];
        const next = advanceSessionRecord(current, sample, nowMs);
        const sessions = { ...profile, [sessionId]: next };
        result.sessions = sessions;
        if (current && isUnchanged(current, next)) {
            return null;
        }
        return { ...state, sessions: { ...state.sessions, [profileKey]: sessions } };
    }, deps);

    if (!ran || !result.sessions) {
        const profile = readDailyState(deps).sessions[profileKey] ?? {};
        result.sessions = { ...profile, [sessionId]: advanceSessionRecord(profile[sessionId], sample, nowMs) };
    }
    return computeDailyTotals(result.sessions, nowMs);
}
