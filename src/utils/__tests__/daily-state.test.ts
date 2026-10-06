import * as fs from 'fs';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    DailyState,
    DailyStateDeps,
    SessionDayRecord,
    SpendDayRecord
} from '../daily-state';
import {
    previousUtcDayKey,
    readDailyState,
    updateDailyState,
    utcDayKey
} from '../daily-state';

// Unique per run: the lock file lives on the real filesystem next to this path
// (see cache-lock.ts), so a shared path could collide with another test process.
const STATE_PATH = `/tmp/test-daily-state-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
const LOCK_PATH = `${STATE_PATH}.lock`;

// Monday 5 October 2026, 15:00 UTC.
const NOW = Date.parse('2026-10-05T15:00:00Z');

function makeDeps(initial: string | null, now = NOW): DailyStateDeps & { files: Map<string, string> } {
    const files = new Map<string, string>();
    if (initial !== null) {
        files.set(STATE_PATH, initial);
    }

    return {
        files,
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
        writeFileSync: (p: string, data: string) => { files.set(p, data); },
        renameSync: (from: string, to: string) => {
            const data = files.get(from);
            if (data === undefined) {
                throw new Error('ENOENT');
            }
            files.set(to, data);
            files.delete(from);
        }
    };
}

function sessionRecord(lastSeenDay: string): SessionDayRecord {
    return {
        lastSeenDay,
        lastSeenAt: Date.parse(`${lastSeenDay}T12:00:00Z`),
        startedAt: Date.parse(`${lastSeenDay}T10:00:00Z`),
        cost: 2.5,
        apiMs: 600_000,
        dayStartCost: 0,
        dayStartApiMs: 0
    };
}

function record(lastSeenDay: string, used = 1000): SpendDayRecord {
    return { day: lastSeenDay, baselineUsed: used, lastSeenDay, lastSeenUsed: used, lastSeenAt: Date.parse(`${lastSeenDay}T12:00:00Z`) };
}

describe('UTC day keys', () => {
    it('names the UTC calendar day', () => {
        expect(utcDayKey(Date.parse('2026-10-05T23:59:59Z'))).toBe('2026-10-05');
        expect(utcDayKey(Date.parse('2026-10-06T00:00:00Z'))).toBe('2026-10-06');
        // 7:30pm on 5 October in US Central time is already the 6th in UTC.
        expect(utcDayKey(Date.parse('2026-10-05T19:30:00-05:00'))).toBe('2026-10-06');
    });

    it('names the previous UTC day across a month boundary', () => {
        expect(previousUtcDayKey(Date.parse('2026-11-01T00:00:00Z'))).toBe('2026-10-31');
        expect(previousUtcDayKey(NOW)).toBe('2026-10-04');
    });
});

describe('daily state file', () => {
    afterEach(() => {
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('reads a missing file as empty state', () => {
        expect(readDailyState(makeDeps(null))).toEqual({ version: 1, spend: {}, sessions: {} });
    });

    it('reads a corrupt file, another version, or invalid records as empty', () => {
        expect(readDailyState(makeDeps('{not json'))).toEqual({ version: 1, spend: {}, sessions: {} });
        expect(readDailyState(makeDeps(JSON.stringify({ version: 2, spend: { a: record('2026-10-05') } })))).toEqual({ version: 1, spend: {}, sessions: {} });
        expect(readDailyState(makeDeps(JSON.stringify({
            version: 1,
            spend: {
                good: record('2026-10-05'),
                bad: { day: '2026-10-05', baselineUsed: 'lots' }
            }
        })))).toEqual({ version: 1, spend: { good: record('2026-10-05') }, sessions: {} });
    });

    it('writes through a temp file and rename, and reads the result back', () => {
        const deps = makeDeps(null);

        const ran = updateDailyState(state => ({ ...state, spend: { acct: record('2026-10-05', 12345) } }), deps);

        expect(ran).toBe(true);
        expect([...deps.files.keys()]).toEqual([STATE_PATH]);
        expect(readDailyState(deps)).toEqual({ version: 1, spend: { acct: record('2026-10-05', 12345) }, sessions: {} });
    });

    it('writes nothing when the update reports no change', () => {
        const deps = makeDeps(null);

        expect(updateDailyState(() => null, deps)).toBe(true);
        expect(deps.files.size).toBe(0);
    });

    it('drops records last seen before yesterday when writing', () => {
        const deps = makeDeps(null);
        const state: DailyState = {
            version: 1,
            spend: {
                today: record('2026-10-05'),
                yesterday: record('2026-10-04'),
                stale: record('2026-10-03')
            },
            sessions: {}
        };

        updateDailyState(() => state, deps);

        expect(Object.keys(readDailyState(deps).spend).sort()).toEqual(['today', 'yesterday']);
    });

    it('reads sessions per profile and drops invalid session records', () => {
        const session = sessionRecord('2026-10-05');

        expect(readDailyState(makeDeps(JSON.stringify({
            version: 1,
            spend: {},
            sessions: {
                default: { good: session, bad: { lastSeenDay: '2026-10-05', cost: 'free' } },
                broken: 'not an object'
            }
        }))).sessions).toEqual({ default: { good: session } });
    });

    it('drops sessions last seen before yesterday, and profiles left empty, when writing', () => {
        const deps = makeDeps(null);

        updateDailyState(() => ({
            version: 1,
            spend: {},
            sessions: {
                default: { today: sessionRecord('2026-10-05'), stale: sessionRecord('2026-10-03') },
                old: { stale: sessionRecord('2026-10-02') }
            }
        }), deps);

        expect(readDailyState(deps).sessions).toEqual({ default: { today: sessionRecord('2026-10-05') } });
    });

    it('skips the update while another writer holds a fresh lock', () => {
        const deps = makeDeps(null);
        fs.writeFileSync(LOCK_PATH, '');
        let called = false;

        const ran = updateDailyState((state) => {
            called = true;
            return state;
        }, deps);

        expect(ran).toBe(false);
        expect(called).toBe(false);
        expect(deps.files.size).toBe(0);
    });
});
