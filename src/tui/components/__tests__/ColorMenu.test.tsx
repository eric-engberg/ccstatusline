import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import { ColorMenu } from '../ColorMenu';

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

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

describe('ColorMenu', () => {
    it('keeps bold and dim indicators on the current-style row', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const widgets: WidgetItem[] = [
            { id: '1', type: 'cache-hit-rate' },
            {
                id: '2',
                type: 'cache-read',
                color: 'hex:ABB2BF',
                backgroundColor: 'bgBrightBlack',
                bold: true,
                dim: 'parens'
            },
            { id: '3', type: 'cache-write' },
            { id: '4', type: 'tokens-cached' }
        ];

        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                settings: {
                    ...DEFAULT_SETTINGS,
                    colorLevel: 3,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true
                    }
                },
                onUpdate: vi.fn(),
                onBack: vi.fn()
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
            await flushInk();
            stdin.write('\x1B[B');
            await flushInk();

            const latestFrame = stdout.getOutput().split('Configure Colors').at(-1) ?? '';
            const currentStyleLine = latestFrame
                .split('\n')
                .find(line => line.includes('Current foreground')) ?? '';

            expect(currentStyleLine).toContain('[BOLD] [DIM ()]');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('explains which text the foreground still colors when a widget sets some colors itself', async () => {
        const renderMenu = async (widget: WidgetItem) => {
            const stdin = createMockStdin();
            const stdout = createMockStdout();
            const stderr = createMockStdout();
            const instance = render(
                React.createElement(ColorMenu, {
                    widgets: [widget],
                    settings: DEFAULT_SETTINGS,
                    onUpdate: vi.fn(),
                    onBack: vi.fn()
                }),
                { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
            );

            try {
                await flushInk();
                return stripAnsi(stdout.getOutput().split('Configure Colors').at(-1) ?? '');
            } finally {
                instance.unmount();
                instance.cleanup();
                stdin.destroy();
                stdout.destroy();
                stderr.destroy();
            }
        };

        const levelColored = await renderMenu({ id: '1', type: 'thinking-effort', metadata: { levelColors: 'true' } });
        const singleColored = await renderMenu({ id: '1', type: 'thinking-effort' });

        expect(levelColored).toContain('sets some of its own colors');
        expect(singleColored).not.toContain('sets some of its own colors');
    });

    // A line set to plain while Powerline is on drops its widgets' backgrounds
    it('leaves backgrounds out where the line does not draw them', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const widgets: WidgetItem[] = [{ id: '1', type: 'model', color: 'hex:FFFFFF', backgroundColor: 'hex:0000FF' }];

        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                settings: { ...DEFAULT_SETTINGS, colorLevel: 3 },
                showsBackgrounds: false,
                onUpdate: vi.fn(),
                onBack: vi.fn()
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
                expect(stdout.getOutput()).toContain('Current foreground');
            });
            const output = stdout.getOutput();
            expect(output).not.toContain('(f) to toggle bg/fg');
            expect(output).toContain('This line is plain, so its backgrounds don\'t show while Powerline is on.');
            expect(output).not.toContain('48;2;0;0;255');

            // f does nothing: Ink has read it, and nothing switched to the background
            stdin.write('f');
            await waitFor(() => {
                expect(stdin.readableLength).toBe(0);
            });
            expect(stdout.getOutput()).not.toContain('[Background Mode]');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
