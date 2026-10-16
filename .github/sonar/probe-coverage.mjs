// Fork-only: fork-sonarqube.yml loads this with `bun test --preload`. Nothing
// else does, so local and upstream test runs never see it.
//
// Some suites run the module under test in a child process, a probe, so it
// loads fresh with a scratch HOME. Bun's coverage only records the test
// runner's own process, so code that only a probe runs counts as uncovered.
// With CCSTATUSLINE_PROBE_COVERAGE_DIR set, each probe runs under
// `bun test --coverage` instead and leaves its own lcov report in a new
// subdirectory of that directory. The probe script is loaded as a test file
// with no tests.
//
// Its output and exit code match a plain `bun` run only when the probe
// awaits all its work at top level, as the suites' probes do: bun test exits
// once the file has loaded instead of waiting for the event loop to drain. A
// timer or callback still pending then never runs, so a late throw doesn't
// change the exit code, and late output, or output past about 2 MB, can be
// cut short.
//
// A probe is execFileSync(process.execPath, ['<dir>/probe-<name>.mjs']), the
// form the suites' probe harnesses use. Every other call goes through
// unchanged.
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const coverageDir = process.env.CCSTATUSLINE_PROBE_COVERAGE_DIR;

if (coverageDir) {
    const require = createRequire(import.meta.url);
    const childProcess = require('node:child_process');
    const realExecFileSync = childProcess.execFileSync;
    const reportRoot = path.resolve(coverageDir);

    // bun test prints its version line on stdout before the probe runs; the
    // probe's own output, which the harness parses, is everything after it.
    const withoutVersionLine = (output) => {
        const end = typeof output === 'string' ? output.indexOf('\n') : -1;
        return end >= 0 && output.slice(0, end).includes('bun test ') ? output.slice(end + 1) : output;
    };

    // bun test runs in UTC unless TZ is set, and plain bun uses the system's
    // zone, so a probe whose env leaves TZ unset is given that zone.
    let systemZone;
    const withSystemZone = (options) => {
        const env = options?.env ?? process.env;
        if (env.TZ !== undefined) {
            return options;
        }

        if (systemZone === undefined) {
            const plainEnv = { ...process.env };
            delete plainEnv.TZ;
            systemZone = realExecFileSync(process.execPath, [
                '-e',
                'process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)'
            ], { encoding: 'utf8', env: plainEnv });
        }

        return { ...options, env: { ...env, TZ: systemZone } };
    };

    // For a function a process never called, Bun lists every line in its
    // range with 0 hits, blank lines and comments included; for one it
    // called, only the executable lines. The scanner merges reports as a
    // union of lines, so a probe's 0-hit lines would add lines the suite's
    // report leaves out. A line a probe ran is executable, and the suite's
    // report already lists it, so keeping only those leaves that report to
    // decide which lines count, and the probes only add hits.
    const keepRunLines = (reportFile) => {
        if (!fs.existsSync(reportFile)) {
            return;
        }

        const records = [];
        for (const record of fs.readFileSync(reportFile, 'utf8').split('end_of_record')) {
            const lines = record.trim().split('\n');
            const run = lines.filter(line => line.startsWith('DA:') && Number(line.split(',')[1]) > 0);
            if (run.length > 0) {
                const header = lines.filter(line => !/^(?:DA|LF|LH):/.test(line));
                records.push([...header, ...run, `LF:${run.length}`, `LH:${run.length}`, 'end_of_record\n'].join('\n'));
            }
        }

        fs.writeFileSync(reportFile, records.join(''));
    };

    fs.mkdirSync(reportRoot, { recursive: true });

    childProcess.execFileSync = function execFileSync(file, args, ...rest) {
        const script = Array.isArray(args) && args.length === 1 ? args[0] : null;
        const isProbe = file === process.execPath
            && typeof script === 'string'
            && /^probe-.+\.mjs$/.test(path.basename(script));

        if (!isProbe) {
            return realExecFileSync.call(this, file, args, ...rest);
        }

        const [options, ...more] = rest;
        const reportDir = fs.mkdtempSync(path.join(reportRoot, 'probe-'));
        try {
            return withoutVersionLine(realExecFileSync.call(this, file, [
                'test',
                '--pass-with-no-tests',
                '--coverage',
                '--coverage-reporter=lcov',
                `--coverage-dir=${reportDir}`,
                script
            ], withSystemZone(options), ...more));
        } finally {
            keepRunLines(path.join(reportDir, 'lcov.info'));
        }
    };
}
