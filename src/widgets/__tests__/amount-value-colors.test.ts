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
import { ZERO_COMPACTION_STATS } from '../../utils/compaction';
import { getWidget } from '../../utils/widgets';
import { renderWidgetEditor } from '../shared/__tests__/helpers/widget-editor-harness';

import {
    describeValueColorsOnTheLine,
    renderWidgetLine
} from './helpers/value-colors-line';

const LOW = '\x1b[38;2;0;255;0m';
const MID = '\x1b[38;2;255;255;0m';
const HIGH = '\x1b[38;2;255;0;0m';
const BASE = '\x1b[38;2;17;34;51m';
const FG_RESET = '\x1b[39m';
// Custom colors, so the escape codes don't depend on the terminal's color support
const colored = (type: string, metadata: Record<string, string> = {}): WidgetItem => ({
    id: 'w',
    type,
    color: 'hex:112233',
    metadata: {
        'valueColors': 'true',
        'valueColor.low': 'hex:00ff00',
        'valueColor.mid': 'hex:ffff00',
        'valueColor.high': 'hex:ff0000',
        ...metadata
    }
});
const labeled = (label: string, code: string, value: string) => `${label}${code}${value}${FG_RESET}`;

async function renderEditorOutput(type: string, action = 'edit-value-colors'): Promise<string> {
    const widget = getWidget(type);
    const editor = renderWidgetEditor(
        (props: WidgetEditorProps) => widget?.renderEditor?.({ ...props, action }) ?? React.createElement(React.Fragment),
        { id: 'w', type }
    );

    try {
        await editor.ready();
        return editor.takeOutput();
    } finally {
        editor.cleanup();
    }
}

describe.each([
    ['session-cost', 'v'],
    ['session-cost-rate', 'v'],
    ['daily-cost-rate', 'v'],
    ['tokens-input', 'v'],
    ['tokens-output', 'v'],
    ['tokens-cached', 'v'],
    ['tokens-total', 'v'],
    ['compaction-counter', 'l']
])('%s value colors', (type, key) => {
    const widget = getWidget(type);

    it(`offers (${key}), names it on the editor row, opens its editor and colors around its value`, () => {
        const item = colored(type);
        const editorProps = { widget: item, onComplete: () => undefined, onCancel: () => undefined };

        expect(widget?.getCustomKeybinds?.(item).find(keybind => keybind.action === 'edit-value-colors')?.key).toBe(key);
        expect(widget?.getEditorDisplay(item).modifierText).toContain('value colors');
        expect(widget?.renderEditor?.({ ...editorProps, action: 'edit-value-colors' })).toBeTruthy();
        expect(widget?.colorsOnlyItsRuns?.(item)).toBe(true);
        expect(widget?.colorsOnlyItsRuns?.({ id: 'w', type })).toBe(false);
    });

    it('draws exactly what it did with value colors off', () => {
        const item: WidgetItem = { id: 'w', type };
        const withColorsOff = { ...colored(type), metadata: { ...colored(type).metadata, valueColors: 'false' } };

        expect(widget?.render(withColorsOff, { isPreview: true }, DEFAULT_SETTINGS)).toBe(widget?.render(item, { isPreview: true }, DEFAULT_SETTINGS));
    });
});

// Each widget's preview, with value colors on
describe.each<[string, string, string, string, Record<string, string>]>([
    ['session-cost', 'Cost: ', '$2.45', LOW, {}],
    ['session-cost-rate', 'Rate: ', '$4.90/hr', LOW, {}],
    ['daily-cost-rate', 'Rate Today: ', '$6.20/hr', MID, {}],
    ['tokens-input', 'In: ', '15.2k', MID, {}],
    ['tokens-output', 'Out: ', '3.4k', LOW, {}],
    ['tokens-cached', 'Cached: ', '12.0k', LOW, {}],
    ['tokens-total', 'Total: ', '30.6k', LOW, {}],
    ['compaction-counter', 'Compactions: ', '2', MID, { format: 'text-and-number' }]
])('%s', (type, label, value, valueCode, metadata) => {
    describeValueColorsOnTheLine({
        item: { id: 'w', type, metadata: { ...colored(type).metadata, ...metadata } },
        context: { isPreview: true },
        label,
        value,
        valueCode,
        fallbacks: []
    });
});

describe('session-cost value colors', () => {
    const widget = getWidget('session-cost');
    const cost = (usd: number): RenderContext => ({ data: { cost: { total_cost_usd: usd } } });
    const render = (context: RenderContext, item = colored('session-cost')) => widget?.render(item, context, DEFAULT_SETTINGS);

    it('colors the cost green below $5, yellow below $20 and red from $20', () => {
        expect(render(cost(4.99))).toBe(labeled('Cost: ', LOW, '$4.99'));
        expect(render(cost(5))).toBe(labeled('Cost: ', MID, '$5.00'));
        expect(render(cost(19.99))).toBe(labeled('Cost: ', MID, '$19.99'));
        expect(render(cost(20))).toBe(labeled('Cost: ', HIGH, '$20.00'));
    });

    it('follows typed break points with cents, and raw value mode', () => {
        const item = { ...colored('session-cost', { valueMidFrom: '2.5' }), rawValue: true };

        expect(render(cost(2.49), item)).toBe(`${LOW}$2.49${FG_RESET}`);
        expect(render(cost(2.5), item)).toBe(`${MID}$2.50${FG_RESET}`);
    });

    it('shows its defaults in dollars in the editor', async () => {
        const output = await renderEditorOutput('session-cost');

        expect(output).toContain('Session Cost: value colors');
        expect(output).toMatch(/mid from\s+\$5/);
        expect(output).toMatch(/high from\s+\$20/);
    });
});

describe('cost rate value colors', () => {
    it('colors Session Cost Rate green below $5/hr, yellow below $15/hr and red from $15/hr', () => {
        const widget = getWidget('session-cost-rate');
        // Half an hour of Claude's time
        const rate = (usd: number): RenderContext => ({ data: { cost: { total_cost_usd: usd, total_api_duration_ms: 30 * 60 * 1000 } } });
        const render = (context: RenderContext) => widget?.render(colored('session-cost-rate'), context, DEFAULT_SETTINGS);

        expect(render(rate(2.49))).toBe(labeled('Rate: ', LOW, '$4.98/hr'));
        expect(render(rate(2.5))).toBe(labeled('Rate: ', MID, '$5.00/hr'));
        expect(render(rate(7.5))).toBe(labeled('Rate: ', HIGH, '$15.00/hr'));
    });

    it('colors Daily Cost Rate by today\'s rate', () => {
        const widget = getWidget('daily-cost-rate');
        const rate = (usd: number): RenderContext => ({ dailyCost: { claudeCodeCost: usd, activeMs: 60 * 60 * 1000, clockMs: 2 * 60 * 60 * 1000 } });
        const render = (context: RenderContext) => widget?.render(colored('daily-cost-rate'), context, DEFAULT_SETTINGS);

        expect(render(rate(4))).toBe(labeled('Rate Today: ', LOW, '$4.00/hr'));
        expect(render(rate(6))).toBe(labeled('Rate Today: ', MID, '$6.00/hr'));
        expect(render(rate(15))).toBe(labeled('Rate Today: ', HIGH, '$15.00/hr'));
    });

    it('shows the rate defaults per hour in the editor', async () => {
        const output = await renderEditorOutput('daily-cost-rate');

        expect(output).toMatch(/mid from\s+\$5\/hr/);
        expect(output).toMatch(/high from\s+\$15\/hr/);
    });
});

interface TokenWidgetCase {
    type: string;
    field: 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'totalTokens';
    label: string;
    // A count, how the widget shows it, and its color
    counts: [number, string, string][];
    midFrom: string;
    highFrom: string;
}

// Each token widget's defaults fit how far its count runs in a session
describe.each<TokenWidgetCase>([
    { type: 'tokens-input', field: 'inputTokens', label: 'In: ', counts: [[9999, '10.0k', LOW], [10000, '10.0k', MID], [50000, '50.0k', HIGH]], midFrom: '10k', highFrom: '50k' },
    { type: 'tokens-output', field: 'outputTokens', label: 'Out: ', counts: [[99000, '99.0k', LOW], [100000, '100.0k', MID], [1000000, '1.0M', HIGH]], midFrom: '100k', highFrom: '1M' },
    { type: 'tokens-cached', field: 'cachedTokens', label: 'Cached: ', counts: [[9000000, '9.0M', LOW], [10000000, '10.0M', MID], [100000000, '100.0M', HIGH]], midFrom: '10M', highFrom: '100M' },
    { type: 'tokens-total', field: 'totalTokens', label: 'Total: ', counts: [[9000000, '9.0M', LOW], [10000000, '10.0M', MID], [100000000, '100.0M', HIGH]], midFrom: '10M', highFrom: '100M' }
])('$type value colors', ({ type, field, label, counts, midFrom, highFrom }) => {
    const widget = getWidget(type);
    const tokens = (count: number): RenderContext => ({ tokenMetrics: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 0, [field]: count } });

    it.each(counts)('colors %d tokens', (count, shown, code) => {
        expect(widget?.render(colored(type), tokens(count), DEFAULT_SETTINGS)).toBe(labeled(label, code, shown));
    });

    it('shows its defaults in tokens in the editor', async () => {
        const output = await renderEditorOutput(type);

        expect(output).toMatch(new RegExp(`mid from\\s+${midFrom}`));
        expect(output).toMatch(new RegExp(`high from\\s+${highFrom}`));
    });
});

describe('compaction-counter value colors', () => {
    const widget = getWidget('compaction-counter');
    const compactions = (count: number, tokensReclaimed = 0): RenderContext => ({ compactionData: { ...ZERO_COMPACTION_STATS, count, byTrigger: { auto: count, manual: 0, unknown: 0 }, tokensReclaimed } });
    const render = (item: WidgetItem, context: RenderContext) => widget?.render(item, context, DEFAULT_SETTINGS);

    it('colors the count green at 0, yellow from 1 and red from 3, and not the icon', () => {
        const item = colored('compaction-counter');

        expect(render(item, compactions(0))).toBe(labeled('↻ ', LOW, '0'));
        expect(render(item, compactions(1))).toBe(labeled('↻ ', MID, '1'));
        expect(render(item, compactions(3))).toBe(labeled('↻ ', HIGH, '3'));
    });

    it('colors neither the label nor the trigger split and reclaimed tokens', () => {
        const textItem = colored('compaction-counter', { format: 'text-and-number' });
        const splitItem = colored('compaction-counter', { showTriggers: 'true', showReclaimed: 'true' });

        expect(render(textItem, compactions(2))).toBe(labeled('Compactions: ', MID, '2'));
        expect(render(splitItem, compactions(2, 120000))).toBe(`${labeled('↻ ', MID, '2')} (2 auto) ↓120.0k`);
    });

    it('draws the trigger split and reclaimed tokens in the item color around the count on the status line', () => {
        const item = colored('compaction-counter', { showTriggers: 'true', showReclaimed: 'true' });

        expect(renderWidgetLine(item, { colorLevel: 3 }, compactions(2, 120000))).toBe(`${BASE}↻ ${MID}2${BASE} (2 auto) ↓120.0k${FG_RESET}`);
    });

    it('colors the label and the trigger split with the count when set to the whole widget', () => {
        const item = colored('compaction-counter', { showTriggers: 'true', showReclaimed: 'true', valueColorScope: 'widget' });

        expect(render(item, compactions(2, 120000))).toBe(`${MID}↻ 2 (2 auto) ↓120.0k${FG_RESET}`);
    });

    it('colors the auto, manual and unknown counts, but not tokens reclaimed', () => {
        const auto = colored('compaction-counter', { metric: 'auto' });
        const reclaimed = colored('compaction-counter', { metric: 'reclaimed' });

        expect(render(auto, compactions(3))).toBe(`${HIGH}3${FG_RESET}`);
        expect(widget?.getCustomKeybinds?.(auto).map(keybind => keybind.key)).toEqual(['v', 'l']);
        expect(widget?.getCustomKeybinds?.(reclaimed).map(keybind => keybind.key)).toEqual(['v']);
        expect(render(reclaimed, compactions(3, 120000))).toBe('120.0k');
        expect(widget?.colorsOnlyItsRuns?.(reclaimed)).toBe(false);
        expect(widget?.getEditorDisplay(reclaimed).modifierText).not.toContain('value colors');
    });

    it('shows counts in the editor, and still opens the glyph editor', async () => {
        const output = await renderEditorOutput('compaction-counter');

        expect(output).toContain('Compaction Counter: value colors');
        expect(output).toMatch(/mid from\s+1/);
        expect(output).toMatch(/high from\s+3/);
        expect(await renderEditorOutput('compaction-counter', 'edit-symbol-override')).toContain('Reclaimed');
    });
});
