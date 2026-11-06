import { render } from 'ink';
import { PassThrough } from 'node:stream';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { waitFor } from '../../tui/__tests__/helpers/wait-for-ink';
import { CustomSymbolWidget } from '../CustomSymbol';

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

describe('CustomSymbolWidget editor', () => {
    // A symbol copied with its line ending arrives in the same input chunk
    it('sets the symbol to a pasted emoji without its trailing line break', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onComplete = vi.fn();
        const instance = render(
            new CustomSymbolWidget().renderEditor({
                widget: { id: 'symbol', type: 'custom-symbol' },
                onComplete,
                onCancel: vi.fn(),
                action: 'edit-symbol'
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
                expect(stripAnsi(stdout.getOutput())).toContain('Enter custom symbol: (empty)');
            });

            stdin.write('🚀\n');
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toContain('Enter custom symbol: 🚀');
            });
            // The pasted line break doesn't save the symbol; Enter does
            expect(onComplete).not.toHaveBeenCalled();
            stdin.write('\r');
            await waitFor(() => {
                expect(onComplete).toHaveBeenCalledTimes(1);
            });
            expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ customSymbol: '🚀' });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
