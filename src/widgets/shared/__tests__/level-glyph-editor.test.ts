import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';
import { EDIT_LEVELS_ACTION } from '../level-glyph';
import { renderLevelGlyphEditor } from '../level-glyph-editor';
import { SYMBOL_OVERRIDE_ACTION } from '../symbol-override';

import {
    DOWN,
    ENTER,
    ESC,
    LEFT,
    RIGHT,
    renderWidgetEditor
} from './helpers/widget-editor-harness';

const glyphMode: WidgetItem = { id: 'ctx', type: 'context-percentage', metadata: { display: 'glyph' } };

function renderEditor(action: string, widget: WidgetItem = glyphMode) {
    const editor = (props: WidgetEditorProps) => renderLevelGlyphEditor({ ...props, action });
    return renderWidgetEditor(editor, widget);
}

describe('level break points editor', () => {
    it('lists the break points and samples the glyph at each level', async () => {
        const editor = renderEditor(EDIT_LEVELS_ACTION);

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toContain('Glyph levels');
            expect(output).toContain('🟢 under 20%  ⚡ 20-69%  🔥 70-89%  🚨 90% and up');
            expect(output).toMatch(/Medium from\s+20%/);
            expect(output).toMatch(/High from\s+70%/);
            expect(output).toMatch(/Critical from\s+90%/);
        } finally {
            editor.cleanup();
        }
    });

    it('steps a break point by 5 and saves it', async () => {
        const editor = renderEditor(EDIT_LEVELS_ACTION);

        try {
            await editor.ready();
            await editor.press(DOWN, RIGHT);
            expect(editor.takeOutput()).toContain('⚡ 20-74%  🔥 75-89%');
            await editor.press(ENTER);
            expect(editor.savedMetadata()).toEqual({ display: 'glyph', levelFromHigh: '75' });
        } finally {
            editor.cleanup();
        }
    });

    it('steps a break point down with ←', async () => {
        const editor = renderEditor(EDIT_LEVELS_ACTION);

        try {
            await editor.ready();
            await editor.press(LEFT);
            expect(editor.takeOutput()).toContain('🟢 under 15%  ⚡ 15-69%');
            await editor.press(ENTER);
            expect(editor.savedMetadata()).toEqual({ display: 'glyph', levelFromMedium: '15' });
        } finally {
            editor.cleanup();
        }
    });

    it('takes a typed break point', async () => {
        const editor = renderEditor(EDIT_LEVELS_ACTION);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, '9');
            expect(editor.takeOutput()).toContain('Critical from (1-100): 9');
            await editor.press('5', ENTER, ENTER);
            expect(editor.savedMetadata()).toEqual({ display: 'glyph', levelFromCritical: '95' });
        } finally {
            editor.cleanup();
        }
    });

    it('says what\'s wrong with a typed break point and lets ESC drop it', async () => {
        const editor = renderEditor(EDIT_LEVELS_ACTION);

        try {
            await editor.ready();
            await editor.press('7', '0', ENTER);
            expect(editor.takeOutput()).toContain('Medium has to start below High (70%).');
            await editor.press(ESC, ENTER);
            expect(editor.savedMetadata()).toEqual({ display: 'glyph' });
            expect(editor.onCancel).not.toHaveBeenCalled();
        } finally {
            editor.cleanup();
        }
    });

    it('cancels with ESC', async () => {
        const editor = renderEditor(EDIT_LEVELS_ACTION);

        try {
            await editor.ready();
            await editor.press(RIGHT, ESC);
            expect(editor.onCancel).toHaveBeenCalledTimes(1);
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.cleanup();
        }
    });

    // The glyphs themselves use the shared glyph editor, one row per level
    it('edits the glyphs in the glyph editor, a row per level with its range', async () => {
        const editor = renderEditor(SYMBOL_OVERRIDE_ACTION, { ...glyphMode, metadata: { display: 'glyph', levelFromHigh: '60' } });

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toContain('Low (under 20%)');
            expect(output).toContain('Medium (20-59%)');
            expect(output).toContain('Critical (90% and up)');
            await editor.press(DOWN, DOWN, '★', ENTER);
            expect(editor.savedMetadata()).toEqual({ display: 'glyph', levelFromHigh: '60', levelGlyphHigh: '★' });
        } finally {
            editor.cleanup();
        }
    });
});
