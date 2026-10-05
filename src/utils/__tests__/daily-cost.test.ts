import * as fs from 'node:fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    advanceSessionRecord,
    computeDailyTotals,
    observeSessionCost,
    prefetchDailyCostIfNeeded
} from '../daily-cost';
import type {
    DailyStateDeps,
    SessionDayRecord
} from '../daily-state';
import { readDailyState } from '../daily-state';

const STATE_PATH = `/tmp/test-daily-cost-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
const LOCK_PATH = `${STATE_PATH}.lock`;

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// Monday 5 October 2026, 15:00 UTC.
const NOW = Date.parse('2026-10-05T15:00:00Z');

function at(time: string): number {
    return Date.parse(`2026-10-05T${time}:00Z`);
}

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

function session(overrides: Partial<SessionDayRecord>): SessionDayRecord {
    return {
        lastSeenDay: '2026-10-05',
        lastSeenAt: NOW,
        startedAt: at('14:00'),
        cost: 2.5,
        apiMs: 30 * MINUTE,
        dayStartCost: 0,
        dayStartApiMs: 0,
        ...overrides
    };
}

describe('advanceSessionRecord', () => {
    it('starts a session that began today at zero', () => {
        expect(advanceSessionRecord(undefined, { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, NOW)).toEqual(session({}));
    });

    it('starts an overnight session at what it had reached by the end of yesterday', () => {
        const yesterday: SessionDayRecord = {
            lastSeenDay: '2026-10-04',
            lastSeenAt: Date.parse('2026-10-04T23:30:00Z'),
            startedAt: Date.parse('2026-10-04T22:00:00Z'),
            cost: 1,
            apiMs: 10 * MINUTE,
            dayStartCost: 0,
            dayStartApiMs: 0
        };

        // Started at 22:00 UTC yesterday: 17 hours ago.
        const record = advanceSessionRecord(yesterday, { cost: 3, apiMs: 25 * MINUTE, durationMs: 17 * HOUR }, NOW);

        expect(record.dayStartCost).toBe(1);
        expect(record.dayStartApiMs).toBe(10 * MINUTE);
        expect(record.startedAt).toBe(Date.parse('2026-10-04T22:00:00Z'));
    });

    it('starts an overnight session first seen today at its current values', () => {
        const record = advanceSessionRecord(undefined, { cost: 3, apiMs: 25 * MINUTE, durationMs: 17 * HOUR }, NOW);

        expect(record.dayStartCost).toBe(3);
        expect(record.dayStartApiMs).toBe(25 * MINUTE);
    });

    it('keeps the day\'s starting values through the day', () => {
        const record = advanceSessionRecord(
            session({ dayStartCost: 1, dayStartApiMs: 10 * MINUTE, lastSeenAt: at('14:30') }),
            { cost: 4, apiMs: 40 * MINUTE, durationMs: HOUR },
            NOW
        );

        expect(record).toEqual(session({ cost: 4, apiMs: 40 * MINUTE, dayStartCost: 1, dayStartApiMs: 10 * MINUTE }));
    });
});

describe('computeDailyTotals', () => {
    it('adds up today\'s cost and active time across sessions', () => {
        const totals = computeDailyTotals({
            a: session({ cost: 2.5, apiMs: 30 * MINUTE }),
            b: session({ cost: 3, apiMs: 25 * MINUTE, dayStartCost: 1, dayStartApiMs: 10 * MINUTE, startedAt: Date.parse('2026-10-04T22:00:00Z') })
        }, NOW);

        expect(totals.claudeCodeCost).toBe(4.5);
        expect(totals.activeMs).toBe(45 * MINUTE);
    });

    it('counts clock time once for overlapping sessions and not at all between sessions', () => {
        // 09:00-11:00 covered by two overlapping sessions, then 13:00-14:00: 3 hours.
        const totals = computeDailyTotals({
            a: session({ startedAt: at('09:00'), lastSeenAt: at('10:00') }),
            b: session({ startedAt: at('09:30'), lastSeenAt: at('11:00') }),
            c: session({ startedAt: at('13:00'), lastSeenAt: at('14:00') })
        }, NOW);

        expect(totals.clockMs).toBe(3 * HOUR);
    });

    it('starts an overnight session\'s clock time at midnight UTC', () => {
        const totals = computeDailyTotals({ a: session({ startedAt: Date.parse('2026-10-04T22:00:00Z'), lastSeenAt: at('02:00') }) }, NOW);

        expect(totals.clockMs).toBe(2 * HOUR);
    });

    it('leaves out sessions last seen yesterday', () => {
        expect(computeDailyTotals({ old: session({ lastSeenDay: '2026-10-04', lastSeenAt: Date.parse('2026-10-04T20:00:00Z') }) }, NOW)).toEqual({ claudeCodeCost: 0, activeMs: 0, clockMs: 0 });
    });
});

describe('observeSessionCost', () => {
    afterEach(() => {
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('keeps each Claude Code profile\'s sessions separate', () => {
        const deps = makeDeps(null);

        observeSessionCost('default', 's1', { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, deps);
        const work = observeSessionCost('/Users/me/.claude-work', 's2', { cost: 1, apiMs: 6 * MINUTE, durationMs: HOUR }, deps);

        expect(work).toEqual({ claudeCodeCost: 1, activeMs: 6 * MINUTE, clockMs: HOUR });
        expect(Object.keys(readDailyState(deps).sessions).sort()).toEqual(['/Users/me/.claude-work', 'default']);
    });

    it('adds the other sessions of the profile seen today', () => {
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1: session({ startedAt: at('09:00'), lastSeenAt: at('10:00') }) } } });

        const totals = observeSessionCost('default', 's2', { cost: 1, apiMs: 6 * MINUTE, durationMs: HOUR }, deps);

        expect(totals).toEqual({ claudeCodeCost: 3.5, activeMs: 36 * MINUTE, clockMs: 2 * HOUR });
    });

    it('skips the write when nothing changed in the last minute', () => {
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1: session({ lastSeenAt: NOW - 30_000 }) } } });

        observeSessionCost('default', 's1', { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, deps);

        expect(deps.writes).toBe(0);
    });

    it('still counts this session when another writer holds the lock', () => {
        const deps = makeDeps(null);
        fs.writeFileSync(LOCK_PATH, '');

        expect(observeSessionCost('default', 's1', { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, deps))
            .toEqual({ claudeCodeCost: 2.5, activeMs: 30 * MINUTE, clockMs: HOUR });
        expect(deps.writes).toBe(0);
    });
});

describe('prefetchDailyCostIfNeeded', () => {
    const rateLine = [[{ id: '1', type: 'daily-cost-rate' }]];
    const payload = {
        session_id: 's1',
        cost: { total_cost_usd: 2.5, total_api_duration_ms: 30 * MINUTE, total_duration_ms: HOUR }
    };
    let savedConfigDir: string | undefined;

    beforeEach(() => {
        savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
        delete process.env.CLAUDE_CONFIG_DIR;
    });

    afterEach(() => {
        if (savedConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
        }
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('records nothing when no line shows Daily Cost Rate', () => {
        const deps = makeDeps(null);

        expect(prefetchDailyCostIfNeeded([[{ id: '1', type: 'session-cost' }]], payload, deps)).toBeNull();
        expect(deps.writes).toBe(0);
    });

    it('records nothing without a session id and its cost and durations', () => {
        const deps = makeDeps(null);

        expect(prefetchDailyCostIfNeeded(rateLine, { cost: payload.cost }, deps)).toBeNull();
        expect(prefetchDailyCostIfNeeded(rateLine, { session_id: 's1', cost: { total_cost_usd: 2.5 } }, deps)).toBeNull();
        expect(deps.writes).toBe(0);
    });

    it('records the session under its Claude Code profile and returns today\'s totals', () => {
        const deps = makeDeps(null);

        expect(prefetchDailyCostIfNeeded(rateLine, payload, deps)).toEqual({ claudeCodeCost: 2.5, activeMs: 30 * MINUTE, clockMs: HOUR });
        process.env.CLAUDE_CONFIG_DIR = '/Users/me/.claude-work';
        prefetchDailyCostIfNeeded(rateLine, { ...payload, session_id: 's2' }, deps);

        expect(Object.keys(readDailyState(deps).sessions).sort()).toEqual(['/Users/me/.claude-work', 'default']);
    });
});
