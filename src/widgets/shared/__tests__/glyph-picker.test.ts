import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';
import { createGlyphCatalog } from '../glyph-catalog';
import { GLYPH_GROUPS } from '../glyph-groups';
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

const cwd: WidgetItem = { id: 'cwd', type: 'current-working-dir' };
const singleGlyphEditor = (props: WidgetEditorProps) => renderSymbolOverrideEditor(props, '');

// The curated groups, then a group per Nerd Font icon set
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
            await editor.press(SHIFT_TAB, PAGE_DOWN);
            const output = editor.takeOutput();
            expect(lastGroup?.glyphs.length).toBeGreaterThan(120);
            expect(output).toContain('↑ more');
            expect(output).toContain(lastGroup?.glyphs[60]?.name);
            await editor.press(PAGE_UP);
            expect(editor.takeOutput()).toContain(lastGroup?.glyphs[0]?.name);
        } finally {
            editor.cleanup();
        }
    });

    it('notes that the Nerd Font groups need a Nerd Font', async () => {
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
        const groupIndex = GLYPH_GROUPS.findIndex(group => group.glyphs.some(entry => entry.glyph === '⎇'));
        const entry = GLYPH_GROUPS[groupIndex]?.glyphs.find(candidate => candidate.glyph === '⎇');
        const editor = renderWidgetEditor(singleGlyphEditor, { ...cwd, character: '⎇' });

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
});
