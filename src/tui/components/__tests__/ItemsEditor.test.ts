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

            const press = async (input: string) => {
                stdin.write(input);
                await flushInk();
            };

            return {
                instance,
                onUpdate,
                press,
                // Output written since the previous call, i.e. the frame(s)
                // rendered for the keys pressed in between
                takeOutput: () => {
                    const output = stripAnsi(stdout.getOutput());
                    stdout.clearOutput();
                    return output;
                },
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
                await flushInk();
                await editor.press('a');
                // Browsing categories highlights no widget, so the line is untouched
                expect(editor.latestPreview() ?? null).toBeNull();

                await editor.press('git branch');
                expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);

                await editor.press(ESC);
                await editor.press(ESC);
                expect(editor.latestPreview()).toBeNull();
                expect(editor.onUpdate).not.toHaveBeenCalled();
            } finally {
                editor.cleanup();
            }
        });

        it('shows the widget at the cursor with its type swapped when changing type', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }, { id: '2', type: 'tokens-input' }]);

            try {
                await flushInk();
                await editor.press(RIGHT_ARROW);
                await editor.press('git branch');
                expect(editor.latestPreview()).toEqual([
                    { id: '1', type: 'git-branch' },
                    { id: '2', type: 'tokens-input' }
                ]);
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
                await flushInk();
                await editor.press('a');
                await editor.press('git branch');
                const preview = editor.latestPreview();
                expect(preview?.[1]?.backgroundColor).toEqual(expect.any(String));
                expect(preview?.[1]?.backgroundColor).not.toBe('bgRed');

                await editor.press(ENTER);
                expect(editor.onUpdate).toHaveBeenCalledTimes(1);
                expect(editor.onUpdate).toHaveBeenCalledWith(preview);
                expect(editor.latestPreview()).toBeNull();
            } finally {
                editor.cleanup();
            }
        });

        it('shows a window of a long list and counts the entries hidden below it', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await flushInk();
                await editor.press('a');
                editor.takeOutput();
                await editor.press(ENTER);
                const output = editor.takeOutput();

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
                await flushInk();
                await editor.press('a');
                await editor.press(ENTER);
                editor.takeOutput();
                // Up from the first widget wraps to the last one
                await editor.press(UP_ARROW);
                const output = editor.takeOutput();
                const rows = getEntryRows(output);

                expect(rows.find(row => row.includes('▶'))).toMatch(new RegExp(`${allWidgetCount}\\. `));
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
                await flushInk();
                await editor.press('a');
                await editor.press('git branch');
                expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);

                editor.instance.unmount();
                expect(editor.latestPreview()).toBeNull();
            } finally {
                editor.cleanup();
            }
        });
    });
});
