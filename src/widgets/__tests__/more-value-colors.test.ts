import React from 'react';
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

const LOW = '\x1b[38;2;0;255;0m';
const MID = '\x1b[38;2;255;255;0m';
const HIGH = '\x1b[38;2;255;0;0m';
const FG_RESET = '\x1b[39m';
// Custom colors, so the escape codes don't depend on the terminal's color support
const colored = (type: string): WidgetItem => ({
    id: 'w',
    type,
    rawValue: true,
    color: 'hex:112233',
    metadata: {
        'valueColors': 'true',
        'valueColor.low': 'hex:00ff00',
        'valueColor.mid': 'hex:ffff00',
        'valueColor.high': 'hex:ff0000'
    }
});

describe.each(['free-memory', 'extra-usage-remaining', 'cache-hit-rate'])('%s value colors', (type) => {
    const widget = getWidget(type);

    it('offers (v), names it on the editor row, opens its editor and keeps its colors', () => {
        const item = colored(type);
        const editorProps = { widget: item, onComplete: () => undefined, onCancel: () => undefined };

        expect(widget?.getCustomKeybinds?.(item).map(keybind => keybind.key)).toContain('v');
        expect(widget?.getEditorDisplay(item).modifierText).toContain('value colors');
        expect(widget?.renderEditor?.({ ...editorProps, action: 'edit-value-colors' })).toBeTruthy();
        // Extra Usage Remaining colors only its value's run, as Extra Usage Used does
        const keepsColors = (target: WidgetItem) => (type === 'extra-usage-remaining' ? widget?.colorsOnlyItsRuns?.(target) : widget?.preservesRenderedColors?.(target));
        expect(keepsColors(item)).toBe(true);
        expect(keepsColors({ id: 'w', type })).toBe(false);
    });
});

// Its preview: 12.4G of 16.0G, 77.5% used
it('colors Memory Usage by how much memory is used', () => {
    const widget = getWidget('free-memory');

    expect(widget?.render(colored('free-memory'), { isPreview: true }, DEFAULT_SETTINGS)).toBe(`${MID}12.4G/16.0G${FG_RESET}`);
    expect(widget?.render({ ...colored('free-memory'), rawValue: false }, { isPreview: true }, DEFAULT_SETTINGS)).toBe(`Mem: ${MID}12.4G/16.0G${FG_RESET}`);
});

// Measured as Extra Usage Used is: the share of the $500.00 limit spent
describe('extra-usage-remaining value colors', () => {
    const widget = getWidget('extra-usage-remaining');
    const spent = (cents: number, limit = 50000): RenderContext => ({ usageData: { extraUsageEnabled: true, extraUsageLimit: limit, extraUsageUsed: cents } });
    const render = (context: RenderContext) => widget?.render(colored('extra-usage-remaining'), context, DEFAULT_SETTINGS);

    it('colors what\'s left by the share of the limit used', () => {
        expect(render(spent(10000))).toBe(`${LOW}$400.00${FG_RESET}`);
        expect(render(spent(35000))).toBe(`${MID}$150.00${FG_RESET}`);
        expect(render(spent(45000))).toBe(`${HIGH}$50.00${FG_RESET}`);
    });

    it('leaves what\'s left to the renderer with a zero limit', () => {
        expect(render(spent(0, 0))).toBe('$0.00');
    });
});

// A higher hit rate is the good one
describe('cache-hit-rate value colors', () => {
    const widget = getWidget('cache-hit-rate');
    const cache = (read: number, creation: number): RenderContext => {
        const currentUsage = { input_tokens: 500, output_tokens: 100, cache_creation_input_tokens: creation, cache_read_input_tokens: read };
        return { data: { context_window: { current_usage: currentUsage } } };
    };
    const render = (context: RenderContext) => widget?.render(colored('cache-hit-rate'), context, DEFAULT_SETTINGS);

    it('colors the hit rate red below 50%, yellow below 80% and green from 80%', () => {
        expect(render(cache(4900, 5100))).toBe(`${LOW}49.0%${FG_RESET}`);
        expect(render(cache(5000, 5000))).toBe(`${MID}50.0%${FG_RESET}`);
        expect(render(cache(8000, 2000))).toBe(`${HIGH}80.0%${FG_RESET}`);
    });

    it('defaults its bands to red, yellow and green in the editor', async () => {
        const editor = renderWidgetEditor(
            (props: WidgetEditorProps) => widget?.renderEditor?.({ ...props, action: 'edit-value-colors' }) ?? React.createElement(React.Fragment),
            { id: 'w', type: 'cache-hit-rate' }
        );

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toMatch(/low\s+Red/);
            expect(output).toMatch(/mid\s+Yellow/);
            expect(output).toMatch(/high\s+Green/);
            expect(output).toMatch(/high from\s+80%/);
        } finally {
            editor.cleanup();
        }
    });
});
