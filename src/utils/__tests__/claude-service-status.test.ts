import { HttpsProxyAgent } from 'https-proxy-agent';
import type * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { __testing as cacheDirTesting } from '../cache-dir';
import type { ClaudeIncidentWindow } from '../claude-service-status';
import {
    INCIDENT_HISTORY_BUCKET_COUNT,
    INCIDENT_HISTORY_BUCKET_MS,
    __testing,
    computeIncidentHistoryBuckets,
    getClaudeStatusFgCode,
    hasClaudeStatusWidgets,
    isClaudeStatusHistoryEnabled,
    parseClaudeIncidentsResponse,
    parseClaudeStatusResponse,
    prefetchClaudeStatusIfNeeded
} from '../claude-service-status';

import {
    isolateHttpsProxyEnv,
    startRefusingProxy,
    startStalledProxy,
    type RefusingProxy,
    type StalledProxy
} from './proxy-test-helpers';

const require = createRequire(import.meta.url);
const { execFileSync: realExecFileSync } = require('node:child_process') as { execFileSync: typeof childProcess.execFileSync };

type StatusPageRequestFn = NonNullable<Parameters<typeof __testing.fetchStatusPagePath>[1]>;

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse('2026-08-15T12:00:00Z');

function incident(impact: ClaudeIncidentWindow['impact'], startHoursAgo: number, endHoursAgo: number | null): ClaudeIncidentWindow {
    return {
        impact,
        startMs: NOW - startHoursAgo * HOUR_MS,
        endMs: endHoursAgo === null ? null : NOW - endHoursAgo * HOUR_MS
    };
}

describe('computeIncidentHistoryBuckets', () => {
    it('reports none for every bucket when there are no incidents', () => {
        expect(computeIncidentHistoryBuckets([], NOW)).toEqual([
            'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'
        ]);
    });

    it('colors every bucket an incident window overlaps', () => {
        // Active from 13h ago to 8h ago: overlaps the 18-12h and 12-6h buckets.
        const buckets = computeIncidentHistoryBuckets([incident('minor', 13, 8)], NOW);
        expect(buckets).toEqual([
            'none', 'none', 'none', 'none', 'none', 'minor', 'minor', 'none'
        ]);
    });

    it('keeps an unresolved incident active through the newest bucket', () => {
        const buckets = computeIncidentHistoryBuckets([incident('major', 4, null)], NOW);
        expect(buckets).toEqual([
            'none', 'none', 'none', 'none', 'none', 'none', 'none', 'major'
        ]);
    });

    it('picks the worst overlapping impact per bucket', () => {
        const buckets = computeIncidentHistoryBuckets([
            incident('minor', 5, 1),
            incident('critical', 3, 2),
            incident('major', 4, 3)
        ], NOW);
        expect(buckets[INCIDENT_HISTORY_BUCKET_COUNT - 1]).toBe('critical');
    });

    it('ignores incidents fully outside the 48h window', () => {
        const buckets = computeIncidentHistoryBuckets([incident('critical', 80, 60)], NOW);
        expect(buckets.every(bucket => bucket === 'none')).toBe(true);
    });

    it('does not treat a bucket-boundary touch as an overlap', () => {
        // Resolved exactly at the oldest bucket's start: no overlap.
        const boundary = NOW - INCIDENT_HISTORY_BUCKET_COUNT * INCIDENT_HISTORY_BUCKET_MS;
        const buckets = computeIncidentHistoryBuckets([{ impact: 'critical', startMs: boundary - HOUR_MS, endMs: boundary }], NOW);
        expect(buckets.every(bucket => bucket === 'none')).toBe(true);
    });

    it('supports custom bucket counts and sizes', () => {
        const buckets = computeIncidentHistoryBuckets([incident('minor', 1.5, null)], NOW, 4, HOUR_MS);
        expect(buckets).toEqual(['none', 'none', 'minor', 'minor']);
    });
});

describe('parseClaudeStatusResponse', () => {
    it('extracts the status indicator', () => {
        expect(parseClaudeStatusResponse('{"status":{"indicator":"minor","description":"Partially Degraded Service"}}')).toBe('minor');
    });

    it('returns null for malformed JSON or a missing indicator', () => {
        expect(parseClaudeStatusResponse('not json')).toBeNull();
        expect(parseClaudeStatusResponse('{"status":{}}')).toBeNull();
        expect(parseClaudeStatusResponse('{}')).toBeNull();
    });
});

describe('parseClaudeIncidentsResponse', () => {
    it('prefers started_at, falls back to created_at, and drops untracked impacts', () => {
        const raw = JSON.stringify({
            incidents: [
                {
                    impact: 'major',
                    started_at: '2026-08-14T22:00:00Z',
                    created_at: '2026-08-15T00:00:00Z',
                    resolved_at: '2026-08-15T02:00:00Z'
                },
                { impact: 'minor', created_at: '2026-08-15T03:00:00Z', resolved_at: null },
                { impact: 'none', created_at: '2026-08-15T04:00:00Z', resolved_at: '2026-08-15T05:00:00Z' },
                { impact: 'catastrophic', created_at: '2026-08-15T04:00:00Z', resolved_at: null }
            ]
        });

        expect(parseClaudeIncidentsResponse(raw)).toEqual([
            {
                impact: 'major',
                startMs: Date.parse('2026-08-14T22:00:00Z'),
                endMs: Date.parse('2026-08-15T02:00:00Z')
            },
            {
                impact: 'minor',
                startMs: Date.parse('2026-08-15T03:00:00Z'),
                endMs: null
            }
        ]);
    });

    it('falls back to created_at when started_at is malformed', () => {
        const raw = JSON.stringify({
            incidents: [{
                impact: 'critical',
                started_at: 'garbage',
                created_at: '2026-08-15T04:00:00Z',
                resolved_at: null
            }]
        });
        expect(parseClaudeIncidentsResponse(raw)).toEqual([{
            impact: 'critical',
            startMs: Date.parse('2026-08-15T04:00:00Z'),
            endMs: null
        }]);
    });

    it('drops incidents without a parseable start timestamp', () => {
        const raw = JSON.stringify({ incidents: [{ impact: 'critical', started_at: 'garbage', created_at: null, resolved_at: null }] });
        expect(parseClaudeIncidentsResponse(raw)).toEqual([]);
    });

    it('returns null for malformed JSON and an empty list for a missing incidents array', () => {
        expect(parseClaudeIncidentsResponse('not json')).toBeNull();
        expect(parseClaudeIncidentsResponse('{}')).toEqual([]);
    });
});

describe('status page response handling', () => {
    isolateHttpsProxyEnv();

    // Streams the chunks as the response body, then ends it or fails it mid-stream.
    function respondingRequest(
        statusCode: number,
        chunks: string[],
        finalEvent: 'end' | 'aborted' | 'error' = 'end'
    ): StatusPageRequestFn {
        return (_options, onResponse) => Object.assign(new EventEmitter(), {
            destroy: () => undefined,
            end() {
                const response = Object.assign(new EventEmitter(), {
                    statusCode,
                    setEncoding: () => undefined
                });
                onResponse(response);
                for (const chunk of chunks) {
                    response.emit('data', chunk);
                }
                if (finalEvent === 'error') {
                    response.emit('error', new Error('response stream failed'));
                } else {
                    response.emit(finalEvent);
                }
            }
        });
    }

    function failingRequest(event: 'error' | 'timeout', onDestroy: () => void = () => undefined): StatusPageRequestFn {
        return () => {
            const request = Object.assign(new EventEmitter(), {
                destroy() {
                    onDestroy();
                    // A real ClientRequest destroyed before any response reports a socket error.
                    request.emit('error', new Error('socket hang up'));
                },
                end() {
                    if (event === 'error') {
                        request.emit('error', new Error('connect ECONNREFUSED'));
                    } else {
                        request.emit('timeout');
                    }
                }
            });

            return request;
        };
    }

    it.each(['aborted', 'error'] as const)('settles with null when the response emits %s', async (event) => {
        const result = await Promise.race([
            __testing.fetchStatusPagePath('/test', respondingRequest(200, ['partial response'], event)),
            new Promise<'timeout'>(resolve => setTimeout(() => { resolve('timeout'); }, 100))
        ]);

        expect(result).toBeNull();
    });

    it('returns the full body of a 200 response delivered in several chunks', async () => {
        const result = await __testing.fetchStatusPagePath('/test', respondingRequest(200, ['{"status":', '{"indicator":', '"minor"}}']));

        expect(result).toBe('{"status":{"indicator":"minor"}}');
    });

    it.each([
        ['a non-200 status', 503, ['<html>Service Unavailable</html>']],
        ['an empty 200 body', 200, []]
    ])('settles with null for %s', async (_label, statusCode, chunks) => {
        await expect(__testing.fetchStatusPagePath('/test', respondingRequest(statusCode, chunks))).resolves.toBeNull();
    });

    it('settles with null when the request fails before any response', async () => {
        await expect(__testing.fetchStatusPagePath('/test', failingRequest('error'))).resolves.toBeNull();
    });

    it('destroys a timed-out request and settles with null', async () => {
        const destroy = vi.fn();

        await expect(__testing.fetchStatusPagePath('/test', failingRequest('timeout', destroy))).resolves.toBeNull();
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('destroys a request that never connects or answers once the deadline passes', async () => {
        const destroy = vi.fn();
        const stalledRequest: StatusPageRequestFn = () => Object.assign(new EventEmitter(), {
            destroy,
            end: () => undefined
        });

        const result = await Promise.race([
            __testing.fetchStatusPagePath('/test', stalledRequest, 10),
            new Promise<'still pending'>(resolve => setTimeout(() => { resolve('still pending'); }, 1000))
        ]);

        expect(result).toBeNull();
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    // The request's socket timeout can't fire before the proxy answers CONNECT,
    // and the agent's own connection to the proxy would keep the process alive
    describe('behind a proxy that never answers CONNECT', () => {
        let proxy: StalledProxy | null = null;

        afterEach(async () => {
            await proxy?.stop();
            proxy = null;
        });

        it('gives up at the deadline and closes its connection to the proxy', async () => {
            proxy = await startStalledProxy();
            process.env.HTTPS_PROXY = proxy.url;

            expect(await __testing.fetchStatusPagePath('/test', undefined, 50)).toBeNull();
            await proxy.connectionClosed;
        });
    });

    it('sends a GET for the path to status.claude.com with a 5 second timeout and no proxy agent by default', async () => {
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await __testing.fetchStatusPagePath('/api/v2/status.json', requestFn);

        expect(requestFn).toHaveBeenCalledTimes(1);
        expect(requestFn.mock.calls[0]?.[0]).toEqual({
            hostname: 'status.claude.com',
            path: '/api/v2/status.json',
            method: 'GET',
            timeout: 5000
        });
    });

    it('tunnels through the proxy named by HTTPS_PROXY', async () => {
        process.env.HTTPS_PROXY = 'http://proxy.example:8080';
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await __testing.fetchStatusPagePath('/test', requestFn);

        const agent = requestFn.mock.calls[0]?.[0].agent;
        expect(agent).toBeInstanceOf(HttpsProxyAgent);
        expect((agent as HttpsProxyAgent<string>).proxy.href).toBe('http://proxy.example:8080/');
    });

    it('connects directly when NO_PROXY lists status.claude.com', async () => {
        process.env.HTTPS_PROXY = 'http://proxy.example:8080';
        process.env.NO_PROXY = 'localhost,claude.com';
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await expect(__testing.fetchStatusPagePath('/test', requestFn)).resolves.toBe('{}');
        expect(requestFn.mock.calls[0]?.[0]).not.toHaveProperty('agent');
    });

    it('ignores a whitespace-only HTTPS_PROXY', async () => {
        process.env.HTTPS_PROXY = '   ';
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await expect(__testing.fetchStatusPagePath('/test', requestFn)).resolves.toBe('{}');
        expect(requestFn.mock.calls[0]?.[0]).not.toHaveProperty('agent');
    });

    it('settles with null without sending a request when HTTPS_PROXY is not a valid URL', async () => {
        process.env.HTTPS_PROXY = 'not a proxy url';
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await expect(__testing.fetchStatusPagePath('/test', requestFn)).resolves.toBeNull();
        expect(requestFn).not.toHaveBeenCalled();
    });
});

describe('Claude Status failure backoff', () => {
    isolateHttpsProxyEnv();

    let proxy: RefusingProxy | null = null;
    let cacheDir = '';

    beforeEach(() => {
        cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-status-test-'));
        cacheDirTesting.setWritableCacheDir(cacheDir);
    });

    afterEach(async () => {
        await proxy?.stop();
        proxy = null;
        cacheDirTesting.setWritableCacheDir(null);
        fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    // Every render is a new process, so the lock file is all that keeps an
    // unreachable status page from being tried again on every render. It
    // belongs in the folder getWritableCacheDir() picks, which moves to the
    // temp folder when ~/.cache can't be written.
    it('keeps its failure backoff in the writable cache folder', async () => {
        proxy = await startRefusingProxy();
        process.env.HTTPS_PROXY = proxy.url;
        const lines = [[{ id: '1', type: 'claude-status' }]];

        await expect(prefetchClaudeStatusIfNeeded(lines)).resolves.toEqual({ error: true });
        await expect(prefetchClaudeStatusIfNeeded(lines)).resolves.toEqual({ error: true });

        expect(proxy.connectionCount()).toBe(1);
        expect(fs.readdirSync(cacheDir)).toEqual(['claude-status.lock']);
    });
});

describe('getClaudeStatusFgCode', () => {
    it('uses the 16-color escapes as-is, with major falling back to red and critical to bright red', () => {
        expect(getClaudeStatusFgCode('major', 'ansi16')).toBe('\x1b[31m');
        expect(getClaudeStatusFgCode('critical', 'ansi16')).toBe('\x1b[91m');
    });
});

describe('claude-status prefetch predicates', () => {
    it('detects claude-status widgets in configured lines', () => {
        expect(hasClaudeStatusWidgets([[{ id: '1', type: 'model' }]])).toBe(false);
        expect(hasClaudeStatusWidgets([[{ id: '1', type: 'model' }], [{ id: '2', type: 'claude-status' }]])).toBe(true);
    });

    it('only reports history enabled for claude-status items with the metadata flag', () => {
        expect(isClaudeStatusHistoryEnabled({ id: '1', type: 'claude-status' })).toBe(false);
        expect(isClaudeStatusHistoryEnabled({ id: '1', type: 'claude-status', metadata: { history: 'true' } })).toBe(true);
        expect(isClaudeStatusHistoryEnabled({ id: '1', type: 'custom-text', metadata: { history: 'true' } })).toBe(false);
    });
});

// A file left read-only in a folder this account can still write to, as a
// run under sudo leaves one it created. Every render is a new process that
// finds its cache folder from the home directory as the module loads, so each
// render here runs in a child process with a scratch HOME.
describe.skipIf(process.platform === 'win32')('Claude Status cache files left read-only', () => {
    let tempRoot = '';
    let home = '';
    let cacheDir = '';
    let probeScriptPath = '';

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-claude-status-files-'));
        home = path.join(tempRoot, 'home');
        cacheDir = path.join(home, '.cache', 'ccstatusline');
        probeScriptPath = path.join(tempRoot, 'probe.mjs');
        fs.mkdirSync(cacheDir, { recursive: true });
        // An empty TEST_STATUS_BODY fails the request, as when the page can't be reached
        fs.writeFileSync(probeScriptPath, `
import * as os from 'node:os';
import { createRequire } from 'node:module';

const https = createRequire(import.meta.url)('node:https');
const body = process.env.TEST_STATUS_BODY;
let requestCount = 0;
https.request = (options, onResponse) => {
    requestCount += 1;
    const handlers = new Map();
    const request = {
        on(event, handler) { handlers.set(event, handler); return request; },
        destroy() {},
        end() {
            if (!body) {
                handlers.get('error')?.(new Error('connect ECONNREFUSED'));
                return;
            }
            const responseHandlers = new Map();
            onResponse({
                statusCode: 200,
                setEncoding() {},
                on(event, handler) { responseHandlers.set(event, handler); }
            });
            responseHandlers.get('data')?.(body);
            responseHandlers.get('end')?.();
        }
    };
    return request;
};

const { prefetchClaudeStatusIfNeeded } = await import(${JSON.stringify(fileURLToPath(new URL('../claude-service-status.ts', import.meta.url)))});
const result = await prefetchClaudeStatusIfNeeded([[{ id: '1', type: 'claude-status' }]]);
process.stdout.write(JSON.stringify({ result, requestCount, homedir: os.homedir() }));
`);
    });

    afterEach(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    function render(statusBody: string): { result: unknown; requestCount: number } {
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
            const normalizedKey = key.toUpperCase();
            return normalizedKey !== 'HTTPS_PROXY' && normalizedKey !== 'NO_PROXY';
        }));
        // os.homedir() prefers USERPROFILE on Windows
        Object.assign(env, { HOME: home, USERPROFILE: home, TEST_STATUS_BODY: statusBody });

        const output = JSON.parse(realExecFileSync(process.execPath, [probeScriptPath], { encoding: 'utf8', env })) as {
            homedir: string;
            requestCount: number;
            result: unknown;
        };
        // A probe resolving a different home has escaped its sandbox and would
        // read or write the real user's ~/.cache/ccstatusline
        expect(output.homedir).toBe(home);
        return { result: output.result, requestCount: output.requestCount };
    }

    function writeReadOnlyFile(name: string, contents: string, mtimeMs: number): void {
        const filePath = path.join(cacheDir, name);
        fs.writeFileSync(filePath, contents);
        fs.utimesSync(filePath, mtimeMs / 1000, mtimeMs / 1000);
        fs.chmodSync(filePath, 0o444);
    }

    it('backs off after a failed fetch when the lock file was left read-only', () => {
        writeReadOnlyFile('claude-status.lock', '', Date.now() - HOUR_MS);

        expect(render('')).toEqual({ result: { error: true }, requestCount: 1 });
        expect(render('')).toEqual({ result: { error: true }, requestCount: 0 });
    });

    it('serves the next render from the cache when the cache file was left read-only', () => {
        const fetchedAt = Date.now() - HOUR_MS;
        writeReadOnlyFile('claude-status.json', JSON.stringify({ fetchedAt, indicator: 'major', incidents: null, incidentsQueried: false }), fetchedAt);

        expect(render('{"status":{"indicator":"none"}}')).toEqual({ result: { indicator: 'none' }, requestCount: 1 });
        expect(render('')).toEqual({ result: { indicator: 'none' }, requestCount: 0 });
    });
});
