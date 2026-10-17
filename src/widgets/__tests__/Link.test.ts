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
import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { LinkWidget } from '../Link';

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

function renderLink(
    metadata: Record<string, string> | undefined,
    isPreview = false,
    rawValue = false
): string | null {
    const widget = new LinkWidget();
    const item: WidgetItem = {
        id: 'link',
        type: 'link',
        metadata,
        rawValue
    };
    const context: RenderContext = { isPreview };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('LinkWidget', () => {
    it('renders OSC 8 hyperlink for valid http URL', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        });

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('uses URL as display text when metadata.text is missing', () => {
        const result = renderLink({ url: 'https://example.com/docs' });

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 https://example.com/docs\x1b]8;;\x1b\\');
    });

    it('percent-encodes characters a link can\'t carry as they are', () => {
        const result = renderLink({ url: 'https://example.com/a b/\x1b]52;c;AAAA\x07/docs', text: 'Docs' });

        expect(result).toBe('\x1b]8;;https://example.com/a%20b/%1B]52;c;AAAA%07/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('falls back to plain text for non-http URL schemes', () => {
        const result = renderLink({
            url: 'file:///tmp/report.txt',
            text: 'Report'
        });

        expect(result).toBe('🔗 Report');
    });

    it('shows default placeholder when URL and text are missing', () => {
        const result = renderLink(undefined);

        expect(result).toBe('🔗 no url');
    });

    it('renders preview text exactly like final visible output when unconfigured', () => {
        const result = renderLink(undefined, true);
        expect(result).toBe('🔗 no url');
    });

    it('renders preview text exactly like final visible output when configured', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, true);
        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('renders preview hyperlink in raw mode with emoji hidden', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, true, true);
        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\Docs\x1b]8;;\x1b\\');
    });

    it('hides emoji in raw mode while preserving hyperlink behavior', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, false, true);

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\Docs\x1b]8;;\x1b\\');
    });

    it('shows raw placeholder without emoji when unconfigured', () => {
        const result = renderLink(undefined, false, true);
        expect(result).toBe('no url');
    });

    it('exposes edit URL and edit text keybinds', () => {
        const widget = new LinkWidget();
        const keybinds = widget.getCustomKeybinds();

        expect(keybinds).toEqual([
            { key: 'u', label: '(u)rl', action: 'edit-url' },
            { key: 'e', label: '(e)dit text', action: 'edit-text' }
        ]);
    });

    it('returns editor display with text and short url', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            metadata: {
                url: 'https://example.com/docs',
                text: 'Docs'
            }
        });

        expect(display.displayText).toBe('Link (🔗 Docs)');
        expect(display.modifierText).toBe('(https://example.com/docs)');
    });

    it('omits duplicate no-url modifier when unconfigured in raw mode', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            rawValue: true
        });

        expect(display.displayText).toBe('Link (no url)');
        expect(display.modifierText).toBeUndefined();
    });

    it('omits duplicate url modifier when raw mode label is the URL', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            rawValue: true,
            metadata: { url: 'https://google.com' }
        });

        expect(display.displayText).toBe('Link (https://google.com)');
        expect(display.modifierText).toBeUndefined();
    });

    it('supports colors and raw value mode', () => {
        const widget = new LinkWidget();
        const item: WidgetItem = { id: 'link', type: 'link' };

        expect(widget.supportsColors(item)).toBe(true);
        expect(widget.supportsRawValue()).toBe(true);
    });
});

describe('LinkWidget editor', () => {
    // A URL copied with its line ending arrives in the same input chunk
    it('inserts a pasted URL without its trailing line break', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onComplete = vi.fn();
        const instance = render(
            new LinkWidget().renderEditor({
                widget: { id: 'link', type: 'link' },
                onComplete,
                onCancel: vi.fn(),
                action: 'edit-url'
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
                expect(stripAnsi(stdout.getOutput())).toContain('Enter URL (http/https):');
            });

            stdin.write('https://example.com/docs\n');
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toContain('Enter URL (http/https): https://example.com/docs');
            });
            // The pasted line break doesn't save the link; Enter does
            expect(onComplete).not.toHaveBeenCalled();
            stdin.write('\r');
            await waitFor(() => {
                expect(onComplete).toHaveBeenCalledTimes(1);
            });
            expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ metadata: { url: 'https://example.com/docs' } });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
