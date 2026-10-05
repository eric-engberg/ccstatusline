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

    // (p) switches between a block bar and a slider of the same size
    it('switches between a block bar and a slider, keeping the size', () => {
        const widget = new ContextBarWidget();
        const base: WidgetItem = { id: 'ctx', type: 'context-bar' };

        const slider = widget.handleEditorAction('toggle-progress', base);
        const block = widget.handleEditorAction('toggle-progress', slider ?? base);

        expect(slider?.metadata).toEqual({ display: 'slider', barWidth: 'medium' });
        expect(block?.metadata).toEqual({ display: 'progress-short' });
        expect(widget.handleEditorAction('toggle-progress', { ...base, metadata: { display: 'slider-only' } })?.metadata)
            .toEqual({ display: 'progress-short', barWidth: 'short', barOnly: 'true' });
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
});
