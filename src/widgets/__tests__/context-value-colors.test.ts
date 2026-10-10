import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import { getWidget } from '../../utils/widgets';
import { renderWidgetEditor } from '../shared/__tests__/helpers/widget-editor-harness';

import { describeValueColorsOnTheLine } from './helpers/value-colors-line';

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

describe.each([
    ['context-percentage', 'Ctx Used: '],
    ['context-percentage-usable', 'Ctx(u) Used: ']
])('%s value colors', (type, label) => {
    const widget = getWidget(type);
    const colored: WidgetItem = { id: 'c', type, rawValue: true, color: 'hex:112233', metadata: BAND_COLORS };
    const render = (item: WidgetItem, context: RenderContext) => widget?.render(item, context, DEFAULT_SETTINGS);

    it('colors the percent by how much of the context is used, even when showing what\'s left', () => {
        expect(render(colored, { isPreview: true })).toBe(`${HIGH}90.0%${FG_RESET}`);
        expect(render({ ...colored, metadata: { ...BAND_COLORS, inverse: 'true' } }, { isPreview: true })).toBe(`${HIGH}10.0%${FG_RESET}`);
    });

    // The slider takes one color for its level, the percent after it too
    it('colors the whole slider and its percent by how much is used, even when showing what\'s left', () => {
        const slider = { ...colored, metadata: { ...BAND_COLORS, display: 'slider' } };
        const output = render(slider, { isPreview: true }) ?? '';

        expect(output.startsWith(HIGH)).toBe(true);
        expect(output.endsWith(` 90.0%${FG_RESET}`)).toBe(true);
        expect(output.slice(HIGH.length, -FG_RESET.length)).not.toContain('\x1b');
        expect(render({ ...slider, metadata: { ...slider.metadata, inverse: 'true' } }, { isPreview: true })?.endsWith(` 10.0%${FG_RESET}`)).toBe(true);
        expect(widget?.getCustomKeybinds?.(slider).map(keybind => keybind.key)).toContain('v');
        expect(widget?.colorsOnlyItsRuns?.(slider)).toBe(true);
        expect(widget?.getEditorDisplay(slider).modifierText).toContain('value colors');
    });

    // A bar gradient colors each cell by where it sits, value colors the whole
    // slider by its level, so only one of them is on at a time
    it('sets a saved bar gradient aside, and (g) turns value colors off', () => {
        const slider = { ...colored, metadata: { ...BAND_COLORS, display: 'slider' } };
        const both = { ...slider, metadata: { ...slider.metadata, gradient: 'thermal' } };
        const output = widget?.render(both, { isPreview: true }, { ...DEFAULT_SETTINGS, colorLevel: 3 }) ?? '';

        expect(output.startsWith(HIGH)).toBe(true);
        expect(output.slice(HIGH.length, -FG_RESET.length)).not.toContain('\x1b');
        expect(widget?.getEditorDisplay(both).modifierText).not.toContain('gradient:');

        const withGradient = widget?.handleEditorAction?.('cycle-gradient', slider);
        expect(withGradient?.metadata?.gradient).toBe('traffic');
        expect(withGradient?.metadata?.valueColors).toBeUndefined();
    });

    // The level glyph has no number to color
    it('leaves the level glyph mode as it was, without (v)', () => {
        const glyph = { ...colored, metadata: { ...BAND_COLORS, display: 'glyph' } };

        expect(render(glyph, { isPreview: true })).not.toContain(HIGH);
        expect(widget?.getCustomKeybinds?.(glyph).map(keybind => keybind.key)).not.toContain('v');
        expect(widget?.colorsOnlyItsRuns?.(glyph)).toBe(false);
    });

    it('offers (v), names it on the editor row, opens its editor and colors around its value', () => {
        const editorProps = { widget: colored, onComplete: () => undefined, onCancel: () => undefined };

        expect(widget?.getCustomKeybinds?.(colored).map(keybind => keybind.key)).toContain('v');
        expect(widget?.getEditorDisplay(colored).modifierText).toContain('value colors');
        expect(widget?.renderEditor?.({ ...editorProps, action: 'edit-value-colors' })).toBeTruthy();
        expect(widget?.colorsOnlyItsRuns?.(colored)).toBe(true);
        expect(widget?.colorsOnlyItsRuns?.({ id: 'c', type })).toBe(false);
    });

    // The sample shows what the widget shows, what's left, in the color of what's used
    it('samples what\'s left in the color of what\'s used while showing what\'s left', async () => {
        const remaining = { ...colored, rawValue: false, metadata: { ...BAND_COLORS, inverse: 'true' } };
        const whole = { ...remaining, metadata: { ...remaining.metadata, valueColorScope: 'widget' } };
        const leftLabel = label.replace('Used', 'Left');

        for (const [item, sample, coloredValue] of [
            [remaining, 'Sample: 65% 30% 10% 0% left', `${MID}30%`],
            [whole, `Sample: ${leftLabel}65%  ${leftLabel}30%  ${leftLabel}10%  ${leftLabel}0% left`, `${MID}${leftLabel}30%`]
        ] as const) {
            const editor = renderWidgetEditor(
                (props: WidgetEditorProps) => widget?.renderEditor?.({ ...props, action: 'edit-value-colors' }) ?? React.createElement(React.Fragment),
                item
            );
            try {
                await editor.ready();
                const output = editor.takeColoredOutput();
                expect(stripAnsi(output)).toContain(sample);
                expect(output).toContain(coloredValue);
            } finally {
                editor.cleanup();
            }
        }
    });

    // The preview's 90% used
    describeValueColorsOnTheLine({
        item: { id: 'c', type, metadata: BAND_COLORS },
        context: { isPreview: true },
        label,
        value: '90.0%',
        valueCode: HIGH,
        fallbacks: []
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

    it('paints only the length, and draws plainly with value colors off', () => {
        expect(widget?.render({ ...colored, rawValue: false }, used(95), DEFAULT_SETTINGS)).toBe(`Ctx: ${HIGH}190.0k${FG_RESET}`);
        expect(widget?.render({ id: 'l', type: 'context-length' }, used(95), DEFAULT_SETTINGS)).toBe('Ctx: 190.0k');
    });

    it('offers (v), names it on the editor row, opens its editor and colors around its value', () => {
        const editorProps = { widget: colored, onComplete: () => undefined, onCancel: () => undefined };

        expect(widget?.getCustomKeybinds?.(colored)).toEqual([{ key: 'v', label: '(v)alue colors', action: 'edit-value-colors' }]);
        expect(widget?.getEditorDisplay(colored).modifierText).toBe('(value colors)');
        expect(widget?.renderEditor?.(editorProps)).toBeTruthy();
        expect(widget?.colorsOnlyItsRuns?.(colored)).toBe(true);
    });

    describeValueColorsOnTheLine({
        item: { id: 'l', type: 'context-length', metadata: BAND_COLORS },
        context: used(50),
        label: 'Ctx: ',
        value: '100.0k',
        valueCode: LOW,
        fallbacks: []
    });
});
