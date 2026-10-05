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

/** Folds one observation of the month-to-date total (cents) into a login's record. */
export function advanceSpendRecord(record: SpendDayRecord | undefined, used: number, nowMs: number): SpendDayRecord {
    const today = utcDayKey(nowMs);
    if (record?.day === today) {
        // A total that drops mid-day (a refund, an admin reset) moves the
        // starting point down with it, so today's spend never goes negative.
        return { ...record, baselineUsed: Math.min(record.baselineUsed, used), lastSeenDay: today, lastSeenUsed: used };
    }

    let baselineUsed = used;
    const seenYesterdayThisMonth = record?.lastSeenDay === previousUtcDayKey(nowMs)
        && record.lastSeenDay.slice(0, 7) === today.slice(0, 7);
    if (seenYesterdayThisMonth) {
        baselineUsed = Math.min(record.lastSeenUsed, used);
    } else if (today.endsWith('-01')) {
        baselineUsed = 0;
    }

    return { day: today, baselineUsed, lastSeenDay: today, lastSeenUsed: used };
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
        && a.lastSeenUsed === b.lastSeenUsed;
}

/**
 * Records the month-to-date total (cents) seen for a login and returns the
 * extra usage spent today. When another ccstatusline process holds the state
 * lock, this observation isn't stored, but today's spend is still worked out
 * from it.
 */
export function observeExtraUsageSpend(accountKey: string, used: number, deps?: DailyStateDeps): number | undefined {
    const nowMs = deps ? deps.now() : Date.now();
    const result: { record?: SpendDayRecord } = {};

    const ran = updateDailyState((state) => {
        const current = state.spend[accountKey];
        const next = advanceSpendRecord(current, used, nowMs);
        result.record = next;
        if (current && isSameRecord(current, next)) {
            return null;
        }
        return { ...state, spend: { ...state.spend, [accountKey]: next } };
    }, deps);

    if (!ran || !result.record) {
        result.record = advanceSpendRecord(readDailyState(deps).spend[accountKey], used, nowMs);
    }
    return getSpentToday(result.record, nowMs);
}
