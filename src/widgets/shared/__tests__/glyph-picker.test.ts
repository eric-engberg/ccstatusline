import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { SkinTone } from '../../../types/SkinTone';
import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';
import { createGlyphCatalog } from '../glyph-catalog';
import { GLYPH_GROUPS } from '../glyph-groups';
import { SkinToneContext } from '../skin-tone';
import {
    renderSymbolOverrideEditor,
    renderSymbolSlotsEditor
} from '../symbol-override';

import {
    DOWN,
    ENTER,
    ESC,
    RIGHT,
    renderWidgetEditor
} from './helpers/widget-editor-harness';

const TAB = '\t';
const SHIFT_TAB = '\x1b[Z';
const PAGE_DOWN = '\x1b[6~';
const PAGE_UP = '\x1b[5~';
const CTRL_T = '\x14';

const cwd: WidgetItem = { id: 'cwd', type: 'current-working-dir' };
const singleGlyphEditor = (props: WidgetEditorProps) => renderSymbolOverrideEditor(props, '');

// The curated groups, with skin tones added to their emoji
const groups = createGlyphCatalog().groups;
const firstGroup = groups[0];
const lastGroup = groups.at(-1);
const groupHeader = (index: number) => `${groups[index]?.name} (${index + 1}/${groups.length})`;

type Editor = ReturnType<typeof renderWidgetEditor>;

function savedWidget(editor: Editor): WidgetItem | undefined {
    return editor.onComplete.mock.calls.at(-1)?.[0];
}

// The picker loads its glyphs when it opens, so it draws "Loading glyphs…"
// first; this waits for the text it draws once they're in
async function waitForOutput(editor: Editor, text: string): Promise<string> {
    let output = '';
    const deadline = Date.now() + 3000;
    do {
        output += editor.takeOutput();
        if (output.includes(text)) {
            return output;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
    } while (Date.now() < deadline);
    throw new Error(`The picker never showed ${JSON.stringify(text)}`);
}

// → opens the picker for the highlighted row; returns what it drew
async function openPicker(editor: Editor): Promise<string> {
    await editor.press(RIGHT);
    return waitForOutput(editor, 'Pick a glyph');
}

async function type(editor: Editor, text: string): Promise<void> {
    await editor.press(...Array.from(text));
}

describe('glyph picker', () => {
    it('opens with → on the first group, naming the highlighted glyph', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            expect(editor.takeOutput()).toContain('→ pick from a list');
            const output = await openPicker(editor);
            expect(output).toContain(`Pick a glyph: ${groupHeader(0)}`);
            expect(output).toContain(firstGroup?.glyphs[0]?.name);
        } finally {
            editor.cleanup();
        }
    });

    it('moves along a row and down a row with the arrows', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await openPicker(editor);
            await editor.press(RIGHT);
            expect(editor.takeOutput()).toContain(firstGroup?.glyphs[1]?.name);
            await editor.press(DOWN);
            expect(editor.takeOutput()).toContain(firstGroup?.glyphs[11]?.name);
        } finally {
            editor.cleanup();
        }
    });

    it('switches groups with Tab and Shift+Tab, wrapping both ways', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await openPicker(editor);
            await editor.press(TAB);
            expect(editor.takeOutput()).toContain(groupHeader(1));
            await editor.press(SHIFT_TAB, SHIFT_TAB);
            expect(editor.takeOutput()).toContain(groupHeader(groups.length - 1));
            await editor.press(TAB);
            expect(editor.takeOutput()).toContain(groupHeader(0));
        } finally {
            editor.cleanup();
        }
    });

    // Six rows of ten: a page is 60 glyphs
    it('moves a page through a big group with PgDn and PgUp', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await openPicker(editor);
            await editor.press(PAGE_DOWN);
            const output = editor.takeOutput();
            expect(firstGroup?.glyphs.length).toBeGreaterThan(60);
            expect(output).toContain('↑ more');
            expect(output).toContain(firstGroup?.glyphs[60]?.name);
            await editor.press(PAGE_UP);
            expect(editor.takeOutput()).toContain(firstGroup?.glyphs[0]?.name);
        } finally {
            editor.cleanup();
        }
    });

    it('notes that the Nerd Font group needs a Nerd Font', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await openPicker(editor);
            await editor.press(SHIFT_TAB);
            expect(lastGroup?.needsNerdFont).toBe(true);
            expect(editor.takeOutput()).toContain('Needs a Nerd Font');
        } finally {
            editor.cleanup();
        }
    });

    it('picks the highlighted glyph with Enter, and saves it with Enter', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await openPicker(editor);
            await editor.press(RIGHT);
            editor.takeOutput();
            await editor.press(ENTER);
            const output = editor.takeOutput();
            expect(output).not.toContain('Pick a glyph');
            expect(output).toContain(`Glyph: ${firstGroup?.glyphs[1]?.glyph}`);
            expect(editor.onComplete).not.toHaveBeenCalled();
            await editor.press(ENTER);
            expect(savedWidget(editor)?.character).toBe(firstGroup?.glyphs[1]?.glyph);
        } finally {
            editor.cleanup();
        }
    });

    it('goes back without picking on ESC', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, { ...cwd, character: '★' });

        try {
            await editor.ready();
            await openPicker(editor);
            await editor.press(RIGHT);
            editor.takeOutput();
            await editor.press(ESC);
            const output = editor.takeOutput();
            expect(output).not.toContain('Pick a glyph');
            expect(output).toContain('Glyph: ★');
            expect(editor.onCancel).not.toHaveBeenCalled();
            await editor.press(ENTER);
            expect(savedWidget(editor)?.character).toBe('★');
        } finally {
            editor.cleanup();
        }
    });

    it('opens on the current glyph when the picker has it', async () => {
        const groupIndex = GLYPH_GROUPS.findIndex(group => group.glyphs.some(entry => entry.glyph === '✔'));
        const entry = GLYPH_GROUPS[groupIndex]?.glyphs.find(candidate => candidate.glyph === '✔');
        const editor = renderWidgetEditor(singleGlyphEditor, { ...cwd, character: '✔' });

        try {
            await editor.ready();
            const output = await openPicker(editor);
            expect(output).toContain(groupHeader(groupIndex));
            expect(output).toContain(entry?.name);
        } finally {
            editor.cleanup();
        }
    });

    it('sets only the highlighted row of a widget with several glyphs', async () => {
        const slots = [
            { id: 'insertGlyph', label: 'Insertions', defaultSymbol: '+' },
            { id: 'deleteGlyph', label: 'Deletions', defaultSymbol: '-' }
        ];
        const twoGlyphEditor = (props: WidgetEditorProps) => renderSymbolSlotsEditor(props, slots);
        const editor = renderWidgetEditor(twoGlyphEditor, { id: 'changes', type: 'git-changes' });

        try {
            await editor.ready();
            await editor.press(DOWN);
            await openPicker(editor);
            await editor.press(ENTER, ENTER);
            expect(savedWidget(editor)?.metadata).toEqual({ deleteGlyph: firstGroup?.glyphs[0]?.glyph });
        } finally {
            editor.cleanup();
        }
    });

    describe('search', () => {
        it('finds any Nerd Font glyph by the words of its name, and picks it', async () => {
            const editor = renderWidgetEditor(singleGlyphEditor, cwd);

            try {
                await editor.ready();
                await openPicker(editor);
                await type(editor, 'pull req create');
                const output = editor.takeOutput();
                expect(output).toMatch(/Pick a glyph: "pull req create" \(\d+ match/);
                expect(output).toContain('git pull request create (nf-cod-git_pull_request_create)');
                expect(output).toContain('Needs a Nerd Font');
                await editor.press(ENTER, ENTER);
                expect(savedWidget(editor)?.character).toBe('');
            } finally {
                editor.cleanup();
            }
        });

        it('edits the search with Backspace, clears it with ESC, and goes back on a second ESC', async () => {
            const editor = renderWidgetEditor(singleGlyphEditor, cwd);

            try {
                await editor.ready();
                await openPicker(editor);
                await type(editor, 'folderx');
                expect(editor.takeOutput()).toContain('No glyph names match.');
                await editor.press('\x7f');
                expect(editor.takeOutput()).toContain('Pick a glyph: "folder"');
                await editor.press(ESC);
                expect(editor.takeOutput()).toContain(`Pick a glyph: ${groupHeader(0)}`);
                await editor.press(ESC);
                expect(editor.takeOutput()).not.toContain('Pick a glyph');
                expect(editor.onCancel).not.toHaveBeenCalled();
            } finally {
                editor.cleanup();
            }
        });

        it('scrolls a long list of matches to keep the highlighted glyph in view', async () => {
            const editor = renderWidgetEditor(singleGlyphEditor, cwd);

            try {
                await editor.ready();
                await openPicker(editor);
                await type(editor, 'folder');
                expect(editor.takeOutput()).toContain('↓ more');
                await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN);
                const output = editor.takeOutput();
                expect(output).toContain('↑ more');
                expect(output).toMatch(/\[.{1,2}\s*\]/);
            } finally {
                editor.cleanup();
            }
        });
    });

    describe('skin tone', () => {
        // The glyph editor inside the settings' skin tone, as the line editor provides it
        const withTone = (tone: SkinTone | undefined, setTone: (next: SkinTone | undefined) => void = vi.fn()) => (props: WidgetEditorProps) => React.createElement(
            SkinToneContext.Provider,
            { value: { tone, setTone } },
            singleGlyphEditor(props)
        );

        it('cycles the tone with Ctrl+T and shows and picks emoji in it', async () => {
            const editor = renderWidgetEditor(singleGlyphEditor, cwd);

            try {
                await editor.ready();
                expect(await openPicker(editor)).toContain('Skin tone: default (Ctrl+T)');
                await type(editor, 'thumbs up');
                editor.takeOutput();
                await editor.press(CTRL_T);
                const output = editor.takeOutput();
                expect(output).toContain('Skin tone: 🏻 light');
                // Ctrl+T isn't typed into the search
                expect(output).toContain('Pick a glyph: "thumbs up"');
                expect(output).toContain('👍🏻  thumbs up: light skin tone');
                await editor.press(ENTER, ENTER);
                expect(savedWidget(editor)?.character).toBe('👍🏻');
            } finally {
                editor.cleanup();
            }
        });

        it('opens in the saved tone and saves the next one to the settings', async () => {
            const setTone = vi.fn();
            const editor = renderWidgetEditor(withTone('dark', setTone), cwd);

            try {
                await editor.ready();
                expect(await openPicker(editor)).toContain('Skin tone: 🏿 dark');
                await type(editor, 'thumbs up');
                expect(editor.takeOutput()).toContain('👍🏿');
                await editor.press(CTRL_T);
                expect(setTone).toHaveBeenLastCalledWith(undefined);
                expect(editor.takeOutput()).toContain('Skin tone: default');
            } finally {
                editor.cleanup();
            }
        });

        it('leaves emoji without skin tones alone', async () => {
            const editor = renderWidgetEditor(withTone('medium'), cwd);

            try {
                await editor.ready();
                await openPicker(editor);
                await type(editor, 'clown');
                expect(editor.takeOutput()).toContain('🤡  clown face');
                await editor.press(ENTER, ENTER);
                expect(savedWidget(editor)?.character).toBe('🤡');
            } finally {
                editor.cleanup();
            }
        });

        // Ink lays out each part of a multi-part emoji as its own character, so a
        // second Text after it on the line would overwrite the tone or the rest
        it('shows a toned or joined emoji whole in the glyph editor', async () => {
            for (const character of ['👍🏾', '👩‍💻']) {
                const editor = renderWidgetEditor(singleGlyphEditor, { ...cwd, character });

                try {
                    await editor.ready();
                    expect(editor.takeOutput()).toContain(`${character} (default:`);
                } finally {
                    editor.cleanup();
                }
            }
        });

        it('opens on the emoji a toned glyph is made from', async () => {
            const editor = renderWidgetEditor(withTone('medium-dark'), { ...cwd, character: '👍🏾' });

            try {
                await editor.ready();
                expect(await openPicker(editor)).toContain('👍🏾  thumbs up: medium-dark skin tone');
            } finally {
                editor.cleanup();
            }
        });

        // Opening the picker and pressing Enter keeps the glyph as it was
        it('opens in a toned glyph\'s own tone, without saving it', async () => {
            const setTone = vi.fn();
            const editor = renderWidgetEditor(withTone(undefined, setTone), { ...cwd, character: '👍🏾' });

            try {
                await editor.ready();
                const output = await openPicker(editor);
                expect(output).toContain('Skin tone: 🏾 medium-dark');
                expect(output).toContain('👍🏾  thumbs up: medium-dark skin tone');
                await editor.press(ENTER, ENTER);
                expect(savedWidget(editor)?.character).toBe('👍🏾');
                expect(setTone).not.toHaveBeenCalled();
            } finally {
                editor.cleanup();
            }
        });

        it('cycles on from a toned glyph\'s tone with Ctrl+T, and saves it', async () => {
            const setTone = vi.fn();
            const editor = renderWidgetEditor(withTone('light', setTone), { ...cwd, character: '👍🏾' });

            try {
                await editor.ready();
                await openPicker(editor);
                await editor.press(CTRL_T);
                expect(setTone).toHaveBeenLastCalledWith('dark');
                expect(editor.takeOutput()).toContain('👍🏿  thumbs up: dark skin tone');
            } finally {
                editor.cleanup();
            }
        });

        // The groups don't hold two-person emoji, so search finds it
        it('opens in a two-person emoji\'s tone when the groups don\'t have it', async () => {
            const editor = renderWidgetEditor(withTone('light'), { ...cwd, character: '🧑🏾‍🤝‍🧑🏾' });

            try {
                await editor.ready();
                expect(await openPicker(editor)).toContain('Skin tone: 🏾 medium-dark');
                await type(editor, 'people holding');
                expect(editor.takeOutput()).toContain('🧑🏾‍🤝‍🧑🏾  people holding hands: medium-dark skin tone');
                await editor.press(ENTER, ENTER);
                expect(savedWidget(editor)?.character).toBe('🧑🏾‍🤝‍🧑🏾');
            } finally {
                editor.cleanup();
            }
        });

        it('opens a glyph without a tone in the saved tone', async () => {
            const editor = renderWidgetEditor(withTone('dark'), { ...cwd, character: '👍' });

            try {
                await editor.ready();
                const output = await openPicker(editor);
                expect(output).toContain('Skin tone: 🏿 dark');
                expect(output).toContain('👍🏿  thumbs up: dark skin tone');
            } finally {
                editor.cleanup();
            }
        });
    });
});
