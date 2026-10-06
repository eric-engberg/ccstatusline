import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { ModelWidget } from '../Model';

const ITEM: WidgetItem = { id: 'model', type: 'model' };
const RAW_ITEM: WidgetItem = { id: 'model', type: 'model', rawValue: true };

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { ...overrides };
}

describe('ModelWidget', () => {
    describe('render()', () => {
        it('strips parenthetical suffix from display_name', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6[1m]', display_name: 'Opus 4.6 (1M context)' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Opus 4.6');
        });

        it('strips parenthetical from Sonnet display_name', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6 (200K context)' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Sonnet 4.6');
        });

        it.each([
            ['Opus 4.6 (beta) (1M context)', 'Opus 4.6'],
            ['Opus 4.6\t(1M context)', 'Opus 4.6'],
            ['Opus 4.6 (beta) preview', 'Opus 4.6 (beta) preview'],
            ['Opus 4.6 (1M context', 'Opus 4.6 (1M context']
        ])('strips only a trailing parenthetical, from its first "(": %j', (displayName, expected) => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6', display_name: displayName } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe(expected);
        });

        it('leaves name unchanged when no parenthetical', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Sonnet 4.6');
        });

        it('handles model as string (legacy)', () => {
            const ctx = makeContext({ data: { model: 'Claude Opus 4.6 (1M context)' } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Claude Opus 4.6');
        });

        it('includes Model: prefix when rawValue is false', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6[1m]', display_name: 'Opus 4.6 (1M context)' } } });
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('Model: Opus 4.6');
        });

        it('returns null when model is absent', () => {
            const ctx = makeContext({ data: {} });
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when context.data is absent', () => {
            const ctx = makeContext();
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns preview text in preview mode', () => {
            const ctx = makeContext({ isPreview: true });
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('Model: Claude');
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Claude');
        });

        it('uses the label override in place of the default label', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' } } });
            expect(new ModelWidget().render({ ...ITEM, metadata: { label: 'M ' } }, ctx, DEFAULT_SETTINGS)).toBe('M Opus 4.6');
        });

        it('falls back to model id when display_name is absent', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6[1m]' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('claude-opus-4-6[1m]');
        });
    });

    describe('family colors', () => {
        const ORANGE = '\x1b[38;2;255;136;0m';
        const BLUE = '\x1b[38;2;0;0;255m';
        const BASE = '\x1b[38;2;17;34;51m';
        const FG_RESET = '\x1b[39m';
        // Custom colors, so the escape codes don't depend on the terminal's
        // color support (named colors go through chalk)
        const familyItem: WidgetItem = {
            id: 'model',
            type: 'model',
            color: 'hex:112233',
            metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff8800', 'familyColor.sonnet': 'hex:0000ff' }
        };

        it('colors the name by the model\'s family and keeps the label in the widget color', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' } } });

            expect(new ModelWidget().render(familyItem, ctx, DEFAULT_SETTINGS)).toBe(`${BASE}Model: ${FG_RESET}${ORANGE}Opus 5.5${FG_RESET}`);
        });

        it('finds the family in the model id when the display name doesn\'t name it', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-6', display_name: 'Claude' } } });

            expect(new ModelWidget().render({ ...familyItem, rawValue: true }, ctx, DEFAULT_SETTINGS)).toBe(`${BLUE}Claude${FG_RESET}`);
        });

        it('renders plain text when colors are off for the whole status line', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' } } });

            expect(new ModelWidget().render(familyItem, ctx, { ...DEFAULT_SETTINGS, colorLevel: 0 })).toBe('Model: Opus 5.5');
        });

        it('previews as Opus in its family color while family colors are on', () => {
            const widget = new ModelWidget();

            expect(widget.render(familyItem, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe(`${BASE}Model: ${FG_RESET}${ORANGE}Opus${FG_RESET}`);
            expect(widget.render(ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('Model: Claude');
        });

        it('opens the family colors editor with f and names the option on the editor row', () => {
            const widget = new ModelWidget();

            expect(widget.getCustomKeybinds()).toEqual([{ key: 'f', label: '(f)amily colors', action: 'edit-family-colors' }]);
            expect(widget.getEditorDisplay(familyItem).modifierText).toBe('(family colors)');
            expect(widget.getEditorDisplay(ITEM).modifierText).toBeUndefined();
            expect(widget.renderEditor({ widget: ITEM, onComplete: () => undefined, onCancel: () => undefined })).toBeTruthy();
        });

        // Family colors embed their own foreground codes, so the renderer has
        // to leave this widget's foreground alone
        it('keeps its own colors only while family colors are on', () => {
            const widget = new ModelWidget();

            expect(widget.preservesRenderedColors(familyItem)).toBe(true);
            expect(widget.preservesRenderedColors(ITEM)).toBe(false);
        });
    });
});
