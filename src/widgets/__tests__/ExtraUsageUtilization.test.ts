import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as usage from '../../utils/usage';
import { ExtraUsageUtilizationWidget } from '../ExtraUsageUtilization';
import { gradientPresetCodeAt } from '../shared/gradient-bar';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

function render(widget: ExtraUsageUtilizationWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageUtilizationWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders utilization text and bar modes', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const context: RenderContext = {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        };

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, context)).toBe('Overage: 25.0%');
        expect(render(widget, {
            id: 'extra',
            rawValue: true,
            type: 'extra-usage-utilization'
        }, context)).toBe('25.0%');
        expect(render(widget, {
            id: 'extra',
            metadata: { display: 'progress-short' },
            type: 'extra-usage-utilization'
        }, context)).toBe('Overage: [████░░░░░░░░░░░░] 25.0%');
        expect(render(widget, {
            id: 'extra',
            metadata: { display: 'slider-only' },
            type: 'extra-usage-utilization'
        }, context)).toBe('Overage: ▓▓▓░░░░░░░');
    });

    it('renders available utilization before unrelated usage errors', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: true,
                extraUsageUtilization: 2.6
            }
        })).toBe('Overage: 2.6%');
    });

    it('declares the disabled and no-data hideable states alongside display keybinds', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const baseItem: WidgetItem = { id: 'extra', type: 'extra-usage-utilization' };

        expect(widget.getCustomKeybinds(baseItem)).toEqual([
            { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
            { key: 'u', label: '(u) show remaining', action: 'toggle-invert' },
            { key: 'v', label: '(v)alue colors', action: 'edit-value-colors' }
        ]);
        expect(widget.getCustomKeybinds({
            ...baseItem,
            metadata: { display: 'progress' }
        })).toEqual([
            { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
            { key: 'u', label: '(u) show remaining', action: 'toggle-invert' },
            { key: 'g', label: '(g)radient', action: 'cycle-gradient' },
            { key: 'b', label: '(b)ar size', action: 'edit-bar-width' },
            { key: 'n', label: '(n) hide numbers', action: 'toggle-bar-numbers' }
        ]);
        expect(widget.getCustomKeybinds({
            ...baseItem,
            metadata: { invert: 'true' }
        })).toEqual([
            { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
            { key: 'u', label: '(u) show used', action: 'toggle-invert' },
            { key: 'v', label: '(v)alue colors', action: 'edit-value-colors' }
        ]);
        expect(widget.getEditorDisplay(baseItem).modifierText).toBe('(used)');
        expect(widget.getEditorDisplay({
            ...baseItem,
            metadata: { invert: 'true' }
        }).modifierText).toBe('(remaining)');

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
    });

    it('shows usage errors only when required extra usage data is missing', () => {
        const widget = new ExtraUsageUtilizationWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, { usageData: { extraUsageEnabled: true } })).toBeNull();
    });

    it('hides usage errors when the no-data state is enabled', () => {
        const widget = new ExtraUsageUtilizationWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, {
            id: 'extra',
            metadata: { hide: 'no-data' },
            type: 'extra-usage-utilization'
        }, { usageData: { error: 'timeout' } })).toBeNull();
    });

    it('renders n/a when extra usage is disabled', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: false,
                extraUsageUtilization: 25
            }
        })).toBe('Overage: n/a');
        const rawProgressItem: WidgetItem = {
            id: 'extra',
            metadata: { display: 'progress-short' },
            rawValue: true,
            type: 'extra-usage-utilization'
        };

        expect(render(widget, rawProgressItem, { usageData: { extraUsageEnabled: false } })).toBe('n/a');
    });

    it('hides when extra usage is disabled and hide-if-disabled is enabled', () => {
        const widget = new ExtraUsageUtilizationWidget();

        const hiddenItem: WidgetItem = {
            id: 'extra',
            metadata: { hide: 'disabled' },
            type: 'extra-usage-utilization'
        };

        expect(render(widget, hiddenItem, { usageData: { extraUsageEnabled: false } })).toBeNull();
    });

    it('inverts bar rendering', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, {
            id: 'extra',
            metadata: { display: 'progress-short', invert: 'true' },
            type: 'extra-usage-utilization'
        }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        })).toBe('Overage: [████████████░░░░] 75.0%');
    });

    it('inverts plain text and preview rendering', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const item: WidgetItem = {
            id: 'extra',
            metadata: { invert: 'true' },
            type: 'extra-usage-utilization'
        };

        expect(render(widget, item, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        })).toBe('Overage: 75.0%');
        expect(render(widget, { ...item, rawValue: true }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        })).toBe('75.0%');
        expect(render(widget, item, { isPreview: true })).toBe('Overage: 15.0%');
    });

    describe('value colors', () => {
        const LOW = '\x1b[38;2;0;255;0m';
        const MID = '\x1b[38;2;255;255;0m';
        const HIGH = '\x1b[38;2;255;0;0m';
        const BASE = '\x1b[38;2;17;34;51m';
        const FG_RESET = '\x1b[39m';
        // Custom colors, so the escape codes don't depend on the terminal's
        // color support (named colors go through chalk)
        const colored: WidgetItem = {
            id: 'extra',
            type: 'extra-usage-utilization',
            color: 'hex:112233',
            metadata: {
                'valueColors': 'true',
                'valueColor.low': 'hex:00ff00',
                'valueColor.mid': 'hex:ffff00',
                'valueColor.high': 'hex:ff0000'
            }
        };
        const used = (extraUsageUtilization: number): RenderContext => ({ usageData: { extraUsageEnabled: true, extraUsageUtilization } });

        it('colors the percent green below 70%, yellow below 90% and red from 90%', () => {
            const widget = new ExtraUsageUtilizationWidget();
            const raw = { ...colored, rawValue: true };

            expect(render(widget, raw, used(69.9))).toBe(`${LOW}69.9%${FG_RESET}`);
            expect(render(widget, raw, used(70))).toBe(`${MID}70.0%${FG_RESET}`);
            expect(render(widget, raw, used(89.9))).toBe(`${MID}89.9%${FG_RESET}`);
            expect(render(widget, raw, used(90))).toBe(`${HIGH}90.0%${FG_RESET}`);
        });

        it('keeps the label in the widget color', () => {
            expect(render(new ExtraUsageUtilizationWidget(), colored, used(25))).toBe(`${BASE}Overage: ${FG_RESET}${LOW}25.0%${FG_RESET}`);
        });

        it('colors by the used percent while showing what\'s left', () => {
            const item = { ...colored, rawValue: true, metadata: { ...colored.metadata, invert: 'true' } };

            expect(render(new ExtraUsageUtilizationWidget(), item, used(95))).toBe(`${HIGH}5.0%${FG_RESET}`);
        });

        it('places the percent along a gradient at 256 colors and up, and keeps the widget color at 16', () => {
            const widget = new ExtraUsageUtilizationWidget();
            const item = { ...colored, rawValue: true, metadata: { ...colored.metadata, valueColorMode: 'gradient' } };

            expect(widget.render(item, used(50), { ...DEFAULT_SETTINGS, colorLevel: 3 })).toBe(`${gradientPresetCodeAt('traffic', 0.5, 'truecolor')}50.0%${FG_RESET}`);
            expect(widget.render(item, used(50), { ...DEFAULT_SETTINGS, colorLevel: 2 })).toBe(`${gradientPresetCodeAt('traffic', 0.5, 'ansi256')}50.0%${FG_RESET}`);
            expect(widget.render(item, used(50), { ...DEFAULT_SETTINGS, colorLevel: 1 })).toBe(`${BASE}50.0%${FG_RESET}`);
        });

        it('renders plain text when colors are off for the whole status line', () => {
            expect(new ExtraUsageUtilizationWidget().render(colored, used(95), { ...DEFAULT_SETTINGS, colorLevel: 0 })).toBe('Overage: 95.0%');
        });

        it('leaves the bar modes as they were', () => {
            const widget = new ExtraUsageUtilizationWidget();
            const item = { ...colored, metadata: { ...colored.metadata, display: 'progress-short' } };

            expect(render(widget, item, used(25))).toBe('Overage: [████░░░░░░░░░░░░] 25.0%');
            expect(widget.preservesRenderedColors(item)).toBe(false);
            expect(widget.getCustomKeybinds(item).map(keybind => keybind.key)).not.toContain('v');
            expect(widget.getEditorDisplay(item).modifierText).toBe('(block bar, medium, used)');
        });

        it('previews 85% in its color', () => {
            const widget = new ExtraUsageUtilizationWidget();

            expect(render(widget, colored, { isPreview: true })).toBe(`${BASE}Overage: ${FG_RESET}${MID}85.0%${FG_RESET}`);
            expect(render(widget, { ...colored, metadata: { ...colored.metadata, invert: 'true' } }, { isPreview: true })).toBe(`${BASE}Overage: ${FG_RESET}${MID}15.0%${FG_RESET}`);
        });

        it('names the option on the editor row and opens its editor with v', () => {
            const widget = new ExtraUsageUtilizationWidget();

            expect(widget.getEditorDisplay(colored).modifierText).toBe('(used, value colors)');
            expect(widget.getEditorDisplay({ ...colored, metadata: { valueColors: 'true', valueColorMode: 'gradient' } }).modifierText).toBe('(used, value colors: traffic gradient)');
            expect(widget.handleEditorAction('edit-value-colors', colored)).toBeNull();
            expect(widget.renderEditor({ widget: colored, onComplete: () => undefined, onCancel: () => undefined })).toBeTruthy();
        });

        // Value colors embed their own foreground codes, so the renderer has
        // to leave this widget's foreground alone
        it('keeps its own colors only while value colors are on', () => {
            const widget = new ExtraUsageUtilizationWidget();

            expect(widget.preservesRenderedColors(colored)).toBe(true);
            expect(widget.preservesRenderedColors({ id: 'extra', type: 'extra-usage-utilization' })).toBe(false);
        });
    });

    describe('level glyph', () => {
        const glyphItem: WidgetItem = { id: 'extra', type: 'extra-usage-utilization', rawValue: true, metadata: { display: 'glyph' } };
        const used = (extraUsageUtilization: number): RenderContext => ({ usageData: { extraUsageEnabled: true, extraUsageUtilization } });

        it('is the last style p cycles through', () => {
            const widget = new ExtraUsageUtilizationWidget();
            const slider = { id: 'extra', type: 'extra-usage-utilization', metadata: { display: 'slider' } };

            expect(widget.handleEditorAction('toggle-progress', slider)?.metadata).toEqual({ display: 'glyph', barWidth: 'short' });
            expect(widget.handleEditorAction('toggle-progress', glyphItem)?.metadata?.display).toBe('time');
        });

        // What's left would flip the levels, so the glyph always measures what's used
        it('shows the glyph for the used percent instead of the number', () => {
            const widget = new ExtraUsageUtilizationWidget();

            expect(render(widget, glyphItem, used(42))).toBe('⚡');
            expect(render(widget, { ...glyphItem, metadata: { display: 'glyph', invert: 'true' } }, used(95))).toBe('🚨');
            expect(render(widget, { ...glyphItem, rawValue: false }, used(10))).toBe('Overage: 🟢');
            expect(render(widget, glyphItem, { isPreview: true })).toBe('🔥');
        });

        it('offers (g) and (l) and names the mode on the editor row', () => {
            const widget = new ExtraUsageUtilizationWidget();
            const editorProps = { widget: glyphItem, onComplete: () => undefined, onCancel: () => undefined };

            expect(widget.getCustomKeybinds(glyphItem).map(keybind => keybind.key)).toEqual(['p', 'g', 'l']);
            expect(widget.getEditorDisplay(glyphItem).modifierText).toBe('(level glyph)');
            expect(widget.renderEditor({ ...editorProps, action: 'edit-glyph-levels' })).toBeTruthy();
        });
    });
});
