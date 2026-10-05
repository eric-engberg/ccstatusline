import * as fs from 'fs';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    advanceSpendRecord,
    getSpentToday,
    observeExtraUsageSpend
} from '../daily-spend';
import type {
    DailyStateDeps,
    SpendDayRecord
} from '../daily-state';
import { readDailyState } from '../daily-state';

const STATE_PATH = `/tmp/test-daily-spend-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
const LOCK_PATH = `${STATE_PATH}.lock`;

// Monday 5 October 2026, 15:00 UTC.
const NOW = Date.parse('2026-10-05T15:00:00Z');

function makeDeps(initial: object | null, now = NOW): DailyStateDeps & { writes: number } {
    const files = new Map<string, string>();
    if (initial !== null) {
        files.set(STATE_PATH, JSON.stringify(initial));
    }

    const deps = {
        writes: 0,
        statePath: STATE_PATH,
        now: () => now,
        mkdirSync: () => undefined,
        readFileSync: (p: string) => {
            const content = files.get(p);
            if (content === undefined) {
                throw new Error('ENOENT');
            }
            return content;
        },
        writeFileSync: (p: string, data: string) => {
            deps.writes += 1;
            files.set(p, data);
        },
        renameSync: (from: string, to: string) => {
            const data = files.get(from);
            if (data === undefined) {
                throw new Error('ENOENT');
            }
            files.set(to, data);
            files.delete(from);
        }
    };
    return deps;
}

function seen(day: string, baselineUsed: number, lastSeenUsed: number): SpendDayRecord {
    return { day, baselineUsed, lastSeenDay: day, lastSeenUsed };
}

describe('advanceSpendRecord', () => {
    it('starts today at the first value seen when there is no earlier record', () => {
        const record = advanceSpendRecord(undefined, 12345, NOW);

        expect(record).toEqual(seen('2026-10-05', 12345, 12345));
        expect(getSpentToday(record, NOW)).toBe(0);
    });

    it('starts today at the last value seen yesterday', () => {
        const record = advanceSpendRecord(seen('2026-10-04', 5000, 9000), 12345, NOW);

        expect(record).toEqual(seen('2026-10-05', 9000, 12345));
        expect(getSpentToday(record, NOW)).toBe(3345);
    });

    it('falls back to the first value seen today after a day with nothing seen', () => {
        const record = advanceSpendRecord(seen('2026-10-02', 5000, 8000), 12345, NOW);

        expect(record.baselineUsed).toBe(12345);
        expect(getSpentToday(record, NOW)).toBe(0);
    });

    // Extra usage resets at 00:00 UTC on the 1st, so last month's total is
    // never today's starting point.
    it('starts the 1st of the month at zero', () => {
        const firstOfMonth = Date.parse('2026-11-01T00:05:00Z');

        const afterLastMonth = advanceSpendRecord(seen('2026-10-31', 95000, 99000), 150, firstOfMonth);
        expect(afterLastMonth).toEqual(seen('2026-11-01', 0, 150));
        expect(getSpentToday(afterLastMonth, firstOfMonth)).toBe(150);

        expect(advanceSpendRecord(undefined, 150, firstOfMonth).baselineUsed).toBe(0);
    });

    it('keeps the starting point through the day', () => {
        const record = advanceSpendRecord(seen('2026-10-05', 12345, 12345), 12800, NOW);

        expect(record).toEqual(seen('2026-10-05', 12345, 12800));
        expect(getSpentToday(record, NOW)).toBe(455);
    });

    it('never reports negative spend when the month-to-date total drops', () => {
        const record = advanceSpendRecord(seen('2026-10-05', 12345, 12345), 9000, NOW);

        expect(record.baselineUsed).toBe(9000);
        expect(getSpentToday(record, NOW)).toBe(0);
    });
});

describe('getSpentToday', () => {
    it('has nothing for a record from an earlier day', () => {
        expect(getSpentToday(seen('2026-10-04', 5000, 9000), NOW)).toBeUndefined();
        expect(getSpentToday(undefined, NOW)).toBeUndefined();
    });
});

describe('observeExtraUsageSpend', () => {
    afterEach(() => {
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('keeps a separate record per login', () => {
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-04', 5000, 9000) } });

        expect(observeExtraUsageSpend('work', 12345, deps)).toBe(3345);
        expect(observeExtraUsageSpend('personal', 300, deps)).toBe(0);

        expect(readDailyState(deps).spend).toEqual({
            work: seen('2026-10-05', 9000, 12345),
            personal: seen('2026-10-05', 300, 300)
        });
    });

    it('writes nothing when the observation changes nothing', () => {
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-05', 9000, 12345) } });

        expect(observeExtraUsageSpend('work', 12345, deps)).toBe(3345);
        expect(deps.writes).toBe(0);
    });

    it('still reports today\'s spend when another writer holds the lock', () => {
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-04', 5000, 9000) } });
        fs.writeFileSync(LOCK_PATH, '');

        expect(observeExtraUsageSpend('work', 12345, deps)).toBe(3345);
        expect(deps.writes).toBe(0);
    });
});
