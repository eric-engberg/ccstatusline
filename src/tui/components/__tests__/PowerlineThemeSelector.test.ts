import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import { getPowerlineThemes } from '../../../utils/colors';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import {
    PowerlineThemeSelector,
    applyCustomPowerlineTheme,
    buildPowerlineThemeItems,
    type PowerlineThemeSelectorProps
} from '../PowerlineThemeSelector';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
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

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

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

describe('PowerlineThemeSelector helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('builds powerline theme list items with original theme sublabels', () => {
        const items = buildPowerlineThemeItems(['gruvbox', 'onedark'], 'onedark');

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            label: 'Gruvbox',
            value: 'gruvbox'
        });
        expect(items[1]).toMatchObject({
            label: 'One Dark',
            sublabel: '(original)',
            value: 'onedark'
        });
    });

    it('copies a built-in theme into widget colors and switches to custom mode', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 2 as const,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                theme: 'gruvbox'
            }
        };

        const updatedSettings = applyCustomPowerlineTheme(settings, 'gruvbox');

        expect(updatedSettings).not.toBeNull();
        expect(updatedSettings?.powerline.theme).toBe('custom');
        expect(updatedSettings?.lines[0]?.[0]).toMatchObject({
            color: 'ansi256:16',
            backgroundColor: 'ansi256:167'
        });
        expect(updatedSettings?.lines[0]?.[1]).toEqual(settings.lines[0]?.[1]);
        expect(updatedSettings?.lines[0]?.[2]).toMatchObject({
            color: 'ansi256:235',
            backgroundColor: 'ansi256:214'
        });
    });

    it('gives merged widgets one shared color, like the theme it is copying', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 2 as const,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                theme: 'gruvbox'
            },
            lines: [[
                {
                    id: '1',
                    type: 'model',
                    merge: true
                },
                { id: '2', type: 'context-length' },
                { id: '3', type: 'git-branch' }
            ]]
        };

        const updatedSettings = applyCustomPowerlineTheme(settings, 'gruvbox');
        const [first, second, third] = updatedSettings?.lines[0] ?? [];

        // The theme paints a merged run as one segment, so copying it must too.
        expect(second?.color).toBe(first?.color);
        expect(second?.backgroundColor).toBe(first?.backgroundColor);
        expect(third?.color).not.toBe(first?.color);
    });

    it('leaves separators uncolored without consuming a theme slot', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 2 as const,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                theme: 'gruvbox'
            },
            lines: [[
                { id: '1', type: 'model' },
                {
                    id: '2',
                    type: 'separator',
                    character: '|'
                },
                { id: '3', type: 'git-branch' }
            ]]
        };

        const withSeparator = applyCustomPowerlineTheme(settings, 'gruvbox');
        const withoutSeparator = applyCustomPowerlineTheme({
            ...settings,
            lines: [[
                { id: '1', type: 'model' },
                { id: '3', type: 'git-branch' }
            ]]
        }, 'gruvbox');

        expect(withSeparator?.lines[0]?.[1]).toEqual(settings.lines[0]?.[1]);
        expect(withSeparator?.lines[0]?.[2]?.color).toBe(withoutSeparator?.lines[0]?.[1]?.color);
    });

    it('drops pins it has made redundant', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 2 as const,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                theme: 'gruvbox'
            },
            lines: [[{
                id: '1',
                type: 'model',
                color: 'red',
                pinColor: true,
                pinBackgroundColor: true
            }]]
        };

        const updatedSettings = applyCustomPowerlineTheme(settings, 'gruvbox');
        const widget = updatedSettings?.lines[0]?.[0];

        // Every widget now carries its own explicit colour, which is what a pin asked for.
        // Left set, the pins would be invisible on 'custom' and revive on the next theme.
        expect(widget?.pinColor).toBeUndefined();
        expect(widget?.pinBackgroundColor).toBeUndefined();
        expect(widget?.color).toBeDefined();
    });

    it('returns null when the requested theme cannot be customized', () => {
        expect(applyCustomPowerlineTheme(DEFAULT_SETTINGS, 'custom')).toBeNull();
        expect(applyCustomPowerlineTheme(DEFAULT_SETTINGS, 'missing-theme')).toBeNull();
    });

    it('previews the highlighted theme once without triggering update-depth warnings', async () => {
        const themes = getPowerlineThemes();

        expect(themes.length).toBeGreaterThan(1);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineThemeSelectorProps['onUpdate']>();
        const onBack = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const frames: string[] = [];
        stdout.on('data', (chunk: Buffer | string) => {
            frames.push(chunk.toString());
        });
        const instance = render(
            React.createElement(PowerlineThemeSelector, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        theme: themes[0]
                    }
                },
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

        try {
            await waitFor(() => {
                expect(frames.join('')).toContain('(original)');
            });
            expect(onUpdate).not.toHaveBeenCalled();

            stdin.write('\u001B[B');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });

            expect(onUpdate).toHaveBeenCalledTimes(1);
            expect(onUpdate.mock.calls[0]?.[0]?.powerline.theme).toBe(themes[1]);

            const maximumUpdateDepthWarnings = consoleErrorSpy.mock.calls.filter((call) => {
                return call.some(arg => typeof arg === 'string' && arg.includes('Maximum update depth exceeded'));
            });

            expect(maximumUpdateDepthWarnings).toHaveLength(0);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('restores the original theme when the pins prompt is escaped', async () => {
        const themes = getPowerlineThemes();
        expect(themes.length).toBeGreaterThan(1);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineThemeSelectorProps['onUpdate']>();
        const onBack = vi.fn();
        const originalSettings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: themes[0]
            },
            lines: [[{
                id: '1',
                type: 'model',
                color: 'red',
                pinColor: true
            }]]
        };
        const instance = render(
            React.createElement(PowerlineThemeSelector, {
                settings: originalSettings,
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

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('(original)');
            });
            stdin.write('\x1B[B'); // change the theme (live preview)
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });
            stdin.write('\r'); // Enter: commit -> keep/remove prompt
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Remove them so the new theme fully applies?');
            });
            stdin.write('\x1B'); // ESC: the screen promises this cancels
            await waitFor(() => {
                expect(onBack).toHaveBeenCalled();
            });

            // Both Yes and No commit the theme, so ESC is the only abort - it must undo the
            // live preview rather than leaving the previewed theme applied.
            const lastSettings = onUpdate.mock.calls.at(-1)?.[0];
            expect(lastSettings?.powerline.theme).toBe(themes[0]);
            expect(lastSettings?.lines[0]?.[0]?.pinColor).toBe(true);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('prompts to remove pinned overrides when the theme changes and clears them on confirm', async () => {
        const themes = getPowerlineThemes();
        expect(themes.length).toBeGreaterThan(1);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineThemeSelectorProps['onUpdate']>();
        const onBack = vi.fn();
        const instance = render(
            React.createElement(PowerlineThemeSelector, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        theme: themes[0]
                    },
                    lines: [[{ id: '1', type: 'model', color: 'red', pinColor: true }]]
                },
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

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('(original)');
            });
            stdin.write('\x1B[B'); // change the theme (live preview)
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });
            stdin.write('\r'); // Enter: commit -> keep/remove prompt (pins present, theme changed)
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Remove them so the new theme fully applies?');
            });
            // The prompt starts on "No", so removing the pins takes a deliberate move up
            // first - the same Enter that opened it must not be able to destroy them.
            stdin.write('\x1B[B');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Yes');
            });
            stdin.write('\r'); // Enter: choose "Yes" -> remove overrides
            await waitFor(() => {
                expect(onBack).toHaveBeenCalled();
            });

            const lastSettings = onUpdate.mock.calls.at(-1)?.[0];
            expect(lastSettings?.lines[0]?.[0]?.pinColor).toBeUndefined();
            expect(onBack).toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
