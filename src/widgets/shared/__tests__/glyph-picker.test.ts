import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';
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

const cwd: WidgetItem = { id: 'cwd', type: 'current-working-dir' };
const singleGlyphEditor = (props: WidgetEditorProps) => renderSymbolOverrideEditor(props, '');

const firstGroup = GLYPH_GROUPS[0];
const lastGroup = GLYPH_GROUPS.at(-1);
const groupHeader = (index: number) => `${GLYPH_GROUPS[index]?.name} (${index + 1}/${GLYPH_GROUPS.length})`;

function savedWidget(editor: ReturnType<typeof renderWidgetEditor>): WidgetItem | undefined {
    return editor.onComplete.mock.calls.at(-1)?.[0];
}

describe('glyph picker', () => {
    it('opens with → on the first group, naming the highlighted glyph', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            expect(editor.takeOutput()).toContain('→ pick from a list');
            await editor.press(RIGHT);
            const output = editor.takeOutput();
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
            await editor.press(RIGHT, RIGHT);
            expect(editor.takeOutput()).toContain(firstGroup?.glyphs[1]?.name);
            await editor.press(DOWN);
            expect(editor.takeOutput()).toContain(firstGroup?.glyphs[11]?.name);
        } finally {
            editor.cleanup();
        }
    });

    it('pages through the groups with Tab, Shift+Tab and PgDn', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await editor.press(RIGHT, TAB);
            expect(editor.takeOutput()).toContain(groupHeader(1));
            await editor.press(SHIFT_TAB, SHIFT_TAB);
            expect(editor.takeOutput()).toContain(groupHeader(GLYPH_GROUPS.length - 1));
            await editor.press(PAGE_DOWN);
            expect(editor.takeOutput()).toContain(groupHeader(0));
        } finally {
            editor.cleanup();
        }
    });

    it('notes that the Nerd Font groups need a Nerd Font', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await editor.press(RIGHT, SHIFT_TAB);
            const output = editor.takeOutput();
            expect(lastGroup?.needsNerdFont).toBe(true);
            expect(output).toContain('Needs a Nerd Font');
        } finally {
            editor.cleanup();
        }
    });

    it('picks the highlighted glyph with Enter, and saves it with Enter', async () => {
        const editor = renderWidgetEditor(singleGlyphEditor, cwd);

        try {
            await editor.ready();
            await editor.press(RIGHT, RIGHT);
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
            await editor.press(RIGHT, RIGHT);
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
            await editor.press(RIGHT);
            const output = editor.takeOutput();
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
            await editor.press(DOWN, RIGHT, ENTER, ENTER);
            expect(savedWidget(editor)?.metadata).toEqual({ deleteGlyph: firstGroup?.glyphs[0]?.glyph });
        } finally {
            editor.cleanup();
        }
    });
});
