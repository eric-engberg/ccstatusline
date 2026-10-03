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

import type { WidgetItem } from '../../../types/Widget';
import { EffortColorsEditor } from '../effort-colors-editor';

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

const ESC = '\x1b';
const ENTER = '\r';
const DOWN = '\x1b[B';
const RIGHT = '\x1b[C';
const LEFT = '\x1b[D';

function renderEditor(widget: WidgetItem) {
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const onComplete = vi.fn<(widget: WidgetItem) => void>();
    const onCancel = vi.fn<() => void>();

    const instance = render(
        React.createElement(EffortColorsEditor, { widget, onComplete, onCancel }),
        { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
    );

    return {
        onComplete,
        onCancel,
        press: async (...inputs: string[]) => {
            for (const input of inputs) {
                stdin.write(input);
                await flushInk();
            }
        },
        // Output written since the previous call, i.e. the latest frame(s)
        takeOutput: () => {
            const output = stripAnsi(stdout.getOutput());
            stdout.clearOutput();
            return output;
        },
        savedMetadata: () => onComplete.mock.calls.at(-1)?.[0].metadata,
        cleanup: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

const rawWithParens: WidgetItem = { id: 'e', type: 'thinking-effort', rawValue: true, metadata: { brackets: '()' } };

describe('EffortColorsEditor', () => {
    it('samples the highlighted level, with the widget\'s brackets, and follows the cursor', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            expect(editor.takeOutput()).toContain('Sample: (low)');

            await editor.press(DOWN);
            expect(editor.takeOutput()).toContain('Sample: (medium)');
        } finally {
            editor.cleanup();
        }
    });

    it('keeps sampling the last level while the brackets row is highlighted', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN);
            const output = editor.takeOutput();
            expect(output).toContain('Sample: (max)');
            expect(output).toMatch(/▶\s+brackets/);
        } finally {
            editor.cleanup();
        }
    });

    it('cycles the highlighted level through the named colors and saves on Enter', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            // high defaults to yellow; the named colors run ... green, yellow, blue ...
            await editor.press(DOWN, DOWN, RIGHT, ENTER);
            expect(editor.savedMetadata()?.['levelColor.high']).toBe('blue');
        } finally {
            editor.cleanup();
        }
    });

    it('cycles backwards with the left arrow', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            await editor.press(DOWN, DOWN, LEFT, ENTER);
            expect(editor.savedMetadata()?.['levelColor.high']).toBe('green');
        } finally {
            editor.cleanup();
        }
    });

    it('switches the brackets between matching the effort and the widget color', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN);
            expect(editor.takeOutput()).toContain('Match effort');

            await editor.press(RIGHT);
            expect(editor.takeOutput()).toContain('Widget color');

            await editor.press(ENTER);
            expect(editor.savedMetadata()?.bracketColor).toBe('widget');
        } finally {
            editor.cleanup();
        }
    });

    it('turns level colors on with Space', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            expect(editor.takeOutput()).toContain('Level colors: Off');

            await editor.press(' ');
            expect(editor.takeOutput()).toContain('Level colors: On');

            await editor.press(ENTER);
            expect(editor.savedMetadata()?.levelColors).toBe('true');
        } finally {
            editor.cleanup();
        }
    });

    it('sets a custom color typed after (x)', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            await editor.press(DOWN, DOWN, DOWN, 'x', '#ff8800', ENTER, ENTER);
            expect(editor.savedMetadata()?.['levelColor.xhigh']).toBe('hex:ff8800');
        } finally {
            editor.cleanup();
        }
    });

    it('keeps asking when the custom color is invalid, and ESC leaves the prompt', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            await editor.press('x', 'orange', ENTER);
            expect(editor.takeOutput()).toContain('Not a color');

            await editor.press(ESC);
            expect(editor.takeOutput()).toContain('Sample: (low)');
            expect(editor.onCancel).not.toHaveBeenCalled();

            await editor.press(ENTER);
            expect(editor.savedMetadata()?.['levelColor.low']).toBeUndefined();
        } finally {
            editor.cleanup();
        }
    });

    it('restores the default colors with (d) but leaves level colors on', async () => {
        const editor = renderEditor({
            ...rawWithParens,
            metadata: { 'brackets': '()', 'levelColors': 'true', 'levelColor.low': 'blue', 'bracketColor': 'widget' }
        });

        try {
            await flushInk();
            await editor.press('d', ENTER);
            expect(editor.savedMetadata()).toEqual({ brackets: '()', levelColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });

    it('discards changes on ESC', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await flushInk();
            await editor.press(RIGHT, ' ', ESC);
            expect(editor.onCancel).toHaveBeenCalledTimes(1);
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.cleanup();
        }
    });
});
