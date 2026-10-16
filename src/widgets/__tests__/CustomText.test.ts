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
import { CustomTextWidget } from '../CustomText';

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

describe('CustomTextWidget editor', () => {
    // A terminal paste reaches Ink as one input chunk, line breaks and tabs included
    it('inserts pasted text with its tab and trailing line break turned into text', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onComplete = vi.fn();
        const instance = render(
            new CustomTextWidget().renderEditor({
                widget: { id: 'text', type: 'custom-text' },
                onComplete,
                onCancel: vi.fn(),
                action: 'edit-text'
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
                expect(stripAnsi(stdout.getOutput())).toContain('Enter custom text:');
            });

            stdin.write('hello\tworld\r');
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toContain('Enter custom text: hello world');
            });
            // The pasted line break doesn't save the text; Enter does
            expect(onComplete).not.toHaveBeenCalled();
            stdin.write('\r');
            await waitFor(() => {
                expect(onComplete).toHaveBeenCalledTimes(1);
            });
            expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ customText: 'hello world' });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
