import { execFileSync } from 'node:child_process';
import {
    createHash,
    randomBytes
} from 'node:crypto';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';

import type { AccountEmailResult } from '../types/AccountEmail';

import { getWritableCacheDir } from './cache-dir';
import { withCacheLock } from './cache-lock';
import { getClaudeConfigDir } from './claude-settings';
import { isExcludedFromProxy } from './no-proxy';
import {
    createProxyAgent,
    type ClosableProxyAgent
} from './proxy-agent';
import { replaceFileSync } from './replace-file';
import type {
    UsageData,
    UsageDataField,
    UsageError
} from './usage-types';
import {
    UsageErrorSchema,
    WEEKLY_MODEL_USAGE_BUCKETS,
    setUsageField
} from './usage-types';

// Cache configuration
// Use the effective directory for file identity, independently of the raw
// environment value Claude Code uses to name Keychain services. Shared legacy
// files are left untouched: their cache/lock cannot be assigned to a profile.
function getUsageFilePath(suffix: 'json' | 'lock' | 'credentials.lock'): string {
    const configDir = path.resolve(getClaudeConfigDir());
    const configHash = createHash('sha256').update(configDir).digest('hex').slice(0, 16);
    return path.join(getWritableCacheDir(), `usage-${configHash}.${suffix}`);
}
const CACHE_MAX_AGE = 180; // seconds
const LOCK_MAX_AGE = 30;   // rate limit: only try API once per 30 seconds
const DEFAULT_RATE_LIMIT_BACKOFF = 300; // seconds
// Upper bound on how far ahead a lock may block fetching. The longest
// legitimate lock is a 429 Retry-After, which servers keep far below a day.
// The JSON lock stores an absolute deadline, so unlike the legacy mtime lock
// it cannot age out on its own: one bogus timestamp (a mocked clock, a system
// clock jump) otherwise wedges usage fetching permanently, with every widget
// stuck on [Timeout] and no code path able to recover.
const MAX_LOCK_HORIZON = 24 * 60 * 60; // seconds
const MACOS_USAGE_CREDENTIALS_SERVICE = 'Claude Code-credentials';
// Keychain reads normally take milliseconds. A `security` call blocked on an
// unlock prompt must not hold the status line until someone answers it.
const MACOS_SECURITY_TIMEOUT_MS = 5000;

// How much later than a cached usage API answer's reset end the statusline
// payload's end for the same window may be before that answer counts as one
// from before a reset. Both report the same instant, the payload in whole
// seconds and the API in fractions of one, while a reset moves the end by the
// window's whole length: 5 hours or 7 days.
const PAYLOAD_RESET_TOLERANCE = 60; // seconds

// The 5-hour and weekly reset ends Claude Code's statusline payload shows
// (rate_limits.five_hour / seven_day resets_at), as ISO timestamps.
export type PayloadResetAt = Pick<UsageData, 'sessionResetAt' | 'weeklyResetAt'>;

const PAYLOAD_RESET_FIELDS = ['sessionResetAt', 'weeklyResetAt'] as const;

export interface FetchUsageDataOptions {
    requiredFields?: readonly UsageDataField[];
    payloadResetAt?: PayloadResetAt;
}

// The access token is what the API is called with; the refresh token is kept
// alongside it only to fingerprint the account (see getUsageCacheIdentity).
interface UsageCredentials {
    accessToken: string;
    refreshToken?: string;
}

interface UsageCacheIdentity {
    preferredHash: string;
    accessTokenHash: string;
}

const EXTRA_USAGE_DETAIL_FIELDS = new Set<UsageDataField>([
    'extraUsageLimit',
    'extraUsageUsed',
    'extraUsageUtilization'
]);

const FABLE_USAGE_FIELDS = new Set<UsageDataField>([
    'fableUsage',
    'fableResetAt'
]);

// Maps each window reset field to the utilization field parsed from the same
// API bucket. A null bucket (Enterprise accounts have no rate-limit windows,
// #343) parses to utilization 0 with no resets_at, so once the utilization is
// cached the missing timestamp is conclusive and refetching cannot produce it.
// The per-model entries are derived from WEEKLY_MODEL_USAGE_BUCKETS (see
// usage-types.ts) instead of hand-listed, so this can't drift from the schemas
// below when a model bucket is added or renamed.
const WINDOW_RESET_FIELD_SENTINELS: Partial<Record<UsageDataField, UsageDataField>> = {
    sessionResetAt: 'sessionUsage',
    weeklyResetAt: 'weeklyUsage',
    ...Object.fromEntries(WEEKLY_MODEL_USAGE_BUCKETS.map(bucket => [bucket.resetField, bucket.usageField]))
};

const UsageCredentialsSchema = z.object({
    claudeAiOauth: z.object({
        accessToken: z.string().nullable().optional(),
        refreshToken: z.string().nullable().optional()
    }).optional()
});
const UsageLockErrorSchema = z.enum(['timeout', 'rate-limited', 'api-error', 'parse-error']);
// `transient` marks an api-error lock whose failure clears up on its own (see
// UsageData.errorTransient). Locks written without it, including every lock
// from before it existed, read as lasting failures.
const UsageLockSchema = z.object({
    blockedUntil: z.number(),
    error: UsageLockErrorSchema.optional(),
    transient: z.boolean().optional()
});

// The per-model fields (weeklySonnetUsage, weeklyOpusUsage, ...) are declared
// by hand here and in UsageApiResponseSchema below because Zod object shapes
// need statically-known keys to keep field-level type inference for the
// parse* functions further down. usage-fetch.test.ts's schema-parity test
// asserts both schemas cover every WEEKLY_MODEL_USAGE_BUCKETS entry, so a
// bucket added to one but not the other fails a test instead of silently
// dropping data after a cache round-trip.
const CachedUsageDataSchema = z.object({
    sessionUsage: z.number().nullable().optional(),
    sessionResetAt: z.string().nullable().optional(),
    weeklyUsage: z.number().nullable().optional(),
    weeklyResetAt: z.string().nullable().optional(),
    weeklySonnetUsage: z.number().nullable().optional(),
    weeklySonnetResetAt: z.string().nullable().optional(),
    weeklyOpusUsage: z.number().nullable().optional(),
    weeklyOpusResetAt: z.string().nullable().optional(),
    fableUsage: z.number().nullable().optional(),
    fableResetAt: z.string().nullable().optional(),
    extraUsageEnabled: z.boolean().nullable().optional(),
    extraUsageLimit: z.number().nullable().optional(),
    extraUsageUsed: z.number().nullable().optional(),
    extraUsageUtilization: z.number().nullable().optional(),
    extraUsageCurrency: z.string().nullable().optional(),
    error: z.string().nullable().optional()
});

const CachedTokenHashSchema = z.object({ tokenHash: z.string().optional() });

const UsageApiBucketSchema = z.looseObject({
    utilization: z.number().nullable().optional(),
    resets_at: z.string().nullable().optional()
}).nullable().optional();

type UsageApiBucket = z.infer<typeof UsageApiBucketSchema>;

// Newer accounts migrated off the flat five_hour/seven_day buckets report the
// same windows inside a limits[] array instead (#503). Per-model weekly usage
// is reported there as weekly_scoped entries identified by
// scope.model.display_name. Only the fields this module reads are declared;
// loose-object passes everything else through without failing validation.
const UsageApiLimitSchema = z.looseObject({
    kind: z.string().nullable().optional(),
    percent: z.number().nullable().optional(),
    resets_at: z.string().nullable().optional(),
    scope: z.looseObject({ model: z.looseObject({ display_name: z.string().nullable().optional() }).nullable().optional() }).nullable().catch(null).optional()
});

type UsageApiLimit = z.infer<typeof UsageApiLimitSchema>;

// See the comment on CachedUsageDataSchema above re: why the legacy per-model
// keys are hand-declared rather than generated from WEEKLY_MODEL_USAGE_BUCKETS.
const UsageApiResponseSchema = z.looseObject({
    five_hour: UsageApiBucketSchema,
    seven_day: UsageApiBucketSchema,
    seven_day_sonnet: UsageApiBucketSchema,
    seven_day_opus: UsageApiBucketSchema,
    limits: z.array(UsageApiLimitSchema).nullable().optional(),
    extra_usage: z.looseObject({
        is_enabled: z.boolean().nullable().optional(),
        monthly_limit: z.number().nullable().optional(),
        used_credits: z.number().nullable().optional(),
        utilization: z.number().nullable().optional(),
        currency: z.string().nullable().optional()
    }).nullable().optional()
});

// Exposed only so usage-fetch.test.ts can assert schema/registry parity (see
// the comment on CachedUsageDataSchema above) and the limits[]-vs-legacy-field
// precedence (see parseUsageApiResponse) without duplicating the shapes/logic.
export const __testing = {
    CachedUsageDataSchema,
    UsageApiResponseSchema,
    fetchFromUsageApi,
    parseUsageApiResponse
};

function getUsageApiBucketUtilization(bucket: UsageApiBucket): number | undefined {
    return bucket === null ? 0 : bucket?.utilization ?? undefined;
}

function findUsageApiLimit(limits: UsageApiLimit[] | null | undefined, kind: string): UsageApiLimit | undefined {
    return limits?.find(limit => limit.kind === kind);
}

// Mirrors the null-bucket placeholder guard for #343 above: a limits[] entry
// reporting 0% with no resets_at is not a real usage window, so the
// limits[] fallback below must not resurrect it as a phantom 0% reading.
//
// weekly_scoped entries naming a concrete model are exempt: accounts with a
// per-model quota report that entry as percent 0 / resets_at null until the
// model is first used in the current window (resets_at fills in on first use,
// percent stays 0), so for those the zero reading is real data - the same
// state a null legacy per-model bucket already reports as 0 via
// getUsageApiBucketUtilization. Accounts without the quota omit the entry
// entirely, so this cannot resurrect a phantom window.
function isPlaceholderUsageApiLimit(limit: UsageApiLimit): boolean {
    if (limit.scope?.model?.display_name) {
        return false;
    }
    return (limit.percent ?? 0) === 0 && (limit.resets_at ?? null) === null;
}

function getUsageApiLimitPercent(limit: UsageApiLimit | undefined): number | undefined {
    return limit && !isPlaceholderUsageApiLimit(limit) ? limit.percent ?? undefined : undefined;
}

function getUsageApiLimitResetAt(limit: UsageApiLimit | undefined): string | undefined {
    return limit && !isPlaceholderUsageApiLimit(limit) ? limit.resets_at ?? undefined : undefined;
}

// Finds a model's weekly quota in the new limits[] array. Display names can
// include a model-family prefix (for example "Claude 3.5 Fable"), so matching
// is case-insensitive and accepts the registry name as a substring.
function findWeeklyScopedLimit(limits: UsageApiLimit[] | null | undefined, modelDisplayName: string): UsageApiLimit | undefined {
    const normalizedModelName = modelDisplayName.toLowerCase();
    return limits?.find(limit => (
        limit.kind === 'weekly_scoped'
        && (limit.scope?.model?.display_name ?? '').toLowerCase().includes(normalizedModelName)
    ));
}

function parseJsonWithSchema<T>(rawJson: string, schema: z.ZodType<T>): T | null {
    try {
        const parsed = schema.safeParse(JSON.parse(rawJson));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function parseUsageCredentials(rawJson: string): UsageCredentials | null {
    const oauth = parseJsonWithSchema(rawJson, UsageCredentialsSchema)?.claudeAiOauth;
    if (!oauth?.accessToken) {
        return null;
    }

    return {
        accessToken: oauth.accessToken,
        refreshToken: oauth.refreshToken ?? undefined
    };
}

function parseCachedUsageData(rawJson: string): UsageData | null {
    const parsed = parseJsonWithSchema(rawJson, CachedUsageDataSchema);
    if (!parsed) {
        return null;
    }

    const parsedError = UsageErrorSchema.safeParse(parsed.error);

    return {
        sessionUsage: parsed.sessionUsage ?? undefined,
        sessionResetAt: parsed.sessionResetAt ?? undefined,
        weeklyUsage: parsed.weeklyUsage ?? undefined,
        weeklyResetAt: parsed.weeklyResetAt ?? undefined,
        weeklySonnetUsage: parsed.weeklySonnetUsage ?? undefined,
        weeklySonnetResetAt: parsed.weeklySonnetResetAt ?? undefined,
        weeklyOpusUsage: parsed.weeklyOpusUsage ?? undefined,
        weeklyOpusResetAt: parsed.weeklyOpusResetAt ?? undefined,
        fableUsage: parsed.fableUsage ?? undefined,
        fableResetAt: parsed.fableResetAt ?? undefined,
        extraUsageEnabled: parsed.extraUsageEnabled ?? undefined,
        extraUsageLimit: parsed.extraUsageLimit ?? undefined,
        extraUsageUsed: parsed.extraUsageUsed ?? undefined,
        extraUsageUtilization: parsed.extraUsageUtilization ?? undefined,
        extraUsageCurrency: parsed.extraUsageCurrency ?? undefined,
        error: parsedError.success ? parsedError.data : undefined
    };
}

// One-way fingerprint of the usage credentials, persisted alongside the cache
// so a login switch (e.g. enterprise<->personal, a different account)
// invalidates the cache immediately instead of waiting out the TTL. A
// truncated SHA-256 is a stable identifier, not the token itself, so it is
// safe to write to disk.
function fingerprintUsageToken(token: string): string {
    return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

// Prefer the refresh token so access-token rotation preserves the cache when
// the refresh token is unchanged. Also accept the current access-token hash
// from older caches; the next successful fetch writes the preferred hash.
function getUsageCacheIdentity(credentials: UsageCredentials): UsageCacheIdentity {
    const accessTokenHash = fingerprintUsageToken(credentials.accessToken);
    return {
        preferredHash: credentials.refreshToken ? fingerprintUsageToken(credentials.refreshToken) : accessTokenHash,
        accessTokenHash
    };
}

function readCachedTokenHash(rawJson: string): string | undefined {
    return parseJsonWithSchema(rawJson, CachedTokenHashSchema)?.tokenHash;
}

function tokenHashMatches(cachedHash: string | undefined, identity: UsageCacheIdentity | null): boolean {
    // With no current token we cannot fingerprint-gate, so fall through to the
    // existing no-token handling rather than discarding an otherwise usable cache.
    if (identity === null) {
        return true;
    }
    return cachedHash === identity.preferredHash || cachedHash === identity.accessTokenHash;
}

// parsed is a UsageApiResponseSchema-derived looseObject: declared keys (like
// the legacy seven_day_sonnet/seven_day_opus fallback below) keep their exact
// types, but looseObject's passthrough means indexing by a dynamic string
// (bucket.apiBucketKey) only has `unknown` to offer TS -- hence the cast,
// scoped to this one lookup rather than to the whole parsed object.
function getLegacyUsageApiBucket(parsed: Record<string, unknown>, apiBucketKey: string): UsageApiBucket {
    return parsed[apiBucketKey] as UsageApiBucket;
}

export function parseUsageApiResponse(rawJson: string): UsageData | null {
    const parsed = parseJsonWithSchema(rawJson, UsageApiResponseSchema);
    if (!parsed) {
        return null;
    }

    // Flat five_hour/seven_day buckets are the primary source. On accounts
    // migrated to the limits[] shape those buckets may be missing/null, so
    // each field falls back to the matching limits[] entry independently -
    // the percentage and resets_at can each come from a different source (#503).
    const sessionLimit = findUsageApiLimit(parsed.limits, 'session');
    const weeklyLimit = findUsageApiLimit(parsed.limits, 'weekly_all');

    const result: UsageData = {
        sessionUsage: getUsageApiBucketUtilization(parsed.five_hour) ?? getUsageApiLimitPercent(sessionLimit),
        sessionResetAt: parsed.five_hour?.resets_at ?? getUsageApiLimitResetAt(sessionLimit),
        weeklyUsage: getUsageApiBucketUtilization(parsed.seven_day) ?? getUsageApiLimitPercent(weeklyLimit),
        weeklyResetAt: parsed.seven_day?.resets_at ?? getUsageApiLimitResetAt(weeklyLimit),
        extraUsageEnabled: parsed.extra_usage?.is_enabled ?? undefined,
        extraUsageLimit: parsed.extra_usage?.monthly_limit ?? undefined,
        extraUsageUsed: parsed.extra_usage?.used_credits ?? undefined,
        extraUsageUtilization: parsed.extra_usage?.utilization ?? undefined,
        extraUsageCurrency: parsed.extra_usage?.currency ?? undefined
    };

    for (const bucket of WEEKLY_MODEL_USAGE_BUCKETS) {
        const scopedLimit = findWeeklyScopedLimit(parsed.limits, bucket.modelDisplayName);
        const legacyBucket = bucket.apiBucketKey
            ? getLegacyUsageApiBucket(parsed, bucket.apiBucketKey)
            : undefined;

        // weekly_scoped is authoritative per field. Legacy flat buckets remain
        // a fallback for models/API versions that still populate them.
        setUsageField(
            result,
            bucket.usageField,
            getUsageApiLimitPercent(scopedLimit) ?? getUsageApiBucketUtilization(legacyBucket)
        );
        setUsageField(
            result,
            bucket.resetField,
            getUsageApiLimitResetAt(scopedLimit) ?? legacyBucket?.resets_at ?? undefined
        );
    }

    return result;
}

// Memory caches
let cachedUsageData: UsageData | null = null;
let usageCacheTime = 0;
let usageErrorCacheMaxAge = LOCK_MAX_AGE;
// When the usage API sent cachedUsageData's values, in ms: a cache file's are
// as old as the file, which may have been written hours ago
let usageFetchedAtMs: number | undefined;
// The last good cache each time getStaleUsageOrError serves it after it has
// outlived a refresh, because the usage API couldn't be reached. Like a fresh
// answer, it carries no error.
const staleUsageFallbacks = new WeakSet<UsageData>();

/** Whether fetchUsageData returned this data as a stale fallback that lags the usage API, rather than from the API or a current cache. */
export function isStaleUsageFallback(data: UsageData): boolean {
    return staleUsageFallbacks.has(data);
}

type UsageLockError = z.infer<typeof UsageLockErrorSchema>;

type UsageApiFetchResult = { kind: 'success'; body: string } | { kind: 'rate-limited'; retryAfterSeconds: number } | { kind: 'error'; transient: boolean };

type MacKeychainSecretResult = { kind: 'found'; secret: string }
    | { kind: 'miss' }
    | { kind: 'timeout' };

type MacKeychainCredentialResult = { kind: 'found'; credentials: UsageCredentials }
    | { kind: 'miss' }
    | { kind: 'timeout' };

function ensureCacheDirExists(): void {
    const cacheDir = getWritableCacheDir();
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
}

function setCachedUsageError(error: UsageError, now: number, maxAge = LOCK_MAX_AGE, transient = false): UsageData {
    const errorData: UsageData = transient ? { error, errorTransient: true } : { error };
    cachedUsageData = errorData;
    usageCacheTime = now;
    usageErrorCacheMaxAge = maxAge;
    usageFetchedAtMs = undefined;
    return errorData;
}

function cacheUsageData(data: UsageData, now: number, fetchedAtMs: number): UsageData {
    cachedUsageData = data;
    usageCacheTime = now;
    usageErrorCacheMaxAge = LOCK_MAX_AGE;
    usageFetchedAtMs = fetchedAtMs;
    return data;
}

/**
 * When the usage API sent the values fetchUsageData last returned, in ms, or
 * undefined when no usage data is available. Served from the cache during a rate limit,
 * they can be hours old.
 */
export function getUsageFetchedAtMs(): number | undefined {
    return usageFetchedAtMs;
}

function hasRequiredUsageField(data: UsageData, field: UsageDataField): boolean {
    if (data[field] !== undefined) {
        return true;
    }

    const windowSentinel = WINDOW_RESET_FIELD_SENTINELS[field];
    if (windowSentinel !== undefined && data[windowSentinel] !== undefined) {
        return true;
    }

    // Once the API has reported the extra usage state, missing detail fields are
    // conclusive: accounts without a configured monthly limit never report
    // monthly_limit/utilization, so refetching cannot produce them (#413).
    if (data.extraUsageEnabled !== undefined && EXTRA_USAGE_DETAIL_FIELDS.has(field)) {
        return true;
    }

    // Once the API has reported the core usage state, a missing fable window is
    // conclusive: legacy accounts and non-Fable plans never report a fable
    // limit, so refetching cannot produce it.
    return (data.sessionUsage !== undefined || data.weeklyUsage !== undefined) && FABLE_USAGE_FIELDS.has(field);
}

function hasRequiredUsageFields(data: UsageData, requiredFields: readonly UsageDataField[] = []): boolean {
    return requiredFields.every(field => hasRequiredUsageField(data, field));
}

// Whether the statusline payload shows a 5-hour or weekly window that began
// after this usage API answer was given: the payload ends that window more
// than PAYLOAD_RESET_TOLERANCE later than the answer does. Only a later end
// counts: a session idle since before a reset keeps showing the window of its
// last request, while another session may already have fetched the new one.
// A window that either side gives no end for isn't compared.
function predatesPayloadReset(data: UsageData, payloadResetAt: PayloadResetAt | undefined): boolean {
    return PAYLOAD_RESET_FIELDS.some((field) => {
        const payloadResetMs = Date.parse(payloadResetAt?.[field] ?? '');
        const answerResetMs = Date.parse(data[field] ?? '');
        if (Number.isNaN(payloadResetMs) || Number.isNaN(answerResetMs)) {
            return false;
        }
        return payloadResetMs - answerResetMs > PAYLOAD_RESET_TOLERANCE * 1000;
    });
}

// Whether a usage API answer can stand in for a new request: it holds every
// field the caller needs, and the statusline payload shows no reset since.
function answersUsageRequest(data: UsageData, options: FetchUsageDataOptions): boolean {
    return hasRequiredUsageFields(data, options.requiredFields)
        && !predatesPayloadReset(data, options.payloadResetAt);
}

function getStaleUsageOrError(
    error: UsageError,
    now: number,
    cacheIdentity: UsageCacheIdentity | null,
    errorCacheMaxAge = LOCK_MAX_AGE,
    requiredFields: readonly UsageDataField[] = [],
    transient = false
): UsageData {
    const stale = readStaleUsageCache(cacheIdentity, now);
    if (stale && !stale.data.error) {
        const complete = hasRequiredUsageFields(stale.data, requiredFields);
        if (complete || requiredFields.some(field => hasRequiredUsageField(stale.data, field))) {
            // Widgets share this response: an expired window must not discard
            // another widget's valid fields. Only missing fields use the error.
            const data = complete ? stale.data : { ...stale.data, error };
            if (hasUsageCacheOutlivedRefresh(now)) {
                staleUsageFallbacks.add(data);
            }
            return cacheUsageData(data, now, stale.fetchedAtMs);
        }
    }

    return setCachedUsageError(error, now, errorCacheMaxAge, transient);
}

function isExecFileTimeoutError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ETIMEDOUT';
}

function readMacKeychainSecret(service: string, account?: string): MacKeychainSecretResult {
    try {
        const args = account
            ? ['find-generic-password', '-s', service, '-a', account, '-w']
            : ['find-generic-password', '-s', service, '-w'];
        const secret = execFileSync(
            'security',
            args,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: MACOS_SECURITY_TIMEOUT_MS, windowsHide: true }
        ).trim();
        return { kind: 'found', secret };
    } catch (error) {
        return { kind: isExecFileTimeoutError(error) ? 'timeout' : 'miss' };
    }
}

function readUsageCredentialsFromMacKeychainService(service: string, account?: string): MacKeychainCredentialResult {
    const result = readMacKeychainSecret(service, account);
    if (result.kind !== 'found') {
        return result;
    }

    const credentials = result.secret ? parseUsageCredentials(result.secret) : null;
    return credentials ? { kind: 'found', credentials } : { kind: 'miss' };
}

function getOsUsername(): string | null {
    try {
        return os.userInfo().username;
    } catch {
        return null;
    }
}

// The login keychain can hold several items under one service, differing only by
// account; a service-only lookup returns whichever matches first, which may be an
// entry lacking `claudeAiOauth`. Claude Code reads/writes with an explicit account
// (the OS username), so mirror that.
function readUsageCredentialsFromMacKeychainUserAccount(service: string): MacKeychainCredentialResult {
    const osUsername = getOsUsername();
    return osUsername ? readUsageCredentialsFromMacKeychainService(service, osUsername) : { kind: 'miss' };
}

function readUsageCredentialsFromCredentialsFile(): UsageCredentials | null {
    try {
        const credFile = path.join(getClaudeConfigDir(), '.credentials.json');
        return parseUsageCredentials(fs.readFileSync(credFile, 'utf8'));
    } catch {
        return null;
    }
}

// Claude Code stores each non-default profile's credential under its own
// keychain service: the plain name plus `-<sha256(configDir)[:8]>`, added
// whenever CLAUDE_CONFIG_DIR is set. CLAUDE_SECURESTORAGE_CONFIG_DIR, when
// present, replaces the hash input (an empty value forces the plain name).
// The hash input is the raw environment value, NFC-normalized but not
// resolved — the goal is to reproduce the exact string Claude Code's own
// service-name builder hashes, not to locate a directory (#521). Returns
// null for the default profile.
export function getMacKeychainConfigDirService(): string | null {
    const rawConfigDir = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? '';
    if (rawConfigDir === '') {
        return null;
    }

    const configDir = rawConfigDir.normalize('NFC');
    const suffix = createHash('sha256').update(configDir).digest('hex').slice(0, 8);
    return `${MACOS_USAGE_CREDENTIALS_SERVICE}-${suffix}`;
}

export function getUsageCredentials(): UsageCredentials | null {
    if (process.platform !== 'darwin') {
        return readUsageCredentialsFromCredentialsFile();
    }

    // Every profile, the default one included, owns exactly one keychain
    // service name, the only one Claude Code reads for it. On a miss, the
    // remaining "Claude Code-credentials" items belong to other profiles (or
    // hold only MCP tokens), so fall through only to the profile's own
    // .credentials.json, Claude Code's fallback store, rather than surface
    // another account's usage.
    const configDirService = getMacKeychainConfigDirService();
    const result = readUsageCredentialsFromMacKeychainService(configDirService ?? MACOS_USAGE_CREDENTIALS_SERVICE);
    if (result.kind === 'found') {
        return result.credentials;
    }

    // The default service can hold several items that differ only by account,
    // and Claude Code's own is under the OS username. A timeout skips the retry.
    if (configDirService === null && result.kind === 'miss') {
        const accountResult = readUsageCredentialsFromMacKeychainUserAccount(MACOS_USAGE_CREDENTIALS_SERVICE);
        if (accountResult.kind === 'found') {
            return accountResult.credentials;
        }
    }

    return readUsageCredentialsFromCredentialsFile();
}

export function getUsageToken(): string | null {
    return getUsageCredentials()?.accessToken ?? null;
}

// A lookup that finds no OAuth login (an API-key user, a logged-out profile)
// stands for LOCK_MAX_AGE across renders, as it already does within one
// process: on macOS every lookup spawns `security`, the default profile's up
// to twice. The record names the credential stores it covers, so one
// profile's miss never suppresses another profile's lookup.
const NoCredentialsLockSchema = z.object({
    blockedUntil: z.number(),
    source: z.string()
});

function getUsageCredentialsSource(): string {
    return JSON.stringify([getMacKeychainConfigDirService(), getClaudeConfigDir()]);
}

function getUsageCredentialsWithBackoff(now: number): UsageCredentials | null {
    const source = getUsageCredentialsSource();
    try {
        const lock = parseJsonWithSchema(fs.readFileSync(getUsageFilePath('credentials.lock'), 'utf8'), NoCredentialsLockSchema);
        // Bounded like the usage lock, so a deadline written before the clock
        // was set back cannot stretch the backoff.
        if (lock?.source === source && lock.blockedUntil > now && lock.blockedUntil <= now + LOCK_MAX_AGE) {
            return null;
        }
    } catch {
        // No recorded miss - look the credentials up
    }

    const credentials = getUsageCredentials();
    if (!credentials) {
        try {
            ensureCacheDirExists();
            replaceFileSync(getUsageFilePath('credentials.lock'), JSON.stringify({ blockedUntil: now + LOCK_MAX_AGE, source }));
        } catch {
            // Ignore lock file errors
        }
    }

    return credentials;
}

// A stale cache can outlive its windows (overnight, while the API keeps
// failing). A window whose reset has passed no longer has that usage, so its
// usage and reset are left out rather than shown, as Claude Code drops a
// window from rate_limits once its resets_at passes.
function dropResetWindows(data: UsageData, now: number): UsageData {
    const result: UsageData = { ...data };
    for (const [resetField, usageField] of Object.entries(WINDOW_RESET_FIELD_SENTINELS)) {
        const resetAt = result[resetField as UsageDataField];
        if (typeof resetAt === 'string' && Date.parse(resetAt) <= now * 1000) {
            setUsageField(result, resetField as UsageDataField, undefined);
            setUsageField(result, usageField, undefined);
        }
    }
    return result;
}

/**
 * The login whose usage the status line shows: the usage cache's fingerprint
 * of it (see getUsageCacheIdentity), or null with no OAuth login found. It
 * stays the same across access-token refreshes, and changes with /login.
 */
export function getUsageLoginFingerprint(): string | null {
    const credentials = getUsageCredentialsWithBackoff(Math.floor(Date.now() / 1000));
    return credentials ? getUsageCacheIdentity(credentials).preferredHash : null;
}

function readStaleUsageCache(cacheIdentity: UsageCacheIdentity | null, now: number): { data: UsageData; fetchedAtMs: number } | null {
    try {
        const fetchedAtMs = fs.statSync(getUsageFilePath('json')).mtimeMs;
        const rawCache = fs.readFileSync(getUsageFilePath('json'), 'utf8');
        if (!tokenHashMatches(readCachedTokenHash(rawCache), cacheIdentity)) {
            return null;
        }
        const data = parseCachedUsageData(rawCache);
        return data ? { data: dropResetWindows(data, now), fetchedAtMs } : null;
    } catch {
        return null;
    }
}

// A refresh started as the cache expired keeps its in-flight lock, which a
// failed request also leaves in place, for up to LOCK_MAX_AGE, and other
// renders serve the cache through it meanwhile. Only a cache older than that
// has outlived a refresh.
function hasUsageCacheOutlivedRefresh(now: number): boolean {
    try {
        const fileAge = now - Math.floor(fs.statSync(getUsageFilePath('json')).mtimeMs / 1000);
        return Math.abs(fileAge) >= CACHE_MAX_AGE + LOCK_MAX_AGE;
    } catch {
        return true;
    }
}

function writeUsageLock(blockedUntil: number, error: UsageLockError, transient = false): string {
    const contents = JSON.stringify(transient ? { blockedUntil, error, transient } : { blockedUntil, error });
    try {
        ensureCacheDirExists();
        replaceFileSync(getUsageFilePath('lock'), contents);
    } catch {
        // Ignore lock file errors
    }
    return contents;
}

// Remove the lock only while it still holds the in-flight record this process
// wrote. A concurrent render may have replaced it with a 429 Retry-After lock
// in the meantime; deleting that would let the next render fetch inside the
// server's backoff window.
function clearOwnUsageLock(ownContents: string): void {
    try {
        if (fs.readFileSync(getUsageFilePath('lock'), 'utf8') === ownContents) {
            fs.rmSync(getUsageFilePath('lock'), { force: true });
        }
    } catch {
        // Ignore lock file errors
    }
}

// Swap the in-flight record this process wrote for a failed request's own
// backoff, so later renders report that failure, and whether it clears up on
// its own, rather than a timeout. As above, a concurrent render's newer lock
// is left in place.
function replaceOwnUsageLock(ownContents: string, blockedUntil: number, error: UsageLockError, transient: boolean): void {
    try {
        if (fs.readFileSync(getUsageFilePath('lock'), 'utf8') === ownContents) {
            writeUsageLock(blockedUntil, error, transient);
        }
    } catch {
        // Ignore lock file errors
    }
}

// How far ahead of now each kind of lock may be dated. Only a 429's
// Retry-After outlasts LOCK_MAX_AGE. Any other lock still counts up to one
// backoff beyond its own, since a concurrent render may have written it
// after this one read the clock. Dated further ahead, it was written under a
// clock since set back, and would block fetching for as long as the clock
// had been fast.
function getUsageLockHorizon(error: UsageLockError): number {
    return error === 'rate-limited' ? MAX_LOCK_HORIZON : 2 * LOCK_MAX_AGE;
}

function readActiveUsageLock(now: number): { blockedUntil: number; error: UsageLockError; transient: boolean } | null {
    let hasValidJsonLock = false;

    try {
        const parsed = parseJsonWithSchema(fs.readFileSync(getUsageFilePath('lock'), 'utf8'), UsageLockSchema);
        if (parsed) {
            hasValidJsonLock = true;
            const error = parsed.error ?? 'timeout';
            // Past deadline, or one implausibly far ahead: treat as no lock and
            // fetch. The fetch rewrites the file with a sane deadline, so a
            // poisoned lock self-heals on the very next render.
            if (parsed.blockedUntil > now && parsed.blockedUntil <= now + getUsageLockHorizon(error)) {
                return {
                    blockedUntil: parsed.blockedUntil,
                    error,
                    transient: parsed.transient ?? false
                };
            }
            return null;
        }
    } catch {
        // Fall back to the legacy mtime-based lock behavior below.
    }

    if (hasValidJsonLock) {
        return null;
    }

    try {
        const lockStat = fs.statSync(getUsageFilePath('lock'));
        const lockMtime = Math.floor(lockStat.mtimeMs / 1000);
        const blockedUntil = lockMtime + LOCK_MAX_AGE;
        if (blockedUntil > now && blockedUntil <= now + getUsageLockHorizon('timeout')) {
            return {
                blockedUntil,
                error: 'timeout',
                transient: false
            };
        }
    } catch {
        // Lock file doesn't exist - OK to proceed
    }

    return null;
}

function parseRetryAfterSeconds(headerValue: string | string[] | undefined, nowMs = Date.now()): number | null {
    const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const trimmedValue = rawValue?.trim();
    if (!trimmedValue) {
        return null;
    }

    if (/^\d+$/.test(trimmedValue)) {
        const seconds = Number.parseInt(trimmedValue, 10);
        return seconds > 0 ? seconds : null;
    }

    const retryAtMs = Date.parse(trimmedValue);
    if (Number.isNaN(retryAtMs)) {
        return null;
    }

    const retryAfterSeconds = Math.ceil((retryAtMs - nowMs) / 1000);
    return retryAfterSeconds > 0 ? retryAfterSeconds : null;
}

const USAGE_API_HOST = 'api.anthropic.com';
const USAGE_API_PATH = '/api/oauth/usage';
const PROFILE_API_PATH = '/api/oauth/profile';
const USAGE_API_TIMEOUT_MS = 5000;

// A 5xx is the server failing, and clears up once it recovers. A 408 is a
// server that gave up waiting for the request, which a later try may well
// get through in time. Any other answer refuses the request itself: a 401 or
// 403 for a token the API rejects, a 407 from a proxy that wants its own
// login, a 404 for an endpoint that moved, or a 200 with nothing in it.
// Every render sends the same request, so it is refused again until the
// login or the setup changes.
function isTransientUsageApiStatus(statusCode: number | undefined): boolean {
    return statusCode !== undefined && (statusCode === 408 || statusCode >= 500);
}

// A server certificate the runtime can't verify, or one issued for another
// host. Behind a proxy or firewall that intercepts TLS with a certificate the
// runtime doesn't trust, every request fails this way until the runtime is
// set up to trust it. Node and Bun report these codes, directly and through a
// proxy's tunnel: a self-signed certificate, one from an unknown CA (alone,
// with its root, or with an intermediate but not the root), one whose
// intermediate is trusted but not its root, one signed by a certificate that
// isn't a CA, an expired or not-yet-valid one, and one for another host.
// UNSPECIFIED is both runtimes' code for a certificate that fails
// verification for a reason with no name of its own, and they give it to
// nothing else. Node reports it for a CA whose key usage leaves out signing
// certificates, a leaf key that's too weak and a SHA-1 signature. The rest of
// the verification error names both runtimes can report are here too, except
// OUT_OF_MEM, which isn't about the certificate. Every other request error is
// a network failure that may clear up by the next render.
const LASTING_REQUEST_ERROR_CODES = new Set([
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'UNABLE_TO_GET_ISSUER_CERT',
    'INVALID_PURPOSE',
    'CERT_HAS_EXPIRED',
    'CERT_NOT_YET_VALID',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'UNSPECIFIED',
    'UNABLE_TO_GET_CRL',
    'UNABLE_TO_DECRYPT_CERT_SIGNATURE',
    'UNABLE_TO_DECRYPT_CRL_SIGNATURE',
    'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY',
    'CERT_SIGNATURE_FAILURE',
    'CRL_SIGNATURE_FAILURE',
    'CRL_NOT_YET_VALID',
    'CRL_HAS_EXPIRED',
    'ERROR_IN_CERT_NOT_BEFORE_FIELD',
    'ERROR_IN_CERT_NOT_AFTER_FIELD',
    'ERROR_IN_CRL_LAST_UPDATE_FIELD',
    'ERROR_IN_CRL_NEXT_UPDATE_FIELD',
    'CERT_CHAIN_TOO_LONG',
    'CERT_REVOKED',
    'INVALID_CA',
    'PATH_LENGTH_EXCEEDED',
    'CERT_UNTRUSTED',
    'CERT_REJECTED',
    'HOSTNAME_MISMATCH'
]);

function isLastingRequestError(error: NodeJS.ErrnoException | undefined): boolean {
    return error?.code !== undefined && LASTING_REQUEST_ERROR_CODES.has(error.code);
}

function getUsageApiProxyUrl(): string | null {
    const proxyUrl = process.env.HTTPS_PROXY?.trim();
    if (proxyUrl === '' || isExcludedFromProxy(USAGE_API_HOST)) {
        return null;
    }

    return proxyUrl ?? null;
}

function getUsageApiRequest(token: string, apiPath: string): { options: https.RequestOptions; proxy: ClosableProxyAgent | null } | null {
    const proxyUrl = getUsageApiProxyUrl();

    try {
        const proxy = proxyUrl ? createProxyAgent(proxyUrl) : null;
        return {
            options: {
                hostname: USAGE_API_HOST,
                path: apiPath,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'anthropic-beta': 'oauth-2025-04-20'
                },
                timeout: USAGE_API_TIMEOUT_MS,
                ...(proxy ? { agent: proxy.agent } : {})
            },
            proxy
        };
    } catch {
        return null;
    }
}

async function fetchFromUsageApi(token: string, deadlineMs = USAGE_API_TIMEOUT_MS, apiPath = USAGE_API_PATH): Promise<UsageApiFetchResult> {
    const usageRequest = getUsageApiRequest(token, apiPath);
    if (!usageRequest) {
        // A proxy setting that can't be used stays that way until it's changed
        return { kind: 'error', transient: false };
    }

    return new Promise((resolve) => {
        let settled = false;
        let answeredStatus: number | undefined;

        const finish = (value: UsageApiFetchResult) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(deadline);
            resolve(value);
        };
        // No answer, or one cut short: the network or the server may well be
        // back by the next try, unless the server's certificate doesn't
        // verify. A failure after an answer that refused the request is still
        // that refusal: under Bun, a proxy's refused CONNECT fails the request
        // before the agent's replay of that answer ends.
        const failRequest = (error?: NodeJS.ErrnoException) => {
            const refused = answeredStatus !== undefined
                && answeredStatus !== 200
                && answeredStatus !== 429
                && !isTransientUsageApiStatus(answeredStatus);
            finish({ kind: 'error', transient: !refused && !isLastingRequestError(error) });
        };

        const request = https.request(usageRequest.options, (response) => {
            answeredStatus = response.statusCode;
            let data = '';
            response.setEncoding('utf8');

            response.on('data', (chunk: string) => {
                data += chunk;
            });

            response.on('end', () => {
                if (response.statusCode === 200 && data) {
                    finish({ kind: 'success', body: data });
                    return;
                }

                if (response.statusCode === 429) {
                    finish({
                        kind: 'rate-limited',
                        retryAfterSeconds: parseRetryAfterSeconds(response.headers['retry-after']) ?? DEFAULT_RATE_LIMIT_BACKOFF
                    });
                    return;
                }

                finish({ kind: 'error', transient: isTransientUsageApiStatus(response.statusCode) });
            });
            // A connection dropped mid-body ends neither the response nor the
            // request, and the idle timeout can't fire on a closed socket
            response.on('aborted', failRequest);
            response.on('error', failRequest);
        });

        request.on('error', failRequest);
        request.on('timeout', () => {
            request.destroy();
            failRequest();
        });
        // `timeout` only covers an idle socket, and behind a proxy the request
        // has none until the proxy answers CONNECT
        const deadline = setTimeout(() => {
            request.destroy();
            usageRequest.proxy?.close();
            failRequest();
        }, deadlineMs);
        request.end();
    });
}

// The fingerprint of the login fetchUsageData last resolved, so per-login
// state outside the usage cache (today's spend) stays with that login.
let lastUsageAccountKey: string | null = null;
// That login's credentials, which lookUpUsageAccount asks about.
let lastUsageCredentials: UsageCredentials | null = null;

/** The token fingerprint of the login the last usage fetch used, or null when none was found. */
export function getUsageAccountKey(): string | null {
    return lastUsageAccountKey;
}

export async function fetchUsageData(options: FetchUsageDataOptions = {}): Promise<UsageData> {
    const now = Math.floor(Date.now() / 1000);
    const requiredFields = options.requiredFields ?? [];

    // Check memory cache (fast path)
    if (cachedUsageData) {
        const cacheAge = now - usageCacheTime;
        if (!cachedUsageData.error && cacheAge < CACHE_MAX_AGE && answersUsageRequest(cachedUsageData, options)) {
            return cachedUsageData;
        }
        if (cachedUsageData.error && cacheAge < usageErrorCacheMaxAge) {
            return cachedUsageData;
        }
    }

    // Resolve the credentials up front (before lock/rate-limit checks so auth
    // failures are not masked as timeout) and fingerprint them so the file cache
    // can be invalidated on an account switch: a different login, written by a
    // logout/login, no longer matches the cached fingerprint.
    const credentials = getUsageCredentialsWithBackoff(now);
    const token = credentials?.accessToken ?? null;
    const cacheIdentity = credentials ? getUsageCacheIdentity(credentials) : null;
    lastUsageAccountKey = cacheIdentity?.preferredHash ?? null;
    lastUsageCredentials = credentials;

    // Check file cache
    try {
        const stat = fs.statSync(getUsageFilePath('json'));
        const fileAge = now - Math.floor(stat.mtimeMs / 1000);
        // A file dated ahead of now still counts within one cache lifetime: a
        // concurrent render may have written it after this one read the clock.
        // Further ahead, it was written under a clock since set back, and
        // trusting it would keep that data on screen until real time caught up.
        if (Math.abs(fileAge) < CACHE_MAX_AGE) {
            const rawCache = fs.readFileSync(getUsageFilePath('json'), 'utf8');
            const fileData = parseCachedUsageData(rawCache);
            if (fileData && !fileData.error
                && tokenHashMatches(readCachedTokenHash(rawCache), cacheIdentity)
                && answersUsageRequest(fileData, options)) {
                return cacheUsageData(fileData, now, stat.mtimeMs);
            }
        }
    } catch {
        // File doesn't exist or read error - continue to API call
    }

    if (!token) {
        return getStaleUsageOrError('no-credentials', now, cacheIdentity, LOCK_MAX_AGE, requiredFields);
    }

    const activeLock = readActiveUsageLock(now);
    if (activeLock) {
        return getStaleUsageOrError(
            activeLock.error,
            now,
            cacheIdentity,
            Math.max(1, activeLock.blockedUntil - now),
            requiredFields,
            activeLock.transient
        );
    }

    const inFlightLock = writeUsageLock(now + LOCK_MAX_AGE, 'timeout');

    // Fetch from API using Node's https module
    try {
        const response = await fetchFromUsageApi(token);

        if (response.kind === 'rate-limited') {
            writeUsageLock(now + response.retryAfterSeconds, 'rate-limited');
            return getStaleUsageOrError('rate-limited', now, cacheIdentity, response.retryAfterSeconds, requiredFields);
        }

        if (response.kind === 'error') {
            replaceOwnUsageLock(inFlightLock, now + LOCK_MAX_AGE, 'api-error', response.transient);
            return getStaleUsageOrError('api-error', now, cacheIdentity, LOCK_MAX_AGE, requiredFields, response.transient);
        }

        const usageData = parseUsageApiResponse(response.body);
        if (!usageData) {
            writeUsageLock(now + LOCK_MAX_AGE, 'parse-error');
            return getStaleUsageOrError('parse-error', now, cacheIdentity, LOCK_MAX_AGE, requiredFields);
        }

        // Validate we got actual data
        if (usageData.sessionUsage === undefined && usageData.weeklyUsage === undefined) {
            writeUsageLock(now + LOCK_MAX_AGE, 'parse-error');
            return getStaleUsageOrError('parse-error', now, cacheIdentity, LOCK_MAX_AGE, requiredFields);
        }

        // Save to cache
        try {
            ensureCacheDirExists();
            replaceFileSync(getUsageFilePath('json'), JSON.stringify({ ...usageData, tokenHash: cacheIdentity?.preferredHash }));
        } catch {
            // Ignore cache write errors
        }

        // Clear the in-flight lock written above only once this response satisfies
        // the caller's requested fields and shows the windows the statusline
        // payload does. Incomplete 200 responses, and ones still from before a
        // reset the payload shows, are cached but still need the short throttle
        // so later renders do not refetch every time.
        if (answersUsageRequest(usageData, options)) {
            clearOwnUsageLock(inFlightLock);
        }

        return cacheUsageData(usageData, now, Date.now());
    } catch {
        writeUsageLock(now + LOCK_MAX_AGE, 'parse-error');
        return getStaleUsageOrError('parse-error', now, cacheIdentity, LOCK_MAX_AGE, requiredFields);
    }
}

// Today's extra usage spend (daily-spend.ts) has to stay with a login for the
// whole UTC day, and the token fingerprint doesn't: Claude Code saves a new
// refresh token each time it refreshes the access token. The profile endpoint
// names the account and organization the credentials belong to, which a
// refresh doesn't change. Each fingerprint is looked up once and the answer
// kept in usage-account.json; a failed lookup holds off that fingerprint only.
const USAGE_ACCOUNT_CACHE_FILE = path.join(CACHE_DIR, 'usage-account.json');
// Each token refresh adds a fingerprint, a few a day per login; this keeps a
// few days of them for the logins used side by side.
const MAX_CACHED_USAGE_ACCOUNTS = 32;

// The fields Claude Code itself requires of this response.
const ProfileAccountIdsSchema = z.looseObject({
    account: z.looseObject({ uuid: z.string().min(1) }),
    organization: z.looseObject({ uuid: z.string().min(1) })
});
// Each entry names its fingerprint's account, or holds off that
// fingerprint's lookup until blockedUntil.
const UsageAccountEntriesSchema = z.array(z.object({
    tokenHash: z.string(),
    accountKey: z.string().min(1).optional(),
    blockedUntil: z.number().optional()
}));

type UsageAccountEntry = z.infer<typeof UsageAccountEntriesSchema>[number];

/** A login told apart by its account rather than its tokens. */
export interface UsageAccount {
    /** The same across token refreshes; another account or organization never has it. */
    key: string;
    /** The token fingerprints known to belong to it, newest first. */
    fingerprints: string[];
}

function readUsageAccountEntries(): UsageAccountEntry[] {
    try {
        return parseJsonWithSchema(fs.readFileSync(USAGE_ACCOUNT_CACHE_FILE, 'utf8'), UsageAccountEntriesSchema) ?? [];
    } catch {
        return [];
    }
}

function withUsageAccountEntry(entries: UsageAccountEntry[], entry: UsageAccountEntry): UsageAccountEntry[] {
    return [entry, ...entries.filter(existing => existing.tokenHash !== entry.tokenHash)].slice(0, MAX_CACHED_USAGE_ACCOUNTS);
}

function findUsageAccount(tokenHash: string): UsageAccount | null {
    const entries = readUsageAccountEntries();
    const accountKey = entries.find(entry => entry.tokenHash === tokenHash)?.accountKey;
    return accountKey === undefined
        ? null
        : { key: accountKey, fingerprints: entries.filter(entry => entry.accountKey === accountKey).map(entry => entry.tokenHash) };
}

// Bounded like the usage lock, so a deadline written under a wrong clock
// can't stop lookups for good.
function isUsageAccountLookupBlocked(entry: UsageAccountEntry | undefined, now: number): boolean {
    return entry?.blockedUntil !== undefined && entry.blockedUntil > now && entry.blockedUntil <= now + MAX_LOCK_HORIZON;
}

// Holds the fingerprint off before its request is sent, under the lock, so
// renders running side by side send one request between them. False when
// it's already named or held off, or the hold-off can't be recorded.
function claimUsageAccountLookup(tokenHash: string, now: number): boolean {
    let claimed = false;
    try {
        ensureCacheDirExists();
        withCacheLock(USAGE_ACCOUNT_CACHE_FILE, () => {
            const entries = readUsageAccountEntries();
            const entry = entries.find(existing => existing.tokenHash === tokenHash);
            if (entry?.accountKey === undefined && !isUsageAccountLookupBlocked(entry, now)) {
                fs.writeFileSync(USAGE_ACCOUNT_CACHE_FILE, JSON.stringify(withUsageAccountEntry(entries, { tokenHash, blockedUntil: now + LOCK_MAX_AGE })));
                claimed = true;
            }
        });
    } catch {
        // Not recorded, so not sent either
    }
    return claimed;
}

function storeUsageAccountEntry(entry: UsageAccountEntry): void {
    try {
        withCacheLock(USAGE_ACCOUNT_CACHE_FILE, () => {
            fs.writeFileSync(USAGE_ACCOUNT_CACHE_FILE, JSON.stringify(withUsageAccountEntry(readUsageAccountEntries(), entry)));
        });
    } catch {
        // The hold-off from the claim stays, and the lookup is repeated after it
    }
}

// Claude Code records the signed-in account in .claude.json (oauthAccount)
// at login and does not rewrite it when the credentials change underneath, so
// that record can name a different account than the one the credentials, and
// the usage above, belong to (#538). The profile endpoint answers for the
// credentials themselves.
// Read the old shared cache for existing entries, but never modify it.
const LEGACY_ACCOUNT_EMAIL_CACHE_FILE = path.join(os.homedir(), '.cache', 'ccstatusline', 'account-email.json');
// In the usage cache's folder, so the backoff holds when ~/.cache can't be written
function getAccountEmailPath(tokenHash: string, suffix: 'json' | 'lock' | 'inflight'): string {
    return path.join(getWritableCacheDir(), `account-email-${tokenHash}.${suffix}`);
}

const ProfileApiResponseSchema = z.looseObject({ account: z.looseObject({ email: z.string().min(1).nullable().optional() }).nullable().optional() });
const CachedAccountEmailSchema = z.object({
    tokenHash: z.string(),
    email: z.string().min(1)
});
const AccountEmailLockSchema = z.object({
    blockedUntil: z.number(),
    tokenHash: z.string()
});

function readCachedAccountEmail(tokenHash: string): string | null {
    try {
        const entry = parseJsonWithSchema(fs.readFileSync(getAccountEmailPath(tokenHash, 'json'), 'utf8'), CachedAccountEmailSchema);
        if (entry?.tokenHash === tokenHash) {
            return entry.email;
        }
    } catch {
        // Try a matching entry from the previous shared cache.
    }
    try {
        const entries = parseJsonWithSchema(fs.readFileSync(LEGACY_ACCOUNT_EMAIL_CACHE_FILE, 'utf8'), z.array(CachedAccountEmailSchema));
        return entries?.find(entry => entry.tokenHash === tokenHash)?.email ?? null;
    } catch {
        return null;
    }
}

function writeCachedAccountEmail(tokenHash: string, email: string, owner: string): void {
    const cachePath = getAccountEmailPath(tokenHash, 'json');
    const tempPath = `${cachePath}.${owner}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify({ tokenHash, email }), { mode: 0o600, flag: 'wx' });
        fs.renameSync(tempPath, cachePath);
    } catch {
        // Ignore cache write errors.
    } finally {
        try {
            fs.unlinkSync(tempPath);
        } catch {
            // Already renamed or never created.
        }
    }
}

// Hold an exclusive lease across the request and its cache/backoff writes.
// A crashed render cannot block future lookups indefinitely. The lease is
// longer than the five-second request deadline; an expired owner cannot write.
const AccountEmailLeaseSchema = z.object({ owner: z.string(), expiresAt: z.number() });
function acquireAccountEmailLease(tokenHash: string, now: number): string | null {
    const leasePath = getAccountEmailPath(tokenHash, 'inflight');
    const owner = randomBytes(16).toString('hex');
    try {
        ensureCacheDirExists();
        try {
            const existing = fs.readFileSync(leasePath, 'utf8');
            const lease = parseJsonWithSchema(existing, AccountEmailLeaseSchema);
            const stale = lease
                ? lease.expiresAt <= now || lease.expiresAt > now + LOCK_MAX_AGE
                : Math.abs(now - fs.statSync(leasePath).mtimeMs / 1000) > LOCK_MAX_AGE;
            if (stale) {
                fs.unlinkSync(leasePath);
            }
        } catch {
            // Missing lease: exclusive creation below arbitrates contenders.
        }
        fs.writeFileSync(leasePath, JSON.stringify({ owner, expiresAt: now + LOCK_MAX_AGE }), { flag: 'wx', mode: 0o600 });
        return owner;
    } catch {
        return null;
    }
}

function ownsAccountEmailLease(tokenHash: string, owner: string): boolean {
    try {
        const lease = parseJsonWithSchema(fs.readFileSync(getAccountEmailPath(tokenHash, 'inflight'), 'utf8'), AccountEmailLeaseSchema);
        return lease?.owner === owner && lease.expiresAt > Math.floor(Date.now() / 1000);
    } catch {
        return false;
    }
}

function releaseAccountEmailLease(tokenHash: string, owner: string): void {
    try {
        if (ownsAccountEmailLease(tokenHash, owner)) {
            fs.unlinkSync(getAccountEmailPath(tokenHash, 'inflight'));
        }
    } catch {
        // Best-effort cleanup; an abandoned lease expires.
    }
}

// A failed lookup holds off only the login it failed for. The deadline is
// bounded like the usage lock's, so one written under a wrong clock cannot
// stop lookups for good.
function readAccountEmailBackoff(tokenHash: string, now: number): number {
    try {
        const lock = parseJsonWithSchema(fs.readFileSync(getAccountEmailPath(tokenHash, 'lock'), 'utf8'), AccountEmailLockSchema);
        return lock?.tokenHash === tokenHash && lock.blockedUntil > now && lock.blockedUntil <= now + MAX_LOCK_HORIZON
            ? lock.blockedUntil
            : 0;
    } catch {
        return 0;
    }
}

function writeAccountEmailLock(tokenHash: string, blockedUntil: number): void {
    try {
        ensureCacheDirExists();
        const deadline = Math.max(blockedUntil, readAccountEmailBackoff(tokenHash, Math.floor(Date.now() / 1000)));
        replaceFileSync(getAccountEmailPath(tokenHash, 'lock'), JSON.stringify({ blockedUntil: deadline, tokenHash }));
    } catch {
        // Ignore lock file errors
    }
}

/**
 * The account and organization the last usage fetch's credentials belong to,
 * or null without credentials or while the lookup fails. Asks the profile
 * endpoint at most once per token fingerprint per backoff: 30 seconds after a
 * failure, or a 429's Retry-After, up to a day.
 */
export async function lookUpUsageAccount(): Promise<UsageAccount | null> {
    const credentials = lastUsageCredentials;
    const tokenHash = lastUsageAccountKey;
    if (!credentials || tokenHash === null) {
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const cached = findUsageAccount(tokenHash);
    if (cached || !claimUsageAccountLookup(tokenHash, now)) {
        // Another render may have just named it
        return cached ?? findUsageAccount(tokenHash);
    }

    const response = await fetchFromUsageApi(credentials.accessToken, USAGE_API_TIMEOUT_MS, PROFILE_API_PATH)
        .catch((): UsageApiFetchResult => ({ kind: 'error' }));
    const profile = response.kind === 'success' ? parseJsonWithSchema(response.body, ProfileAccountIdsSchema) : null;
    if (!profile) {
        // Kept within the horizon isUsageAccountLookupBlocked trusts, or a
        // Retry-After further off would be read back as no backoff at all
        storeUsageAccountEntry({
            tokenHash,
            blockedUntil: now + (response.kind === 'rate-limited' ? Math.min(response.retryAfterSeconds, MAX_LOCK_HORIZON) : LOCK_MAX_AGE)
        });
        return null;
    }

    // Fingerprinted like the tokens, so neither cache file names the account
    const accountId = `${profile.organization.uuid}/${profile.account.uuid}`;
    const accountKey = `account:${fingerprintUsageToken(accountId)}`;
    storeUsageAccountEntry({ tokenHash, accountKey });
    return findUsageAccount(tokenHash) ?? { key: accountKey, fingerprints: [tokenHash] };
}

/**
 * Distinguish no OAuth login from a failed lookup for an existing login so
 * the widget never substitutes an unverified account snapshot after failure.
 * Successful answers are cached per login across access-token refreshes.
 */
export async function fetchAccountEmail(): Promise<AccountEmailResult> {
    const now = Math.floor(Date.now() / 1000);
    const credentials = getUsageCredentialsWithBackoff(now);
    if (!credentials) {
        return { status: 'no-credentials' };
    }

    // Keyed like the usage cache: a refreshed access token keeps the entry,
    // and a different login is looked up again.
    const tokenHash = getUsageCacheIdentity(credentials).preferredHash;
    const cached = readCachedAccountEmail(tokenHash);
    if (cached !== null) {
        return { status: 'available', email: cached };
    }

    if (readAccountEmailBackoff(tokenHash, now)) {
        return { status: 'unavailable' };
    }
    const owner = acquireAccountEmailLease(tokenHash, now);
    if (owner === null) {
        return { status: 'unavailable' };
    }

    try {
        // Another render may have finished between our first read and lease.
        const latest = readCachedAccountEmail(tokenHash);
        if (latest !== null) {
            return { status: 'available', email: latest };
        }
        if (readAccountEmailBackoff(tokenHash, Math.floor(Date.now() / 1000))) {
            return { status: 'unavailable' };
        }
        const response = await fetchFromUsageApi(credentials.accessToken, USAGE_API_TIMEOUT_MS, PROFILE_API_PATH)
            .catch((): UsageApiFetchResult => ({ kind: 'error', transient: false }));
        if (!ownsAccountEmailLease(tokenHash, owner)) {
            return { status: 'unavailable' };
        }
        const email = response.kind === 'success'
            ? parseJsonWithSchema(response.body, ProfileApiResponseSchema)?.account?.email ?? null
            : null;
        if (email === null) {
            const responseTime = Math.floor(Date.now() / 1000);
            writeAccountEmailLock(tokenHash, responseTime + (response.kind === 'rate-limited' ? response.retryAfterSeconds : LOCK_MAX_AGE));
            return { status: 'unavailable' };
        }

        writeCachedAccountEmail(tokenHash, email, owner);
        return { status: 'available', email };
    } finally {
        releaseAccountEmailLease(tokenHash, owner);
    }
}
