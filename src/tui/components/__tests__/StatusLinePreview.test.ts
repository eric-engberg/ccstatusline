import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { getVisibleWidth } from '../../../utils/ansi';
import { renderOsc8Link } from '../../../utils/hyperlink';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import {
    StatusLinePreview,
    preparePreviewLineForTerminal
} from '../StatusLinePreview';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 160;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        getOutput() {
            return chunks.join('');
        }
    });
}

describe('StatusLinePreview helpers', () => {
    it('strips OSC links and clamps preview lines to the terminal width', () => {
        const line = `${renderOsc8Link(
            'https://github.com/owner/repo/pull/42',
            'PR #42'
        )} OPEN ${'Example PR title '.repeat(8)}`;

        const prepared = preparePreviewLineForTerminal(line, 40);

        expect(prepared).not.toContain('github.com');
        expect(prepared.endsWith('...')).toBe(true);
        expect(getVisibleWidth(`  ${prepared}`)).toBeLessThanOrEqual(40);
    });

    it('keeps parens dim scoped in the Ink preview when global bold is active', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            globalBold: true,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'custom',
                separators: ['\uE0B0'],
                separatorInvertBackground: [false]
            }
        };
        const lines: WidgetItem[][] = [[
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'Cache Hit: 87.0%',
                color: 'hex:282C34',
                backgroundColor: 'hex:61AFEF'
            },
            {
                id: 'w2',
                type: 'custom-text',
                customText: 'Cache Read: 12k (64.0%)',
                color: 'hex:ABB2BF',
                backgroundColor: 'hex:3E4452',
                dim: 'parens'
            },
            {
                id: 'w3',
                type: 'custom-text',
                customText: 'Cache Write: 3k (16.0%)',
                color: 'hex:282C34',
                backgroundColor: 'hex:98C379'
            }
        ]];

        const instance = render(
            React.createElement(StatusLinePreview, {
                lines,
                terminalWidth: 160,
                settings
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Cache Write');
            });
            const output = stdout.getOutput();
            const dimIndex = output.indexOf('\x1b[2m(64.0%)');
            const resetIndex = output.indexOf('\x1b[22;1m', dimIndex);
            const nextWidgetIndex = output.indexOf('Cache Write');

            expect(dimIndex).toBeGreaterThanOrEqual(0);
            expect(resetIndex).toBeGreaterThan(dimIndex);
            expect(resetIndex).toBeLessThan(nextWidgetIndex);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});

describe('StatusLinePreview with a plain line among Powerline lines', () => {
    it('draws each line in its own mode, without Powerline backgrounds on the plain one', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            defaultPadding: ' ',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'custom',
                separators: [''],
                separatorInvertBackground: [false],
                lineEnabled: [null, false]
            }
        };
        const lines: WidgetItem[][] = [
            [
                { id: 'a', type: 'custom-text', customText: 'one', color: 'hex:FFFFFF', backgroundColor: 'hex:0000AA' },
                { id: 'b', type: 'custom-text', customText: 'two', color: 'hex:FFFFFF', backgroundColor: 'hex:AA0000' }
            ],
            [
                { id: 'c', type: 'custom-text', customText: 'three', color: 'hex:FFFFFF', backgroundColor: 'hex:0000AA' },
                { id: 'd', type: 'separator' },
                { id: 'e', type: 'custom-text', customText: 'four', color: 'hex:FFFFFF', backgroundColor: 'hex:AA0000' }
            ]
        ];

        const instance = render(
            React.createElement(StatusLinePreview, { lines, terminalWidth: 160, settings }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('four');
            });
            const outputLines = stdout.getOutput().split('\n');
            const powerlineLine = outputLines.find(line => line.includes('one')) ?? '';
            const plainLine = outputLines.find(line => line.includes('three')) ?? '';

            expect(powerlineLine).toContain('');
            expect(powerlineLine).toContain('48;2;0;0;170');
            expect(plainLine).toContain('|');
            expect(plainLine).not.toContain('');
            expect(plainLine).not.toContain('48;2;');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
