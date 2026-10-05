import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getWidget } from '../../utils/widgets';

const BAR_GLYPHS = /[█░▓│]/g;

function renderPreview(type: string, metadata: Record<string, string>, context: RenderContext = {}): string {
    const widget = getWidget(type);
    if (!widget) {
        throw new Error(`no widget registered for ${type}`);
    }
    const item: WidgetItem = { id: 'w', type, metadata };
    return widget.render(item, { isPreview: true, ...context }, DEFAULT_SETTINGS) ?? '';
}

function countBarCells(type: string, display: string, context: RenderContext): number {
    return renderPreview(type, { display }, context).match(BAR_GLYPHS)?.length ?? 0;
}

// Every bar widget, with each bar mode and the cells that mode draws by default
const BAR_MODES: [string, string, number][] = [
    ['session-usage', 'progress', 32],
    ['session-usage', 'progress-short', 16],
    ['session-usage', 'slider', 10],
    ['session-usage', 'slider-only', 10],
    ['weekly-usage', 'progress', 32],
    ['weekly-sonnet-usage', 'progress-short', 16],
    ['weekly-opus-usage', 'slider', 10],
    ['fable-weekly-usage', 'slider-only', 10],
    ['block-timer', 'progress', 32],
    ['block-timer', 'slider', 10],
    ['reset-timer', 'progress-short', 16],
    ['reset-timer', 'slider-only', 10],
    ['weekly-reset-timer', 'progress', 32],
    ['weekly-reset-timer', 'slider', 10],
    ['extra-usage-utilization', 'progress', 32],
    ['extra-usage-utilization', 'slider', 10],
    ['context-percentage', 'slider', 10],
    ['context-percentage-usable', 'slider-only', 10],
    ['context-bar', 'progress', 32],
    ['context-bar', 'progress-short', 16],
    ['context-bar', 'slider', 10],
    ['context-bar', 'slider-only', 10]
];

describe('bar cells', () => {
    it.each(BAR_MODES)('%s in %s mode draws its default size without a sized bar', (type, display, defaultCells) => {
        expect(countBarCells(type, display, {})).toBe(defaultCells);
    });

    it.each(BAR_MODES)('%s in %s mode draws the cells the renderer sized it to', (type, display) => {
        expect(countBarCells(type, display, { barCells: 23 })).toBe(23);
    });
});

// Every bar widget, with each bar style it offers
const BAR_STYLES: [string, string][] = [
    ['session-usage', 'progress-short'],
    ['session-usage', 'slider'],
    ['weekly-usage', 'progress'],
    ['weekly-sonnet-usage', 'slider'],
    ['weekly-opus-usage', 'progress-short'],
    ['fable-weekly-usage', 'slider'],
    ['block-timer', 'progress'],
    ['block-timer', 'slider'],
    ['reset-timer', 'progress-short'],
    ['reset-timer', 'slider'],
    ['weekly-reset-timer', 'progress'],
    ['weekly-reset-timer', 'slider'],
    ['extra-usage-utilization', 'progress'],
    ['extra-usage-utilization', 'slider'],
    ['context-percentage', 'slider'],
    ['context-percentage-usable', 'slider'],
    ['context-bar', 'progress-short'],
    ['context-bar', 'slider']
];

// The text ends with the bar: a cell, or a block bar's closing bracket
const ENDS_WITH_BAR = /[█░▓│\]]$/;

describe('bar sizes and numbers', () => {
    it.each(BAR_STYLES)('%s in %s mode draws any of the fixed sizes', (type, display) => {
        const cells = (barWidth: string) => renderPreview(type, { display, barWidth }).match(BAR_GLYPHS)?.length ?? 0;

        expect(cells('short')).toBe(10);
        expect(cells('medium')).toBe(16);
        expect(cells('long')).toBe(32);
    });

    it.each(BAR_STYLES)('%s in %s mode shows only its bar with the numbers off', (type, display) => {
        expect(renderPreview(type, { display })).not.toMatch(ENDS_WITH_BAR);
        expect(renderPreview(type, { display, barOnly: 'true' })).toMatch(ENDS_WITH_BAR);
    });
});

describe('bar width in the line editor', () => {
    const modifierText = (type: string, metadata: Record<string, string>): string | undefined => getWidget(type)?.getEditorDisplay({ id: 'w', type, metadata }).modifierText;
    const keys = (type: string, metadata: Record<string, string>): string[] => (getWidget(type)?.getCustomKeybinds?.({ id: 'w', type, metadata }) ?? []).map(keybind => keybind.key);

    it.each([
        ['session-usage', 'progress', '(block bar, 50% width, used)'],
        ['block-timer', 'slider', '(slider bar, 50% width)'],
        ['weekly-reset-timer', 'progress-short', '(block bar, 50% width)'],
        ['context-percentage', 'slider', '(slider bar, 50% width)'],
        ['context-bar', 'slider-only', '(slider bar, 50% width, numbers off)']
    ])('%s in %s mode shows the width and offers (b)', (type, display, expected) => {
        expect(modifierText(type, { display, barWidth: '50' })).toBe(expected);
        expect(keys(type, { display })).toContain('b');
    });

    it.each([
        ['session-usage', 'time'],
        ['block-timer', 'time'],
        ['context-percentage', 'none']
    ])('%s in %s mode, which has no bar, neither shows a width nor offers (b)', (type, display) => {
        expect(modifierText(type, { display, barWidth: 'fill' }) ?? '').not.toContain('width');
        expect(keys(type, { display })).not.toContain('b');
    });
});
