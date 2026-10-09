import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as usage from '../../utils/usage';
import { ContextBarWidget } from '../ContextBar';
import { ContextLengthWidget } from '../ContextLength';
import { ContextWindowWidget } from '../ContextWindow';

import { describeValueColorsOnTheLine } from './helpers/value-colors-line';

const LOW = '\x1b[38;2;0;255;0m';
const HIGH = '\x1b[38;2;255;0;0m';
const FG_RESET = '\x1b[39m';
const BAND_COLORS = {
    'valueColors': 'true',
    'valueColor.low': 'hex:00ff00',
    'valueColor.mid': 'hex:ffff00',
    'valueColor.high': 'hex:ff0000'
};

describe('ContextBarWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(usage, 'makeUsageProgressBar').mockImplementation((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders from context_window data when available', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 20000,
                        output_tokens: 10000,
                        cache_creation_input_tokens: 5000,
                        cache_read_input_tokens: 5000
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:15.0:16] 30k/200k (15%)');
    });

    it('falls back to token metrics and model context size', () => {
        const context: RenderContext = {
            data: { model: { id: 'claude-3-5-sonnet-20241022' } },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 50000
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:25.0:16] 50k/200k (25%)');
    });

    it('uses 1M context label model IDs in fallback mode', () => {
        const context: RenderContext = {
            data: { model: { id: 'Opus 4.6 (1M context)' } },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 50000
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:5.0:16] 50k/1.0M (5%)');
    });

    it('uses 1M in parentheses model IDs in fallback mode', () => {
        const context: RenderContext = {
            data: { model: { id: 'Opus 4.6 (1M)' } },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 50000
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:5.0:16] 50k/1.0M (5%)');
    });

    it('clamps usage percentage to 100 when context length exceeds total', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 250000,
                        output_tokens: 50000,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:100.0:16] 250k/200k (100%)');
    });

    it('supports raw mode without context label', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 5000,
                        output_tokens: 5000,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('[bar:2.5:16] 5k/200k (3%)');
    });

    it('renders long progress bar mode when configured', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 20000,
                        output_tokens: 10000,
                        cache_creation_input_tokens: 5000,
                        cache_read_input_tokens: 5000
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({
            id: 'ctx',
            type: 'context-bar',
            metadata: { display: 'progress' }
        }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:15.0:32] 30k/200k (15%)');
    });

    it('shows both numbers, the percent only, the counts only, or none after the bar', () => {
        const widget = new ContextBarWidget();
        const render = (barNumbers?: string) => widget.render(
            { id: 'ctx', type: 'context-bar', rawValue: true, metadata: { display: 'slider', ...(barNumbers ? { barNumbers } : {}) } },
            { isPreview: true },
            DEFAULT_SETTINGS
        );

        expect(render()).toBe('▓▓▓▓▓▓▓▓▓░ 180k/200k (90%)');
        expect(render('percent')).toBe('▓▓▓▓▓▓▓▓▓░ 90%');
        expect(render('counts')).toBe('▓▓▓▓▓▓▓▓▓░ 180k/200k');
        expect(render('none')).toBe('▓▓▓▓▓▓▓▓▓░');
    });

    it('cycles its numbers with n and names the choice on the editor row', () => {
        const widget = new ContextBarWidget();
        const item: WidgetItem = { id: 'ctx', type: 'context-bar', metadata: { barNumbers: 'percent' } };

        expect(widget.getCustomKeybinds(item)).toContainEqual({ key: 'n', label: '(n)umbers', action: 'cycle-bar-numbers' });
        expect(widget.getEditorDisplay(item).modifierText).toBe('(block bar, medium, % only)');
    });

    // (p) switches between a block bar and a slider of the same size
    it('switches between a block bar and a slider, keeping the size', () => {
        const widget = new ContextBarWidget();
        const base: WidgetItem = { id: 'ctx', type: 'context-bar' };

        const slider = widget.handleEditorAction('toggle-progress', base);
        const block = widget.handleEditorAction('toggle-progress', slider ?? base);

        expect(slider?.metadata).toEqual({ display: 'slider', barWidth: 'medium' });
        expect(block?.metadata).toEqual({ display: 'progress-short' });
        expect(widget.handleEditorAction('toggle-progress', { ...base, metadata: { display: 'slider-only' } })?.metadata)
            .toEqual({ display: 'progress-short', barWidth: 'short', barNumbers: 'none' });
    });

    it('formats context preview samples with the selected styles', () => {
        const context: RenderContext = { isPreview: true };

        expect(new ContextLengthWidget().render({
            id: 'length',
            type: 'context-length',
            numberFormat: { style: 'whole' }
        }, context, DEFAULT_SETTINGS)).toBe('Ctx: 19k');
        expect(new ContextWindowWidget().render({
            id: 'window',
            type: 'context-window',
            numberFormat: { decimals: 2 }
        }, context, DEFAULT_SETTINGS)).toBe('Win: 200.00k');
        expect(new ContextBarWidget().render({
            id: 'bar',
            type: 'context-bar',
            numberFormat: { decimals: 2 }
        }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:90.0:16] 180.00k/200.00k (90.00%)');
    });

    // The bar takes one color for how much of the context is used, its numbers too
    describe('value colors', () => {
        const colored: WidgetItem = { id: 'bar', type: 'context-bar', rawValue: true, color: 'hex:112233', metadata: BAND_COLORS };
        const preview: RenderContext = { isPreview: true };

        it('colors the whole bar and its numbers by how much of the context is used', () => {
            const widget = new ContextBarWidget();
            const quarter: RenderContext = { data: { context_window: { context_window_size: 200000, current_usage: { input_tokens: 50000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } } };

            expect(widget.render(colored, preview, DEFAULT_SETTINGS)).toBe(`${HIGH}[bar:90.0:16] 180k/200k (90%)${FG_RESET}`);
            expect(widget.render(colored, quarter, DEFAULT_SETTINGS)).toBe(`${LOW}[bar:25.0:16] 50k/200k (25%)${FG_RESET}`);
            expect(widget.render({ ...colored, rawValue: false }, preview, DEFAULT_SETTINGS)).toBe(`Context: ${HIGH}[bar:90.0:16] 180k/200k (90%)${FG_RESET}`);
            expect(widget.render({ id: 'bar', type: 'context-bar', rawValue: true }, preview, DEFAULT_SETTINGS)).toBe('[bar:90.0:16] 180k/200k (90%)');
        });

        it('offers (v), names it on the editor row, opens its editor and colors around its value', () => {
            const widget = new ContextBarWidget();
            const editorProps = { widget: colored, onComplete: () => undefined, onCancel: () => undefined };

            expect(widget.getCustomKeybinds(colored).map(keybind => keybind.key)).toContain('v');
            expect(widget.getEditorDisplay(colored).modifierText).toBe('(block bar, medium, value colors)');
            expect(widget.renderEditor({ ...editorProps, action: 'edit-value-colors' })).toBeTruthy();
            expect(widget.colorsOnlyItsRuns(colored)).toBe(true);
            expect(widget.colorsOnlyItsRuns({ id: 'bar', type: 'context-bar' })).toBe(false);
        });

        // A bar gradient colors each cell by where it sits, value colors the whole
        // bar by its level, so only one of them is on at a time
        it('sets a saved bar gradient aside, and (g) turns value colors off', () => {
            const widget = new ContextBarWidget();
            const slider = { ...colored, metadata: { ...BAND_COLORS, display: 'slider', barNumbers: 'none' } };
            const both = { ...slider, metadata: { ...slider.metadata, gradient: 'thermal' } };

            expect(widget.render(both, preview, { ...DEFAULT_SETTINGS, colorLevel: 3 })).toBe(`${HIGH}▓▓▓▓▓▓▓▓▓░${FG_RESET}`);
            expect(widget.getEditorDisplay(both).modifierText).toBe('(slider bar, short, numbers off, value colors)');

            const withGradient = widget.handleEditorAction('cycle-gradient', slider);
            expect(withGradient?.metadata?.gradient).toBe('traffic');
            expect(withGradient?.metadata?.valueColors).toBeUndefined();
        });

        describeValueColorsOnTheLine({
            item: { id: 'bar', type: 'context-bar', metadata: BAND_COLORS },
            context: preview,
            label: 'Context: ',
            value: '[bar:90.0:16] 180k/200k (90%)',
            valueCode: HIGH,
            fallbacks: []
        });
    });
});
