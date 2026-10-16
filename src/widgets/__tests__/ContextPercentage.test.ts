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
import { ContextPercentageWidget } from '../ContextPercentage';

function render(modelId: string | undefined, contextLength: number, rawValue = false, inverse = false) {
    const widget = new ContextPercentageWidget();
    const context: RenderContext = {
        data: modelId ? { model: { id: modelId } } : undefined,
        tokenMetrics: {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            contextLength
        }
    };
    const item: WidgetItem = {
        id: 'context-percentage',
        type: 'context-percentage',
        rawValue,
        metadata: inverse ? { inverse: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ContextPercentageWidget', () => {
    it('toggles inverse metadata and editor modifier', () => {
        const widget = new ContextPercentageWidget();
        const base: WidgetItem = {
            id: 'context-percentage',
            type: 'context-percentage'
        };

        const inverted = widget.handleEditorAction('toggle-inverse', base);
        const cleared = widget.handleEditorAction('toggle-inverse', inverted ?? base);

        expect(inverted?.metadata?.inverse).toBe('true');
        expect(cleared?.metadata?.inverse).toBe('false');
        expect(widget.getEditorDisplay(base).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay({
            ...base,
            metadata: { inverse: 'true' }
        }).modifierText).toBe('(remaining)');
    });

    it('reports the default label for the current used/remaining mode', () => {
        const widget = new ContextPercentageWidget();
        const base: WidgetItem = { id: 'context-percentage', type: 'context-percentage' };

        expect(widget.getLabelPrefix(base)).toBe('Ctx Used: ');
        expect(widget.getLabelPrefix({ ...base, metadata: { inverse: 'true' } })).toBe('Ctx Left: ');
    });

    it('prefers context_window percentage over token metrics when both exist', () => {
        const widget = new ContextPercentageWidget();
        const item: WidgetItem = {
            id: 'context-percentage',
            type: 'context-percentage'
        };
        const context: RenderContext = {
            data: {
                model: { id: 'claude-3-5-sonnet-20241022' },
                context_window: {
                    context_window_size: 200000,
                    used_percentage: 9.3
                }
            },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 100000
            }
        };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Ctx Used: 9.3%');
    });

    describe('Sonnet 4.5 with 1M context window', () => {
        it('should calculate percentage using 1M denominator for Sonnet 4.5 with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000);
            expect(result).toBe('Ctx Used: 4.2%');
        });

        it('should calculate percentage using 1M denominator for Sonnet 4.5 (raw value) with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000, true);
            expect(result).toBe('4.2%');
        });

        it('should calculate percentage using 1M denominator for 1M context label model IDs', () => {
            const result = render('Opus 4.6 (1M context)', 42000);
            expect(result).toBe('Ctx Used: 4.2%');
        });

        it('should calculate percentage using 1M denominator for 1M in parentheses model IDs', () => {
            const result = render('Opus 4.6 (1M)', 42000);
            expect(result).toBe('Ctx Used: 4.2%');
        });
    });

    // The percentage and the glyph keep the slider's size and numbers setting
    // for (p) to bring back
    it('cycles the percentage, a slider and the level glyph', () => {
        const widget = new ContextPercentageWidget();
        const base: WidgetItem = { id: 'ctx', type: 'context-percentage' };

        const slider = widget.handleEditorAction('toggle-slider', base);
        const glyph = widget.handleEditorAction('toggle-slider', slider ?? base);
        const text = widget.handleEditorAction('toggle-slider', glyph ?? base);
        const again = widget.handleEditorAction('toggle-slider', text ?? base);

        expect(slider?.metadata).toEqual({ display: 'slider' });
        expect(glyph?.metadata).toEqual({ display: 'glyph', barWidth: 'short' });
        expect(text?.metadata).toEqual({ barWidth: 'short' });
        expect(again?.metadata).toEqual({ display: 'slider' });
        expect(widget.handleEditorAction('toggle-slider', { ...base, metadata: { display: 'slider-only' } })?.metadata)
            .toEqual({ display: 'glyph', barWidth: 'short', barNumbers: 'none' });
    });

    describe('level glyph', () => {
        const glyphItem = (metadata: Record<string, string> = {}): WidgetItem => ({ id: 'ctx', type: 'context-percentage', metadata: { display: 'glyph', ...metadata } });
        // 50k of a 200k window: 25% used
        const quarterUsed: RenderContext = { tokenMetrics: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 50000 } };

        it('shows the glyph for the used percent instead of the number', () => {
            const widget = new ContextPercentageWidget();

            expect(widget.render(glyphItem(), quarterUsed, DEFAULT_SETTINGS)).toBe('Ctx Used: ⚡️');
            expect(widget.render({ ...glyphItem(), rawValue: true }, quarterUsed, DEFAULT_SETTINGS)).toBe('⚡️');
            expect(widget.render({ ...glyphItem(), rawValue: true }, { isPreview: true }, DEFAULT_SETTINGS)).toBe('🚨');
        });

        // What's left would flip the levels, so the glyph always measures what's used
        it('follows the used percent while set to show what\'s left', () => {
            const widget = new ContextPercentageWidget();

            expect(widget.render(glyphItem({ inverse: 'true' }), quarterUsed, DEFAULT_SETTINGS)).toBe('Ctx Used: ⚡️');
        });

        it('uses the widget\'s own glyphs and break points', () => {
            const widget = new ContextPercentageWidget();
            const item = { ...glyphItem({ levelFromMedium: '30', levelGlyphLow: '·' }), rawValue: true };

            expect(widget.render(item, quarterUsed, DEFAULT_SETTINGS)).toBe('·');
        });

        it('offers (g) and (l) instead of the used/remaining and bar keys', () => {
            const widget = new ContextPercentageWidget();

            expect(widget.getCustomKeybinds(glyphItem()).map(keybind => keybind.key)).toEqual(['p', 'g', 'l']);
            expect(widget.getEditorDisplay(glyphItem({ inverse: 'true' })).modifierText).toBe('(level glyph)');
            expect(widget.handleEditorAction('edit-glyph-levels', glyphItem())).toBeNull();
            expect(widget.renderEditor({ widget: glyphItem(), onComplete: () => undefined, onCancel: () => undefined, action: 'edit-glyph-levels' })).toBeTruthy();
            expect(widget.renderEditor({ widget: glyphItem(), onComplete: () => undefined, onCancel: () => undefined, action: 'edit-symbol-override' })).toBeTruthy();
        });
    });

    it('renders slider with percentage in slider mode', () => {
        const widget = new ContextPercentageWidget();
        const item: WidgetItem = {
            id: 'ctx',
            type: 'context-percentage',
            metadata: { display: 'slider' }
        };
        const context: RenderContext = {
            data: {
                model: { id: 'claude-3-5-sonnet-20241022' },
                context_window: {
                    context_window_size: 200000,
                    used_percentage: 50
                }
            }
        };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Ctx Used: ▓▓▓▓▓░░░░░ 50.0%');
    });

    it('renders slider only in slider-only mode', () => {
        const widget = new ContextPercentageWidget();
        const item: WidgetItem = {
            id: 'ctx',
            type: 'context-percentage',
            metadata: { display: 'slider-only' }
        };
        const context: RenderContext = {
            data: {
                model: { id: 'claude-3-5-sonnet-20241022' },
                context_window: {
                    context_window_size: 200000,
                    used_percentage: 50
                }
            }
        };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Ctx Used: ▓▓▓▓▓░░░░░');
    });

    describe('Older models with 200k context window', () => {
        it('should calculate percentage using 200k denominator for older Sonnet 3.5', () => {
            const result = render('claude-3-5-sonnet-20241022', 42000);
            expect(result).toBe('Ctx Used: 21.0%');
        });

        it('should calculate percentage using 200k denominator when model ID is undefined', () => {
            const result = render(undefined, 42000);
            expect(result).toBe('Ctx Used: 21.0%');
        });

        it('should calculate percentage using 200k denominator for unknown model', () => {
            const result = render('claude-unknown-model', 42000);
            expect(result).toBe('Ctx Used: 21.0%');
        });
    });
});
