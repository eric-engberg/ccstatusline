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

function countBarCells(type: string, display: string, context: RenderContext): number {
    const widget = getWidget(type);
    if (!widget) {
        throw new Error(`no widget registered for ${type}`);
    }
    const item: WidgetItem = { id: 'w', type, metadata: { display } };
    const text = widget.render(item, { isPreview: true, ...context }, DEFAULT_SETTINGS) ?? '';
    return text.match(BAR_GLYPHS)?.length ?? 0;
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

describe('bar width in the line editor', () => {
    const modifierText = (type: string, metadata: Record<string, string>): string | undefined => getWidget(type)?.getEditorDisplay({ id: 'w', type, metadata }).modifierText;
    const keys = (type: string, metadata: Record<string, string>): string[] => (getWidget(type)?.getCustomKeybinds?.({ id: 'w', type, metadata }) ?? []).map(keybind => keybind.key);

    it.each([
        ['session-usage', 'progress', '(long bar, used, 50% width)'],
        ['block-timer', 'slider', '(short bar, 50% width)'],
        ['weekly-reset-timer', 'progress-short', '(medium bar, 50% width)'],
        ['context-percentage', 'slider', '(short bar, 50% width)'],
        ['context-bar', 'slider-only', '(short bar only, 50% width)']
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
