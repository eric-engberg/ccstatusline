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
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import { ItemsEditor } from '../ItemsEditor';

class MockTtyStream extends PassThrough {
    isTTY = true;
    // Wide enough that the widget's keys fit on one help line
    columns = 240;
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

interface EditorTools {
    press: (key: string) => void;
    screen: () => string;
    onUpdate: ReturnType<typeof vi.fn>;
}

// Holds the line the way the app does, whose settings, and with them the
// preview, take each update, so each key's change shows on screen
function StatefulItemsEditor({ initialWidgets, onUpdate }: {
    initialWidgets: WidgetItem[];
    onUpdate: (widgets: WidgetItem[]) => void;
}) {
    const [widgets, setWidgets] = useState(initialWidgets);

    return React.createElement(ItemsEditor, {
        widgets,
        onUpdate: (next: WidgetItem[]) => {
            onUpdate(next);
            setWidgets(next);
        },
        onBack: vi.fn(),
        lineNumber: 1,
        settings: DEFAULT_SETTINGS
    });
}

// Opens the line editor on one widget and runs the steps against it
async function withEditor(widget: WidgetItem, steps: (tools: EditorTools) => Promise<void>): Promise<void> {
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

    const instance = render(
        React.createElement(StatefulItemsEditor, { initialWidgets: [widget], onUpdate }),
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
            expect(screen()).toContain('(p) bar style');
        });
        await steps({ press: key => stdin.write(key), screen, onUpdate });
    } finally {
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
    }
}

const lastUpdateMetadata = (onUpdate: ReturnType<typeof vi.fn>): Record<string, string> | undefined => {
    const widgets = onUpdate.mock.calls.at(-1)?.[0] as WidgetItem[] | undefined;
    return widgets?.[0]?.metadata;
};

describe('ItemsEditor cell bar empty cells', () => {
    it('toggles a cell bar\'s empty cells from faint to gray and back with (y), in the row, the help and the line', async () => {
        const cells: WidgetItem = { id: 'opus', type: 'weekly-opus-usage', metadata: { display: 'cells', barWidth: 'long' } };
        await withEditor(cells, async ({ press, screen, onUpdate }) => {
            expect(screen()).toContain('(y) gray empty cells');
            expect(screen()).toContain('Weekly Opus Usage (cells ▮, long, used)');

            press('y');
            await waitFor(() => {
                expect(screen()).toContain('Weekly Opus Usage (cells ▮, gray, long, used)');
            });
            expect(screen()).toContain('(y) faint empty cells');
            expect(lastUpdateMetadata(onUpdate)).toEqual({ display: 'cells', barWidth: 'long', barEmpty: 'gray' });

            press('y');
            await waitFor(() => {
                expect(screen()).toContain('Weekly Opus Usage (cells ▮, long, used)');
            });
            expect(screen()).toContain('(y) gray empty cells');
            expect(lastUpdateMetadata(onUpdate)).toEqual({ display: 'cells', barWidth: 'long' });
        });
    });

    it('keeps gray through (p) from one cell shape to the next', async () => {
        const gray: WidgetItem = { id: 'bar', type: 'context-bar', metadata: { display: 'cells', barEmpty: 'gray' } };
        await withEditor(gray, async ({ press, screen }) => {
            expect(screen()).toContain('Context Bar (cells ▮, gray, medium)');

            press('p');
            await waitFor(() => {
                expect(screen()).toContain('Context Bar (cells ■, gray, medium)');
            });
            expect(screen()).toContain('(y) faint empty cells');
        });
    });

    // (y) does nothing elsewhere (see the input handler's tests), so the help
    // line leaves it out until (p) reaches a cell bar
    it('offers (y) only once (p) reaches a cell bar', async () => {
        const block: WidgetItem = { id: 'opus', type: 'weekly-opus-usage', metadata: { display: 'progress' } };
        await withEditor(block, async ({ press, screen }) => {
            expect(screen()).toContain('Weekly Opus Usage (block bar, long, used)');
            expect(screen()).not.toContain('(y)');

            press('p');
            await waitFor(() => {
                expect(screen()).toContain('Weekly Opus Usage (slider bar, long, used)');
            });
            expect(screen()).not.toContain('(y)');

            press('p');
            await waitFor(() => {
                expect(screen()).toContain('Weekly Opus Usage (cells ▮, long, used)');
            });
            expect(screen()).toContain('(y) gray empty cells');
        });
    });
});
