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
import { ItemsEditor } from '../ItemsEditor';

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

const ENTER = '\r';
const ESC = '\x1b';
const LEFT = '\x1b[D';
const RIGHT = '\x1b[C';

// Two setImmediate turns let React re-attach Ink's input listener after a redraw
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

const bar: WidgetItem = { id: 'bar', type: 'context-bar', metadata: { display: 'progress' } };

// Opens the line editor on one context bar and runs the steps against it
async function withEditor(steps: (tools: {
    press: (key: string) => void;
    screen: () => string;
    onUpdate: ReturnType<typeof vi.fn>;
    onPreviewChange: ReturnType<typeof vi.fn>;
}) => Promise<void>): Promise<void> {
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdout = new MockTtyStream();
    const stderr = new MockTtyStream();
    let frame = '';
    // In debug mode Ink writes each whole frame; keep the latest one
    stdout.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        if (stripAnsi(text).trim().length > 0) {
            frame = text;
        }
    });
    const onUpdate = vi.fn();
    const onPreviewChange = vi.fn();

    const instance = render(
        React.createElement(ItemsEditor, {
            widgets: [bar],
            onUpdate,
            onBack: vi.fn(),
            onPreviewChange,
            lineNumber: 1,
            settings: DEFAULT_SETTINGS
        }),
        {
            stdin,
            stdout: stdout as unknown as NodeJS.WriteStream,
            stderr: stderr as unknown as NodeJS.WriteStream,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        }
    );

    try {
        const screen = () => stripAnsi(frame);
        await waitFor(() => {
            expect(screen()).toContain('(b)ar width');
        });
        await steps({ press: key => stdin.write(key), screen, onUpdate, onPreviewChange });
    } finally {
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
    }
}

const lastPreviewWidth = (onPreviewChange: ReturnType<typeof vi.fn>): string | undefined => {
    const widgets = onPreviewChange.mock.calls.at(-1)?.[0] as WidgetItem[] | null | undefined;
    return widgets?.[0]?.metadata?.barWidth;
};

describe('ItemsEditor bar width', () => {
    it('steps the width with the arrows, previews it, and saves it on Enter', async () => {
        await withEditor(async ({ press, screen, onUpdate, onPreviewChange }) => {
            press('b');
            await waitFor(() => {
                expect(screen()).toContain('Bar width');
                expect(screen()).toContain('◀ default ▶');
            });

            press(RIGHT);
            await waitFor(() => {
                expect(screen()).toContain('◀ 10% ▶');
            });
            press(RIGHT);
            await waitFor(() => {
                expect(screen()).toContain('◀ 15% ▶');
                expect(lastPreviewWidth(onPreviewChange)).toBe('15');
            });

            press(ENTER);
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalledWith([{ ...bar, metadata: { display: 'progress', barWidth: '15' } }]);
                expect(screen()).not.toContain('Bar width');
                expect(onPreviewChange.mock.calls.at(-1)?.[0]).toBeNull();
            });
        });
    });

    it('leaves the widget unchanged on ESC', async () => {
        await withEditor(async ({ press, screen, onUpdate, onPreviewChange }) => {
            press('b');
            await waitFor(() => {
                expect(screen()).toContain('◀ default ▶');
            });
            press(LEFT);
            await letReactCatchUp();
            press(RIGHT);
            await waitFor(() => {
                expect(lastPreviewWidth(onPreviewChange)).toBe('10');
            });

            press(ESC);
            await waitFor(() => {
                expect(screen()).not.toContain('Bar width');
                expect(onPreviewChange.mock.calls.at(-1)?.[0]).toBeNull();
            });
            expect(onUpdate).not.toHaveBeenCalled();
        });
    });
});
