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

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    letReactCatchUp,
    waitFor
} from '../../__tests__/helpers/wait-for-ink';
import {
    ColorMenu,
    type ColorMenuProps
} from '../ColorMenu';

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

function renderColorMenu(widgets: WidgetItem[], props: Pick<ColorMenuProps, 'showsBackgrounds'> = {}, settings: Settings = DEFAULT_SETTINGS) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const onUpdate = vi.fn<ColorMenuProps['onUpdate']>();
    const onBack = vi.fn<ColorMenuProps['onBack']>();
    const instance = render(
        React.createElement(ColorMenu, {
            widgets,
            settings,
            ...props,
            onUpdate,
            onBack
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

    return {
        stdin,
        onUpdate,
        onBack,
        latestFrame: () => stripAnsi(stdout.getOutput().split('Configure Colors').at(-1) ?? ''),
        output: () => stripAnsi(stdout.getOutput()),
        cleanup: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
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

        const latestFrame = () => stdout.getOutput().split('Configure Colors').at(-1) ?? '';

        try {
            await waitFor(() => {
                expect(stripAnsi(latestFrame())).toContain('▶  1: Cache Hit Rate');
            });
            stdin.write('\x1B[B');
            await waitFor(() => {
                expect(stripAnsi(latestFrame())).toContain('▶  2: Cache Read');
            });

            const currentStyleLine = latestFrame()
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

    it('ignores digit keys instead of selecting the Back entry', async () => {
        const menu = renderColorMenu([
            { id: '1', type: 'model' },
            { id: '2', type: 'version' }
        ]);

        try {
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('▶  1: Model');
            });

            // 3 is the Back entry's position. A digit changes nothing on screen, so let Ink
            // read it on its own before the arrow that shows the menu kept reading keys
            menu.stdin.write('3');
            await letReactCatchUp();
            menu.stdin.write('\x1B[B');
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('▶  2: Version');
            });
            expect(menu.onBack).not.toHaveBeenCalled();

            menu.stdin.write('\x1B[B');
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('▶  ← Back');
            });
            menu.stdin.write('\r');
            await waitFor(() => {
                expect(menu.onBack).toHaveBeenCalledTimes(1);
            });
        } finally {
            menu.cleanup();
        }
    });

    it('moves the highlight to the first widget when hiding the highlighted separator', async () => {
        const menu = renderColorMenu([
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'version' }
        ]);

        try {
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('(s)how separators:OFF');
            });

            menu.stdin.write('s');
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('(s)how separators:ON');
            });
            menu.stdin.write('\x1B[B');
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('▶  2: Separator');
            });
            menu.stdin.write('s');
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('(s)how separators:OFF');
            });

            expect(menu.latestFrame()).toContain('▶  1: Model');
            expect(menu.latestFrame()).toContain('Current foreground');

            menu.stdin.write('b');
            await waitFor(() => {
                expect(menu.onUpdate).toHaveBeenCalled();
            });
            expect(menu.onUpdate.mock.calls[0]?.[0]?.[0]).toMatchObject({ id: '1', bold: true });
        } finally {
            menu.cleanup();
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
                await waitFor(() => {
                    expect(stripAnsi(stdout.getOutput())).toContain('▶  1: Thinking Effort');
                });
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

    // A line set to plain while Powerline is on hides its widgets' backgrounds,
    // which show again once the line is Powerline
    it('keeps the backgrounds a plain line does not show when styling is reset or cleared', async () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model', color: 'red', backgroundColor: 'bgBlue', bold: true },
            { id: '2', type: 'version', color: 'green', backgroundColor: 'bgMagenta' }
        ];
        const menu = renderColorMenu(widgets, { showsBackgrounds: false });

        try {
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('▶  1: Model');
            });

            menu.stdin.write('r');
            await waitFor(() => {
                expect(menu.onUpdate).toHaveBeenCalledTimes(1);
            });
            expect(menu.onUpdate.mock.calls[0]?.[0]).toEqual([
                { id: '1', type: 'model', backgroundColor: 'bgBlue' },
                widgets[1]
            ]);

            menu.stdin.write('c');
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('Confirm Clear All Colors');
            });
            menu.stdin.write('\r');
            await waitFor(() => {
                expect(menu.onUpdate).toHaveBeenCalledTimes(2);
            });
            expect(menu.onUpdate.mock.calls[1]?.[0]).toEqual([
                { id: '1', type: 'model', backgroundColor: 'bgBlue' },
                { id: '2', type: 'version', backgroundColor: 'bgMagenta' }
            ]);
        } finally {
            menu.cleanup();
        }
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

    // A terminal paste reaches Ink as one input chunk, not key by key
    it('takes a hex color pasted with its #', async () => {
        const menu = renderColorMenu([{ id: '1', type: 'model' }], {}, { ...DEFAULT_SETTINGS, colorLevel: 3 });

        try {
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('▶  1: Model');
            });
            menu.stdin.write('h');
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('Enter 6-digit hex color code');
            });

            menu.stdin.write('#FF8800');
            await waitFor(() => {
                expect(menu.latestFrame()).toMatch(/^#FF8800$/m);
            });
            menu.stdin.write('\r');
            await waitFor(() => {
                expect(menu.onUpdate).toHaveBeenCalledTimes(1);
            });
            expect(menu.onUpdate.mock.calls[0]?.[0]?.[0]).toMatchObject({ id: '1', color: 'hex:FF8800' });
        } finally {
            menu.cleanup();
        }
    });

    it('takes pasted custom gradient stops', async () => {
        const menu = renderColorMenu([{ id: '1', type: 'model' }], {}, { ...DEFAULT_SETTINGS, colorLevel: 3 });

        try {
            await waitFor(() => {
                expect(menu.latestFrame()).toContain('▶  1: Model');
            });
            menu.stdin.write('g');
            await waitFor(() => {
                expect(menu.output()).toContain('Select Gradient');
            });
            // Up wraps to the Custom entry at the bottom
            menu.stdin.write('\x1B[A');
            await waitFor(() => {
                expect(menu.output()).toContain('▶ Custom (enter two hex stops)');
            });
            menu.stdin.write('\r');
            await waitFor(() => {
                expect(menu.output()).toContain('Enter START hex color');
            });

            menu.stdin.write('FF8800');
            await waitFor(() => {
                expect(menu.output()).toMatch(/^#FF8800$/m);
            });
            menu.stdin.write('\r');
            await waitFor(() => {
                expect(menu.output()).toContain('Enter END hex color');
            });
            menu.stdin.write('#0088ff');
            await waitFor(() => {
                expect(menu.output()).toMatch(/^#0088FF$/m);
            });
            menu.stdin.write('\r');
            await waitFor(() => {
                expect(menu.onUpdate).toHaveBeenCalledTimes(1);
            });
            expect(menu.onUpdate.mock.calls[0]?.[0]?.[0]).toMatchObject({ id: '1', color: 'gradient:FF8800-0088FF' });
        } finally {
            menu.cleanup();
        }
    });
});
