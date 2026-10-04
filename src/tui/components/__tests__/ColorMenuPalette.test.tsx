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
import { ColorMenu } from '../ColorMenu';

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

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

const ESC = '\x1b';
const ENTER = '\r';
const DOWN = '\x1b[B';
const RIGHT = '\x1b[C';
const PICKER_TITLE = 'Select ANSI 256 Color';

function renderMenu(widgets: WidgetItem[], settings: Partial<Settings> = {}, columns = 160) {
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdout = new MockTtyStream();
    stdout.columns = columns;
    const stderr = new MockTtyStream();
    const chunks: string[] = [];
    stdout.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });
    const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();

    const instance = render(
        React.createElement(ColorMenu, {
            widgets,
            settings: { ...DEFAULT_SETTINGS, colorLevel: 2, ...settings },
            onUpdate,
            onBack: vi.fn()
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

    const output = () => stripAnsi(chunks.join(''));

    return {
        press: async (...inputs: string[]) => {
            await flushInk();
            for (const input of inputs) {
                stdin.write(input);
                await flushInk();
            }
        },
        lastUpdate: () => onUpdate.mock.calls.at(-1)?.[0],
        // The latest frame of whichever screen was drawn last
        latestScreen: () => {
            const text = output();
            const start = Math.max(text.lastIndexOf(PICKER_TITLE), text.lastIndexOf('Configure Colors'));
            return text.slice(start);
        },
        cleanup: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

const orangeModel: WidgetItem = { id: '1', type: 'model', color: 'ansi256:208' };

describe('ColorMenu 256-color grid', () => {
    it('opens with (a) at 256 colors and at truecolor, on the current color', async () => {
        for (const colorLevel of [2, 3] as const) {
            const menu = renderMenu([orangeModel], { colorLevel });
            try {
                await menu.press('a');
                const screen = menu.latestScreen();
                expect(screen).toContain(PICKER_TITLE);
                expect(screen).toContain('ANSI 208  #FF8700');
            } finally {
                menu.cleanup();
            }
        }
    });

    it('is not offered at 16 colors', async () => {
        const menu = renderMenu([orangeModel], { colorLevel: 1 });
        try {
            await menu.press('a');
            expect(menu.latestScreen()).not.toContain(PICKER_TITLE);
            expect(menu.latestScreen()).not.toContain('(a)nsi256');
        } finally {
            menu.cleanup();
        }
    });

    it('lists (a)nsi256 next to (h)ex at truecolor', async () => {
        const menu = renderMenu([orangeModel], { colorLevel: 3 });
        try {
            await menu.press();
            expect(menu.latestScreen()).toContain('(h)ex, (a)nsi256,');
        } finally {
            menu.cleanup();
        }
    });

    it('leaves the settings untouched when opened on a palette color', async () => {
        const defaultColored: WidgetItem = { id: '1', type: 'model' };
        const menu = renderMenu([defaultColored]);
        try {
            await menu.press('a');
            expect(menu.latestScreen()).toContain('ANSI 6  Cyan');
            expect(menu.lastUpdate() ?? [defaultColored]).toEqual([defaultColored]);
        } finally {
            menu.cleanup();
        }
    });

    it('starts a hex color on the nearest palette color, and previews it', async () => {
        const menu = renderMenu([{ id: '1', type: 'model', color: 'hex:FF8800' }], { colorLevel: 3 });
        try {
            await menu.press('a');
            expect(menu.latestScreen()).toContain('ANSI 208  #FF8700');
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:208');
        } finally {
            menu.cleanup();
        }
    });

    it('applies each highlighted color as the cursor moves, for the live preview', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', RIGHT);
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:209');
            await menu.press(DOWN);
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:215');
            expect(menu.latestScreen()).toContain('ANSI 215  #FFAF5F');
        } finally {
            menu.cleanup();
        }
    });

    it('jumps to a typed color number', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', '4', '5');
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:45');
            expect(menu.latestScreen()).toContain('ANSI 45  #00D7FF');
        } finally {
            menu.cleanup();
        }
    });

    it('keeps the highlighted color on Enter', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', RIGHT, ENTER);
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:209');
            expect(menu.latestScreen()).toContain('Configure Colors');
        } finally {
            menu.cleanup();
        }
    });

    it('restores the original color on ESC', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', RIGHT, ESC);
            expect(menu.lastUpdate()).toEqual([orangeModel]);
            expect(menu.latestScreen()).toContain('Configure Colors');
        } finally {
            menu.cleanup();
        }
    });

    it('sets the background in background mode, keeping basic colors as named colors', async () => {
        const widget: WidgetItem = { id: '1', type: 'model', color: 'cyan', backgroundColor: 'bgRed' };
        const menu = renderMenu([widget]);
        try {
            await menu.press('f', 'a', RIGHT);
            expect(menu.lastUpdate()?.[0]).toEqual({ ...widget, backgroundColor: 'bgGreen' });
        } finally {
            menu.cleanup();
        }
    });

    it('marks the highlighted color with narrower cells in a narrow terminal', async () => {
        const wide = renderMenu([orangeModel]);
        const narrow = renderMenu([orangeModel], {}, 60);
        try {
            await wide.press('a');
            await narrow.press('a');
            expect(wide.latestScreen()).toContain('[]');
            expect(narrow.latestScreen()).not.toContain('[]');
            expect(narrow.latestScreen()).toContain('*');
        } finally {
            wide.cleanup();
            narrow.cleanup();
        }
    });
});
