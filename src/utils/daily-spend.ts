import type {
    DailyStateDeps,
    SpendDayRecord
} from './daily-state';
import {
    previousUtcDayKey,
    readDailyState,
    updateDailyState,
    utcDayKey
} from './daily-state';

// The usage API only reports extra usage spent month to date, so today's spend
// is that total minus where it stood when the UTC day began. ccstatusline only
// sees the total while Claude Code is running, so the start of the day is
// estimated from what it did see:
//   - the last value seen during the previous UTC day, which is at most the
//     total at midnight;
//   - zero on the 1st of the month, which is exact: extra usage resets at
//     00:00 UTC on the 1st;
//   - otherwise the first value seen today, which misses any spend before it.

/**
 * Folds one observation of the month-to-date total (cents) into a login's
 * record. `fetchedAtMs` is when the usage API returned the total, not when it
 * was rendered: the usage cache replays a fetch for up to three minutes and
 * serves a stale one while the API is unreachable, and a total fetched before
 * midnight belongs to the day before.
 */
export function advanceSpendRecord(record: SpendDayRecord | undefined, used: number, fetchedAtMs: number): SpendDayRecord {
    // Concurrent renders can replay an older fetch after a newer one was
    // recorded; it must not move the record back.
    if (record && fetchedAtMs < record.lastSeenAt) {
        return record;
    }

    const day = utcDayKey(fetchedAtMs);
    const seen = { lastSeenDay: day, lastSeenUsed: used, lastSeenAt: fetchedAtMs };
    if (record?.day === day) {
        // A total that drops mid-day (a refund, an admin reset) moves the
        // starting point down with it, so today's spend never goes negative.
        return { ...record, ...seen, baselineUsed: Math.min(record.baselineUsed, used) };
    }

    let baselineUsed = used;
    const seenDayBeforeThisMonth = record?.lastSeenDay === previousUtcDayKey(fetchedAtMs)
        && record.lastSeenDay.slice(0, 7) === day.slice(0, 7);
    if (seenDayBeforeThisMonth) {
        baselineUsed = Math.min(record.lastSeenUsed, used);
    } else if (day.endsWith('-01')) {
        baselineUsed = 0;
    }

    return { day, baselineUsed, ...seen };
}

/** Extra usage spent today (cents), or undefined when the record isn't today's. */
export function getSpentToday(record: SpendDayRecord | undefined, nowMs: number): number | undefined {
    if (record?.day !== utcDayKey(nowMs)) {
        return undefined;
    }
    return Math.max(0, record.lastSeenUsed - record.baselineUsed);
}

function isSameRecord(a: SpendDayRecord, b: SpendDayRecord): boolean {
    return a.day === b.day
        && a.baselineUsed === b.baselineUsed
        && a.lastSeenDay === b.lastSeenDay
        && a.lastSeenUsed === b.lastSeenUsed
        && a.lastSeenAt === b.lastSeenAt;
}

/**
 * Records the month-to-date total (cents) a login's usage fetch returned at
 * `fetchedAtMs`, and returns the extra usage spent today, or undefined until a
 * total fetched today has been seen. When another ccstatusline process holds
 * the state lock, this observation isn't stored, but today's spend is still
 * worked out from it.
 */
export function observeExtraUsageSpend(accountKey: string, used: number, fetchedAtMs: number, deps?: DailyStateDeps): number | undefined {
    const nowMs = deps ? deps.now() : Date.now();
    const result: { record?: SpendDayRecord } = {};

    const ran = updateDailyState((state) => {
        const current = state.spend[accountKey];
        const next = advanceSpendRecord(current, used, fetchedAtMs);
        result.record = next;
        if (current && isSameRecord(current, next)) {
            return null;
        }
        return { ...state, spend: { ...state.spend, [accountKey]: next } };
    }, deps);

    if (!ran || !result.record) {
        result.record = advanceSpendRecord(readDailyState(deps).spend[accountKey], used, fetchedAtMs);
    }
    return getSpentToday(result.record, nowMs);
}
