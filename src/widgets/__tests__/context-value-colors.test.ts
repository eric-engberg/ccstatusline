import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getWidget } from '../../utils/widgets';

const LOW = '\x1b[38;2;0;255;0m';
const MID = '\x1b[38;2;255;255;0m';
const HIGH = '\x1b[38;2;255;0;0m';
const FG_RESET = '\x1b[39m';
const BAND_COLORS = {
    'valueColors': 'true',
    'valueColor.low': 'hex:00ff00',
    'valueColor.mid': 'hex:ffff00',
    'valueColor.high': 'hex:ff0000'
};

// A 200k context window, the given share of it used
function used(percent: number): RenderContext {
    return {
        data: { model: { id: 'claude-sonnet-4-5' }, context_window: { context_window_size: 200000, used_percentage: percent } },
        tokenMetrics: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: percent * 2000 }
    };
}

describe.each(['context-percentage', 'context-percentage-usable'])('%s value colors', (type) => {
    const widget = getWidget(type);
    const colored: WidgetItem = { id: 'c', type, rawValue: true, color: 'hex:112233', metadata: BAND_COLORS };
    const render = (item: WidgetItem, context: RenderContext) => widget?.render(item, context, DEFAULT_SETTINGS);

    it('colors the percent by how much of the context is used, even when showing what\'s left', () => {
        expect(render(colored, { isPreview: true })).toBe(`${HIGH}90.0%${FG_RESET}`);
        expect(render({ ...colored, metadata: { ...BAND_COLORS, inverse: 'true' } }, { isPreview: true })).toBe(`${HIGH}10.0%${FG_RESET}`);
    });

    it('leaves the slider and level glyph modes as they were, without (v)', () => {
        for (const display of ['slider', 'glyph']) {
            const item = { ...colored, metadata: { ...BAND_COLORS, display } };

            expect(render(item, { isPreview: true })).not.toContain(HIGH);
            expect(widget?.getCustomKeybinds?.(item).map(keybind => keybind.key)).not.toContain('v');
            expect(widget?.preservesRenderedColors?.(item)).toBe(false);
        }
    });

    it('offers (v), names it on the editor row, opens its editor and keeps its colors', () => {
        const editorProps = { widget: colored, onComplete: () => undefined, onCancel: () => undefined };

        expect(widget?.getCustomKeybinds?.(colored).map(keybind => keybind.key)).toContain('v');
        expect(widget?.getEditorDisplay(colored).modifierText).toContain('value colors');
        expect(widget?.renderEditor?.({ ...editorProps, action: 'edit-value-colors' })).toBeTruthy();
        expect(widget?.preservesRenderedColors?.(colored)).toBe(true);
        expect(widget?.preservesRenderedColors?.({ id: 'c', type })).toBe(false);
    });
});

it('colors Context % live, green below 70% used, yellow below 90% and red from 90%', () => {
    const widget = getWidget('context-percentage');
    const colored: WidgetItem = { id: 'c', type: 'context-percentage', rawValue: true, metadata: BAND_COLORS };
    const render = (percent: number) => widget?.render(colored, used(percent), DEFAULT_SETTINGS);

    expect(render(69.9)).toBe(`${LOW}69.9%${FG_RESET}`);
    expect(render(70)).toBe(`${MID}70.0%${FG_RESET}`);
    expect(render(90)).toBe(`${HIGH}90.0%${FG_RESET}`);
});

// Context Length's tokens, measured against the context window as Context % is
describe('context-length value colors', () => {
    const widget = getWidget('context-length');
    const colored: WidgetItem = { id: 'l', type: 'context-length', rawValue: true, color: 'hex:112233', metadata: BAND_COLORS };

    it('colors the length by how much of the context window it fills', () => {
        expect(widget?.render(colored, used(50), DEFAULT_SETTINGS)).toBe(`${LOW}100.0k${FG_RESET}`);
        expect(widget?.render(colored, used(75), DEFAULT_SETTINGS)).toBe(`${MID}150.0k${FG_RESET}`);
        // The preview's 18.6k of a 200k window
        expect(widget?.render(colored, { isPreview: true }, DEFAULT_SETTINGS)).toBe(`${LOW}18.6k${FG_RESET}`);
    });

    it('keeps the label in the widget color and draws plainly with value colors off', () => {
        expect(widget?.render({ ...colored, rawValue: false }, used(95), DEFAULT_SETTINGS)).toBe(`\x1b[38;2;17;34;51mCtx: ${FG_RESET}${HIGH}190.0k${FG_RESET}`);
        expect(widget?.render({ id: 'l', type: 'context-length' }, used(95), DEFAULT_SETTINGS)).toBe('Ctx: 190.0k');
    });

    it('offers (v), names it on the editor row, opens its editor and keeps its colors', () => {
        const editorProps = { widget: colored, onComplete: () => undefined, onCancel: () => undefined };

        expect(widget?.getCustomKeybinds?.(colored)).toEqual([{ key: 'v', label: '(v)alue colors', action: 'edit-value-colors' }]);
        expect(widget?.getEditorDisplay(colored).modifierText).toBe('(value colors)');
        expect(widget?.renderEditor?.(editorProps)).toBeTruthy();
        expect(widget?.preservesRenderedColors?.(colored)).toBe(true);
    });
});
