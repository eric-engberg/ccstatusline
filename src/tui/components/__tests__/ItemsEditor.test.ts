import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React, { useState } from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { getWidgetCatalog } from '../../../utils/widgets';
import { ItemsEditor } from '../ItemsEditor';

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

interface CapturedWriteStream extends NodeJS.WriteStream {
    clearOutput: () => void;
    getOutput: () => string;
}

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
        clearOutput() {
            chunks.length = 0;
        },
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

// Lets work React has already queued run first. Its scheduler runs on
// setImmediate, and it attaches input listeners in an effect just after
// drawing a frame, so a key sent as soon as the frame shows could be lost.
async function letReactCatchUp() {
    for (let turn = 0; turn < 2; turn++) {
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}

// Retries the assertions until they pass; a fixed delay races Ink on a busy machine
async function waitFor(assertions: () => void, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        try {
            assertions();
            await letReactCatchUp();
            return;
        } catch (error) {
            if (Date.now() >= deadline) {
                throw error;
            }
        }
    }
}

function StatefulItemsEditor({ initialWidgets }: { initialWidgets: WidgetItem[] }) {
    const [widgets, setWidgets] = useState(initialWidgets);

    return React.createElement(ItemsEditor, {
        widgets,
        onUpdate: setWidgets,
        onBack: vi.fn(),
        lineNumber: 1,
        settings: DEFAULT_SETTINGS
    });
}

describe('ItemsEditor', () => {
    it('shows only non-default number styles beside the widget name', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'tokens-input' }] }),
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
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input');
            expect(stripAnsi(stdout.getOutput())).not.toContain('(compact)');

            stdout.clearOutput();
            stdin.write('.');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input (compact)');

            stdout.clearOutput();
            stdin.write('.');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input (whole)');

            stdout.clearOutput();
            stdin.write('.');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input');
            expect(stripAnsi(stdout.getOutput())).not.toContain('(compact)');
            expect(stripAnsi(stdout.getOutput())).not.toContain('(whole)');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('preserves existing widget modifiers before the number style', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(ItemsEditor, {
                widgets: [{
                    id: '1',
                    type: 'cache-read',
                    metadata: { cacheScopeSession: 'true' },
                    numberFormat: { style: 'compact' }
                }],
                onUpdate: vi.fn(),
                onBack: vi.fn(),
                lineNumber: 1,
                settings: DEFAULT_SETTINGS
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
            expect(stripAnsi(stdout.getOutput())).toContain('1. Cache Read (session) (compact)');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('starts on the given widget and reports where the cursor moves', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onSelectedIndexChange = vi.fn<(index: number) => void>();

        const instance = render(
            React.createElement(ItemsEditor, {
                widgets: [{ id: '1', type: 'model' }, { id: '2', type: 'tokens-input' }, { id: '3', type: 'tokens-output' }],
                onUpdate: vi.fn(),
                onBack: vi.fn(),
                initialSelectedIndex: 1,
                onSelectedIndexChange,
                lineNumber: 1,
                settings: DEFAULT_SETTINGS
            }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toMatch(/▶\s+2\. Tokens Input/);
            });

            stdin.write('\x1b[B');
            await waitFor(() => {
                expect(onSelectedIndexChange).toHaveBeenLastCalledWith(2);
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    describe('widget picker', () => {
        const ESC = '\x1b';
        const ENTER = '\r';
        const UP_ARROW = '\x1b[A';
        const RIGHT_ARROW = '\x1b[C';
        const allWidgetCount = getWidgetCatalog(DEFAULT_SETTINGS).length;

        function getEntryRows(output: string): string[] {
            return output.split('\n').filter(row => /^\s*(▶\s+)?\d+\. /.test(row));
        }

        function renderEditor(widgets: WidgetItem[], settings = DEFAULT_SETTINGS) {
            const stdin = createMockStdin();
            const stdout = createMockStdout();
            const stderr = createMockStdout();
            const previews: (WidgetItem[] | null)[] = [];
            const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();

            const instance = render(
                React.createElement(ItemsEditor, {
                    widgets,
                    onUpdate,
                    onBack: vi.fn(),
                    onPreviewChange: (preview: WidgetItem[] | null) => { previews.push(preview); },
                    lineNumber: 1,
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

            // Output written since the last key press
            const screen = () => stripAnsi(stdout.getOutput());

            return {
                instance,
                onUpdate,
                // Sends keys without waiting; follow with waitFor on what they change
                press: (input: string) => {
                    stdout.clearOutput();
                    stdin.write(input);
                },
                screen,
                // The last picker frame drawn since the last key press
                latestPickerFrame: () => {
                    const output = screen();
                    const start = output.lastIndexOf('ADD WIDGET');
                    return start === -1 ? '' : output.slice(start);
                },
                // The line editor is drawn and listening for keys
                ready: () => waitFor(() => {
                    expect(screen()).toContain('1. ');
                }),
                latestPreview: () => previews.at(-1),
                cleanup: () => {
                    instance.unmount();
                    instance.cleanup();
                    stdin.destroy();
                    stdout.destroy();
                    stderr.destroy();
                }
            };
        }

        it('shows the highlighted widget added after the cursor until the picker is cancelled', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                // Browsing categories highlights no widget, so the line is untouched
                expect(editor.latestPreview() ?? null).toBeNull();

                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);
                });

                // The first ESC clears the search, the second closes the picker
                editor.press(ESC);
                await waitFor(() => {
                    expect(editor.latestPreview()).toBeNull();
                });
                editor.press(ESC);
                await waitFor(() => {
                    expect(editor.screen()).toContain('Edit Line 1');
                    expect(editor.screen()).not.toContain('ADD WIDGET');
                });
                expect(editor.onUpdate).not.toHaveBeenCalled();
            } finally {
                editor.cleanup();
            }
        });

        it('shows the widget at the cursor with its type swapped when changing type', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }, { id: '2', type: 'tokens-input' }]);

            try {
                await editor.ready();
                editor.press(RIGHT_ARROW);
                await waitFor(() => {
                    expect(editor.screen()).toContain('CHANGE WIDGET TYPE');
                });
                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()).toEqual([
                        { id: '1', type: 'git-branch' },
                        { id: '2', type: 'tokens-input' }
                    ]);
                });
            } finally {
                editor.cleanup();
            }
        });

        it('applies exactly the previewed line, powerline background included, on Enter', async () => {
            const powerlineSettings = {
                ...DEFAULT_SETTINGS,
                powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true }
            };
            const editor = renderEditor([{ id: '1', type: 'model', backgroundColor: 'bgRed' }], powerlineSettings);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);
                });
                const preview = editor.latestPreview();
                expect(preview?.[1]?.backgroundColor).toEqual(expect.any(String));
                expect(preview?.[1]?.backgroundColor).not.toBe('bgRed');

                editor.press(ENTER);
                await waitFor(() => {
                    expect(editor.onUpdate).toHaveBeenCalledTimes(1);
                    expect(editor.latestPreview()).toBeNull();
                });
                expect(editor.onUpdate).toHaveBeenCalledWith(preview);
            } finally {
                editor.cleanup();
            }
        });

        it('shows a window of a long list and counts the entries hidden below it', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press(ENTER);
                await waitFor(() => {
                    expect(editor.latestPickerFrame()).toMatch(/↓ \d+ more/);
                });
                const output = editor.latestPickerFrame();

                const shown = getEntryRows(output).length;
                const hiddenBelow = Number(/↓ (\d+) more/.exec(output)?.[1]);
                expect(shown).toBeGreaterThan(0);
                expect(shown).toBeLessThan(allWidgetCount);
                expect(shown + hiddenBelow).toBe(allWidgetCount);
                expect(output).not.toMatch(/↑ \d+ more/);
            } finally {
                editor.cleanup();
            }
        });

        it('scrolls the window to keep the highlighted widget visible', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press(ENTER);
                await waitFor(() => {
                    expect(editor.latestPickerFrame()).toMatch(/↓ \d+ more/);
                });
                // Up from the first widget wraps to the last one
                editor.press(UP_ARROW);
                await waitFor(() => {
                    const highlighted = getEntryRows(editor.latestPickerFrame()).find(row => row.includes('▶'));
                    expect(highlighted).toMatch(new RegExp(`${allWidgetCount}\\. `));
                });
                const output = editor.latestPickerFrame();
                const rows = getEntryRows(output);

                expect(rows.some(row => /^\s*1\. /.test(row))).toBe(false);
                expect(output).toMatch(/↑ \d+ more/);
                expect(output).not.toMatch(/↓ \d+ more/);
            } finally {
                editor.cleanup();
            }
        });

        it('clears the preview when the editor is closed mid-pick', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);
                });

                editor.instance.unmount();
                expect(editor.latestPreview()).toBeNull();
            } finally {
                editor.cleanup();
            }
        });
    });
});
