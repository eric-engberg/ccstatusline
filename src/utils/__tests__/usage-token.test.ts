import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Mock } from 'vitest';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import * as claudeSettings from '../claude-settings';
import {
    getMacKeychainConfigDirService,
    getUsageCredentials,
    getUsageLoginFingerprint,
    getUsageToken
} from '../usage-fetch';

vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const CREDENTIALS_FILE = path.join('/fake/claude', '.credentials.json');
const mockedExecFileSync = execFileSync as unknown as Mock;
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
const ORIGINAL_SECURESTORAGE_CONFIG_DIR = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
const ORIGINAL_USER = process.env.USER;
// Claude Code saves its login under the account USER names
const FIND_DEFAULT_ITEM = 'find-generic-password -s Claude Code-credentials -a example -w';
const FIND_ANY_DEFAULT_ITEM = 'find-generic-password -s Claude Code-credentials -w';

// The config-dir lookup keys off these variables, so every test starts from
// the default (unset) profile regardless of the environment running the suite.
beforeEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
    process.env.USER = 'example';
});

afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
    delete process.env.USER;
    if (ORIGINAL_CLAUDE_CONFIG_DIR !== undefined) {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
    if (ORIGINAL_SECURESTORAGE_CONFIG_DIR !== undefined) {
        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = ORIGINAL_SECURESTORAGE_CONFIG_DIR;
    }
    if (ORIGINAL_USER !== undefined) {
        process.env.USER = ORIGINAL_USER;
    }
});

function makeConfigDirService(configDir: string): string {
    return `Claude Code-credentials-${createHash('sha256').update(configDir).digest('hex').slice(0, 8)}`;
}

// `security` exits 44 (errSecItemNotFound) for an item that isn't there
function makeMissingItemError(): Error {
    return Object.assign(new Error('The specified item could not be found in the keychain.'), { status: 44 });
}

function makeTokenPayload(token: string, refreshToken?: string): string {
    return JSON.stringify({ claudeAiOauth: { accessToken: token, refreshToken } });
}

function makeExecFileTimeoutError(): Error & { code: string } {
    return Object.assign(new Error('child process failed'), { code: 'ETIMEDOUT' });
}

function makeKeychainBlock(service: string): string {
    return [
        'keychain: "/Users/example/Library/Keychains/login.keychain-db"',
        'version: 512',
        'class: "genp"',
        'attributes:',
        `    "svce"<blob>="${service}"`,
        '    "mdat"<timedate>="20240301010101Z"'
    ].join('\n');
}

function getSecurityCallLog(): string[] {
    return mockedExecFileSync.mock.calls.map((call) => {
        const [command, args]: [string, string[] | undefined] = call as [string, string[] | undefined];

        expect(command).toBe('security');
        return Array.isArray(args) ? args.join(' ') : '';
    });
}

// A second profile, CLAUDE_CONFIG_DIR=/fake/claude-work, is logged in: the
// keychain holds its login under that profile's suffixed service and lists it
// in a dump. The default profile's plain item holds plainItem, or is missing.
function mockKeychainWithOtherProfileLogin(plainItem?: string): void {
    const otherProfileService = makeConfigDirService('/fake/claude-work');

    mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
        if (command !== 'security' || !args) {
            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        }

        if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
            if (plainItem === undefined) {
                throw makeMissingItemError();
            }

            return plainItem;
        }

        if (args[0] === 'dump-keychain') {
            return makeKeychainBlock(otherProfileService);
        }

        if (args[0] === 'find-generic-password' && args[2] === otherProfileService) {
            return makeTokenPayload('other-profile-token', 'other-profile-refresh-token');
        }

        throw new Error(`Unexpected security args: ${args.join(' ')}`);
    });
}

function mockCredentialsFile(payload?: string): void {
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
        if (filePath === CREDENTIALS_FILE) {
            if (payload === undefined) {
                throw new Error('credentials file missing');
            }

            expect(options).toBe('utf8');
            return payload;
        }

        throw new Error(`Unexpected file read: ${String(filePath)}`);
    });
}

describe('getUsageToken', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(claudeSettings, 'getClaudeConfigDir').mockReturnValue('/fake/claude');
        vi.spyOn(os, 'userInfo').mockReturnValue({ username: 'testuser' } as unknown as os.UserInfo<string>);
        mockedExecFileSync.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        mockedExecFileSync.mockReset();
    });

    it('prefers the exact macOS keychain service over the credentials file', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                return makeTokenPayload('exact-token');
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('exact-token');
        expect(getUsageToken()).toBe('exact-token');
        expect(getSecurityCallLog()).toEqual([
            FIND_DEFAULT_ITEM,
            FIND_DEFAULT_ITEM
        ]);
    });

    it('reads the item under the user\'s account, not an item without an OAuth token the service alone finds', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            const isCredentialsService = args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials';
            if (isCredentialsService && args.includes('-a') && args[args.indexOf('-a') + 1] === 'example') {
                return makeTokenPayload('account-token', 'account-refresh-token');
            }

            if (isCredentialsService) {
                // Service-only match: an unrelated account's MCP-only item.
                return JSON.stringify({ mcpOAuth: { some: 'value' } });
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageCredentials()).toEqual({
            accessToken: 'account-token',
            refreshToken: 'account-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([FIND_DEFAULT_ITEM]);
    });

    it('reads under claude-code-user when the user name can\'t be resolved, as Claude Code does', () => {
        // os.userInfo() throws when the uid has no passwd entry (some containers).
        delete process.env.USER;
        vi.spyOn(os, 'userInfo').mockImplementation(() => {
            throw new Error('no passwd entry');
        });
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                throw makeMissingItemError();
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -a claude-code-user -w',
            FIND_ANY_DEFAULT_ITEM
        ]);
    });

    it('uses the default profile\'s credentials file after an exact miss, not another profile\'s keychain item', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token', 'file-refresh-token'));
        mockKeychainWithOtherProfileLogin();

        expect(getUsageToken()).toBe('file-token');
        expect(getUsageCredentials()).toEqual({
            accessToken: 'file-token',
            refreshToken: 'file-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            FIND_DEFAULT_ITEM,
            FIND_ANY_DEFAULT_ITEM,
            FIND_DEFAULT_ITEM,
            FIND_ANY_DEFAULT_ITEM
        ]);
    });

    it('reads the item Claude Code saved under the login\'s account before another account\'s item for the service', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        // Running Claude Code as root once left root's login behind, which a
        // lookup without an account may find first
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.join(' ') === FIND_DEFAULT_ITEM) {
                return makeTokenPayload('own-token', 'own-refresh-token');
            }

            if (command === 'security' && args?.join(' ') === FIND_ANY_DEFAULT_ITEM) {
                return makeTokenPayload('root-token', 'root-refresh-token');
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('own-token');
        expect(getSecurityCallLog()).toEqual([FIND_DEFAULT_ITEM]);
    });

    it('reads the service\'s item under any account when none is saved under the login\'s, as older setups may keep it', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.join(' ') === FIND_DEFAULT_ITEM) {
                throw makeMissingItemError();
            }

            if (command === 'security' && args?.join(' ') === FIND_ANY_DEFAULT_ITEM) {
                return makeTokenPayload('older-token');
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('older-token');
        expect(getSecurityCallLog()).toEqual([FIND_DEFAULT_ITEM, FIND_ANY_DEFAULT_ITEM]);
    });

    it.each([
        ['the login name without USER', undefined, 'testuser'],
        ['the login name for an empty USER', '', 'testuser'],
        ['claude-code-user for a name with other characters', 'first last', 'claude-code-user']
    ])('names the account as Claude Code does: %s', (_label, user, account) => {
        if (user === undefined) {
            delete process.env.USER;
        } else {
            process.env.USER = user;
        }
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation(() => makeTokenPayload('own-token'));

        expect(getUsageToken()).toBe('own-token');
        expect(getSecurityCallLog()).toEqual([`find-generic-password -s Claude Code-credentials -a ${account} -w`]);
    });

    it('finds no login rather than another profile\'s when the exact item holds only MCP tokens', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockKeychainWithOtherProfileLogin(JSON.stringify({ mcpOAuth: { 'example-server': { accessToken: 'mcp-token' } } }));

        expect(getUsageCredentials()).toBeNull();
        expect(getSecurityCallLog()).toEqual([
            FIND_DEFAULT_ITEM
        ]);
    });

    it('falls back to ~/.claude/.credentials.json on macOS when the keychain item holds invalid data', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                return 'not-json';
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getUsageToken()).toBe('file-token');
        expect(getSecurityCallLog()).toEqual([
            FIND_DEFAULT_ITEM,
            FIND_DEFAULT_ITEM
        ]);
    });

    it('bounds every macOS keychain read with a timeout', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation(() => {
            throw makeMissingItemError();
        });

        expect(getUsageToken()).toBeNull();
        expect(getSecurityCallLog()).toEqual([
            FIND_DEFAULT_ITEM,
            FIND_ANY_DEFAULT_ITEM
        ]);
        // A blocked `security` (e.g. waiting on a keychain unlock prompt)
        // must not hold the status line until someone answers it.
        for (const call of mockedExecFileSync.mock.calls) {
            expect(call[2]).toEqual(expect.objectContaining({ timeout: 5000 }));
        }
    });

    it.each(['account', 'service-only'] as const)('stops macOS keychain probes after the %s lookup times out', (timeoutPosition) => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token', 'file-refresh-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                if (timeoutPosition === 'service-only' && args.includes('-a')) {
                    throw makeMissingItemError();
                }
                throw makeExecFileTimeoutError();
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageCredentials()).toEqual({
            accessToken: 'file-token',
            refreshToken: 'file-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual(timeoutPosition === 'account'
            ? [FIND_DEFAULT_ITEM]
            : [FIND_DEFAULT_ITEM, FIND_ANY_DEFAULT_ITEM]);
    });

    it.each([
        ['times out', Object.assign(new Error('spawnSync security ETIMEDOUT'), { code: 'ETIMEDOUT', signal: 'SIGTERM', status: null })],
        ['finds the keychain locked', Object.assign(new Error('User interaction is not allowed.'), { status: 36 })],
        ['is refused', Object.assign(new Error('The user name or passphrase you entered is not correct.'), { status: 51 })]
    ])('reads the credentials file when the macOS keychain item read %s', (_label, failure) => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation(() => {
            throw failure;
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getSecurityCallLog()).toEqual([FIND_DEFAULT_ITEM]);
    });

    it.each(['linux', 'win32'] as const)('uses the credentials file on %s', (platform) => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
        mockCredentialsFile(makeTokenPayload('file-token'));

        expect(getUsageToken()).toBe('file-token');
        expect(getUsageToken()).toBe('file-token');
        expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('reads the CLAUDE_CONFIG_DIR keychain service first and skips the plain service on a hit', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === configDirService) {
                return makeTokenPayload('profile-token', 'profile-refresh-token');
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('profile-token');
        expect(getUsageCredentials()).toEqual({
            accessToken: 'profile-token',
            refreshToken: 'profile-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -a example -w`,
            `find-generic-password -s ${configDirService} -a example -w`
        ]);
    });

    it('uses only the current profile file after its Keychain service times out', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('profile-file-token', 'profile-file-refresh-token'));
        mockedExecFileSync.mockImplementation(() => {
            throw makeExecFileTimeoutError();
        });

        expect(getUsageCredentials()).toEqual({
            accessToken: 'profile-file-token',
            refreshToken: 'profile-file-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -a example -w`
        ]);
    });

    it('skips other profiles\' keychain items and uses the profile\'s credentials file when its entry is missing', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token', 'file-refresh-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === configDirService) {
                throw makeMissingItemError();
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getUsageCredentials()).toEqual({
            accessToken: 'file-token',
            refreshToken: 'file-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -a example -w`,
            `find-generic-password -s ${configDirService} -w`,
            `find-generic-password -s ${configDirService} -a example -w`,
            `find-generic-password -s ${configDirService} -w`
        ]);
    });
});

describe('getUsageLoginFingerprint', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(claudeSettings, 'getClaudeConfigDir').mockReturnValue('/fake/claude');
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Claude Code reissues the access token every few hours; /login brings a
    // new refresh token
    it('stays the same across an access-token refresh, and changes with the login', () => {
        mockCredentialsFile(makeTokenPayload('access-1', 'refresh-1'));
        const login = getUsageLoginFingerprint();
        mockCredentialsFile(makeTokenPayload('access-2', 'refresh-1'));
        const refreshed = getUsageLoginFingerprint();
        mockCredentialsFile(makeTokenPayload('access-3', 'refresh-2'));
        const otherLogin = getUsageLoginFingerprint();

        expect(login).toBe(createHash('sha256').update('refresh-1').digest('hex').slice(0, 16));
        expect(refreshed).toBe(login);
        expect(otherLogin).not.toBe(login);
    });
});

describe('getMacKeychainConfigDirService', () => {
    it('returns null for the default profile', () => {
        expect(getMacKeychainConfigDirService()).toBeNull();
    });

    it('suffixes the service with the first 8 hex chars of sha256(config dir) when CLAUDE_CONFIG_DIR is set', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/claude'));
    });

    it('hashes the raw environment value without resolving it, matching Claude Code', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude-work/';

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/claude-work/'));
    });

    it('NFC-normalizes the directory before hashing, matching Claude Code', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/cafe\u0301';

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/caf\u00e9'));
    });

    it('lets CLAUDE_SECURESTORAGE_CONFIG_DIR override the hash input, and an empty override forces the plain service', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';

        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = '/fake/secure';
        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/secure'));

        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = '';
        expect(getMacKeychainConfigDirService()).toBeNull();
    });
});
