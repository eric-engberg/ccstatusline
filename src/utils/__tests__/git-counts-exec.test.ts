import type * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest';

// Real git, no mocks: the count widgets count the whole repository, as Git
// Status does, wherever in it the session is and whatever the user's git config
// says. Each test checks that plain git, run the same way, would count less, so
// the setup is the real trigger. The git helpers run in their own process, as
// other suites mock child_process globally under Bun.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;

// Turns off pathspec magic, so git reads `:/` as a file name
const LITERAL_PATHSPECS_ENV: NodeJS.ProcessEnv = { GIT_LITERAL_PATHSPECS: '1' };

describe.skipIf(process.platform === 'win32')('git counts across the whole repository', () => {
    let root = '';
    let probePath = '';
    let env: NodeJS.ProcessEnv = {};

    // What a helper exported by git.ts returns with the session in cwd, read
    // fresh rather than from an earlier call's cache
    function gitHelper(name: string, cwd: string, extraEnv: NodeJS.ProcessEnv = {}): unknown {
        fs.rmSync(path.join(root, 'home'), { recursive: true, force: true });
        return JSON.parse(execFileSync(process.execPath, [probePath, JSON.stringify([name, cwd])], { encoding: 'utf8', env: { ...env, ...extraEnv } })) as unknown;
    }

    function plainGit(cwd: string, ...args: string[]): string {
        return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    }

    function write(file: string, text: string): void {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
    }

    // A repository with these files committed
    function makeRepo(name: string, files: Record<string, string>): string {
        const dir = path.join(root, name);
        fs.mkdirSync(dir);
        plainGit(dir, 'init', '-q');
        for (const [file, text] of Object.entries(files)) {
            write(path.join(dir, file), text);
        }
        plainGit(dir, 'add', '.');
        plainGit(dir, 'commit', '-qm', 'init');
        return dir;
    }

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-counts-'));
        const bundlePath = path.join(root, 'git.mjs');
        probePath = path.join(root, 'probe.mjs');
        execFileSync('bun', ['build', fileURLToPath(new URL('../git.ts', import.meta.url)), '--target=node', `--outfile=${bundlePath}`], { stdio: 'pipe' });
        fs.writeFileSync(probePath, `
            import * as git from './git.mjs';
            const [name, cwd] = JSON.parse(process.argv[2]);
            console.log(JSON.stringify(git[name]({ data: { cwd } })));
        `);
        const globalConfig = path.join(root, 'global-gitconfig');
        fs.writeFileSync(globalConfig, '');
        // HOME holds the git cache
        env = { ...process.env, HOME: path.join(root, 'home'), GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('counts changed lines outside the session\'s directory with diff.relative set', () => {
        const dir = makeRepo('relative', { 'a/x': '1\n', 'b/y': '1\n', 'c/z': '1\n' });
        write(path.join(dir, 'a', 'x'), '1\n2\n3\n');
        plainGit(dir, 'add', 'a/x');
        write(path.join(dir, 'b', 'y'), '1\n2\n');
        plainGit(dir, 'config', 'diff.relative', 'true');

        for (const cwd of [dir, path.join(dir, 'b'), path.join(dir, 'c')]) {
            expect(gitHelper('getGitChangeCounts', cwd)).toEqual({ insertions: 3, deletions: 0 });
        }
        expect(plainGit(path.join(dir, 'c'), 'diff', '--cached', '--shortstat')).toBe('');
    });

    // Mid-merge, with top.txt and sub/f.txt both conflicted and nothing in docs/
    function makeConflictRepo(name: string): string {
        const dir = makeRepo(name, { 'top.txt': 'base\n', 'sub/f.txt': 'base\n', 'docs/readme.md': 'readme\n' });
        plainGit(dir, 'checkout', '-qb', 'other');
        write(path.join(dir, 'top.txt'), 'other\n');
        write(path.join(dir, 'sub', 'f.txt'), 'other\n');
        plainGit(dir, 'commit', '-qam', 'other');
        plainGit(dir, 'checkout', '-q', '-');
        write(path.join(dir, 'top.txt'), 'mine\n');
        write(path.join(dir, 'sub', 'f.txt'), 'mine\n');
        plainGit(dir, 'commit', '-qam', 'mine');
        expect(() => plainGit(dir, 'merge', 'other')).toThrow();
        return dir;
    }

    it('counts conflicts outside the session\'s directory', () => {
        const dir = makeConflictRepo('conflicts');

        for (const cwd of [dir, path.join(dir, 'sub'), path.join(dir, 'docs')]) {
            expect(gitHelper('getGitConflictCount', cwd)).toBe(2);
        }
        expect(plainGit(path.join(dir, 'docs'), 'ls-files', '--unmerged')).toBe('');
    });

    it('counts conflicts with GIT_LITERAL_PATHSPECS set', () => {
        const dir = makeConflictRepo('conflicts-literal');

        expect(gitHelper('getGitConflictCount', dir, LITERAL_PATHSPECS_ENV)).toBe(2);
        expect(execFileSync('git', ['ls-files', '--unmerged', '--', ':/'], { cwd: dir, env: { ...env, ...LITERAL_PATHSPECS_ENV }, encoding: 'utf8' })).toBe('');
    });
});
