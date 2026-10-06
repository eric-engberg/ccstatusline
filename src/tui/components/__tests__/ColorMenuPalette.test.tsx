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

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { EMPTY_THEME_SLOT_CONTEXT } from '../../../utils/effective-theme-colors';
import {
    ColorMenu,
    type ColorMenuProps
} from '../ColorMenu';

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

// Polls until the condition holds; a fixed delay races Ink on a busy machine
async function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    do {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        if (condition()) {
            await letReactCatchUp();
            return true;
        }
    } while (Date.now() < deadline);
    return false;
}

// Long enough for a key to be handled, for checks that it did nothing
function settle() {
    return new Promise((resolve) => {
        setTimeout(resolve, 150);
    });
}

const ESC = '\x1b';
const ENTER = '\r';
const DOWN = '\x1b[B';
const RIGHT = '\x1b[C';
const PICKER_TITLE = 'Select ANSI 256 Color';

type HarnessProps = Pick<ColorMenuProps, 'widgets' | 'settings' | 'onUpdate' | 'onBack' | 'onTabSwap'>;

// Holds what the app owns for the menu: which channel is edited, and whether
// separator rows show
function ColorMenuHarness(props: HarnessProps) {
    const [editingBackground, setEditingBackground] = useState(false);
    const [showSeparators, setShowSeparators] = useState(false);

    return React.createElement(ColorMenu, {
        ...props,
        lineIndex: 0,
        themeSlotContext: EMPTY_THEME_SLOT_CONTEXT,
        editingBackground,
        onEditingBackgroundChange: setEditingBackground,
        showSeparators,
        onShowSeparatorsChange: setShowSeparators
    });
}

function renderMenu(widgets: WidgetItem[], settings: Partial<Settings> = {}, columns = 160, onTabSwap?: () => void) {
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
        React.createElement(ColorMenuHarness, {
            widgets,
            settings: { ...DEFAULT_SETTINGS, colorLevel: 2, ...settings },
            onUpdate,
            onBack: vi.fn(),
            onTabSwap
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

    // The menu is drawn and listening for keys
    const ready = async () => {
        if (!(await waitUntil(() => chunks.length > 0))) {
            throw new Error('The menu never drew');
        }
    };

    return {
        // Every key here redraws the screen, so each waits for that before the
        // next key goes out
        press: async (...inputs: string[]) => {
            await ready();
            for (const input of inputs) {
                const drawn = chunks.length;
                stdin.write(input);
                if (!(await waitUntil(() => chunks.length > drawn))) {
                    throw new Error(`No redraw after ${JSON.stringify(input)}`);
                }
            }
        },
        // For keys that should do nothing
        pressIgnored: async (...inputs: string[]) => {
            await ready();
            for (const input of inputs) {
                stdin.write(input);
            }
            await settle();
        },
        // For a key that must do nothing: waits until Ink has read it (its
        // handlers run in that same read) and React has caught up
        pressUnhandled: async (input: string) => {
            await ready();
            stdin.write(input);
            if (!(await waitUntil(() => stdin.readableLength === 0))) {
                throw new Error(`${JSON.stringify(input)} was never read`);
            }
        },
        lastUpdate: () => onUpdate.mock.calls.at(-1)?.[0],
        // The latest frame of whichever screen was drawn last
        latestScreen: () => {
            const text = output();
            const start = Math.max(text.lastIndexOf(PICKER_TITLE), text.lastIndexOf('Edit Line 1'));
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
            await menu.pressIgnored('a');
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
            expect(menu.latestScreen()).toContain('Edit Line 1');
        } finally {
            menu.cleanup();
        }
    });

    it('restores the original color on ESC', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', RIGHT, ESC);
            expect(menu.lastUpdate()).toEqual([orangeModel]);
            expect(menu.latestScreen()).toContain('Edit Line 1');
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

    // Under a theme a channel's color is edited only once it's pinned, as with
    // the other color keys
    it('opens under a Powerline theme only on a pinned channel', async () => {
        const themed: Partial<Settings> = { powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, theme: 'nord-aurora' } };
        const unpinned = renderMenu([orangeModel], themed);
        const pinned = renderMenu([{ ...orangeModel, pinColor: true }], themed);
        try {
            await unpinned.pressUnhandled('a');
            expect(unpinned.latestScreen()).not.toContain(PICKER_TITLE);
            expect(unpinned.latestScreen()).toContain('press (p) to override');

            await pinned.press('a');
            expect(pinned.latestScreen()).toContain(PICKER_TITLE);
            expect(pinned.latestScreen()).toContain('ANSI 208  #FF8700');
        } finally {
            unpinned.cleanup();
            pinned.cleanup();
        }
    });

    // Leaving would keep a color that was only being previewed
    it('keeps Tab from switching to the widget editor while open', async () => {
        const onTabSwap = vi.fn();
        const menu = renderMenu([orangeModel], {}, 160, onTabSwap);
        try {
            await menu.press('a');
            await menu.pressUnhandled('\t');
            expect(onTabSwap).not.toHaveBeenCalled();
            expect(menu.latestScreen()).toContain(PICKER_TITLE);
        } finally {
            menu.cleanup();
        }
    });
});
