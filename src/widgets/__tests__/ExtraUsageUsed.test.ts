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
import { ExtraUsageUsedWidget } from '../ExtraUsageUsed';
import { gradientPresetCodeAt } from '../shared/gradient-bar';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

function render(widget: ExtraUsageUsedWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageUsedWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders used extra usage budget', () => {
        const widget = new ExtraUsageUsedWidget();
        const context: RenderContext = {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUsed: 10600
            }
        };

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, context)).toBe('Overage Used: $106.00');
        expect(render(widget, {
            id: 'extra',
            rawValue: true,
            type: 'extra-usage-used'
        }, context)).toBe('$106.00');
    });

    it('renders used budget without a configured monthly limit', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUsed: 542
            }
        })).toBe('Overage Used: $5.42');
    });

    it('formats used budget in the currency reported by the API', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                extraUsageCurrency: 'EUR',
                extraUsageEnabled: true,
                extraUsageUsed: 542
            }
        })).toBe('Overage Used: €5.42');
    });

    it('applies the global cost style while preserving the reported currency', () => {
        const widget = new ExtraUsageUsedWidget();
        const settings = {
            ...DEFAULT_SETTINGS,
            numberFormat: { cost: { style: 'whole' as const } }
        };
        const context: RenderContext = {
            usageData: {
                extraUsageCurrency: 'EUR',
                extraUsageEnabled: true,
                extraUsageUsed: 542
            }
        };

        expect(widget.render({
            id: 'extra',
            type: 'extra-usage-used',
            numberFormat: { decimals: 3 }
        }, context, settings)).toBe('Overage Used: €5');
        expect(widget.render({
            id: 'extra',
            type: 'extra-usage-used'
        }, { isPreview: true }, settings)).toBe('Overage Used: $106');
        expect(widget.supportsNumberFormat()).toBe(true);
    });

    // Usage-based plans (Enterprise) have no plan limits, so extra usage is the
    // account's whole spend rather than overage beyond a limit.
    it('labels the amount as spend when the account has no plan limits', () => {
        const widget = new ExtraUsageUsedWidget();
        const usageData = {
            extraUsageEnabled: true,
            extraUsageUsed: 1250,
            extraUsageCurrency: 'USD',
            noPlanLimits: true
        };

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, { usageData })).toBe('Spend Used: $12.50');
        expect(render(widget, { id: 'extra', rawValue: true, type: 'extra-usage-used' }, { usageData })).toBe('$12.50');
        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, { usageData: { extraUsageEnabled: false, noPlanLimits: true } })).toBe('Spend Used: n/a');
    });

    it('declares the disabled and no-data hideable states', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
        expect(widget.getEditorDisplay({ id: 'extra', type: 'extra-usage-used' }).modifierText).toBeUndefined();
    });

    it('renders available used budget before unrelated usage errors', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: true,
                extraUsageUsed: 10600
            }
        })).toBe('Overage Used: $106.00');
    });

    it('shows usage errors only when required extra usage data is missing', () => {
        const widget = new ExtraUsageUsedWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, { usageData: { extraUsageEnabled: true } })).toBeNull();
    });

    it('renders n/a when extra usage is disabled', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: false,
                extraUsageUsed: 10600
            }
        })).toBe('Overage Used: n/a');
        expect(render(widget, { id: 'extra', rawValue: true, type: 'extra-usage-used' }, { usageData: { extraUsageEnabled: false } })).toBe('n/a');
    });

    it('hides when extra usage is disabled and hide-if-disabled is enabled', () => {
        const widget = new ExtraUsageUsedWidget();

        const hiddenItem: WidgetItem = {
            id: 'extra',
            metadata: { hide: 'disabled' },
            type: 'extra-usage-used'
        };

        expect(render(widget, hiddenItem, { usageData: { extraUsageEnabled: false } })).toBeNull();
    });

    describe('value colors', () => {
        const LOW = '\x1b[38;2;0;255;0m';
        const MID = '\x1b[38;2;255;255;0m';
        const HIGH = '\x1b[38;2;255;0;0m';
        const BASE = '\x1b[38;2;17;34;51m';
        const FG_RESET = '\x1b[39m';
        const widget = new ExtraUsageUsedWidget();
        const item: WidgetItem = { id: 'extra', type: 'extra-usage-used' };
        // Custom colors, so the escape codes don't depend on the terminal's
        // color support (named colors go through chalk)
        const colored: WidgetItem = {
            ...item,
            rawValue: true,
            color: 'hex:112233',
            metadata: {
                'valueColors': 'true',
                'valueColor.low': 'hex:00ff00',
                'valueColor.mid': 'hex:ffff00',
                'valueColor.high': 'hex:ff0000'
            }
        };
        const gradient: WidgetItem = { ...colored, metadata: { ...colored.metadata, valueColorMode: 'gradient' } };

        // Spent so far, of a $500.00 monthly limit
        function used(cents: number, limit = 50000): RenderContext {
            return { usageData: { extraUsageEnabled: true, extraUsageLimit: limit, extraUsageUsed: cents } };
        }

        it('colors the spend green below 70% of the limit, yellow below 90% and red from 90%', () => {
            expect(render(widget, colored, used(34999))).toBe(`${LOW}$349.99${FG_RESET}`);
            expect(render(widget, colored, used(35000))).toBe(`${MID}$350.00${FG_RESET}`);
            expect(render(widget, colored, used(44999))).toBe(`${MID}$449.99${FG_RESET}`);
            expect(render(widget, colored, used(45000))).toBe(`${HIGH}$450.00${FG_RESET}`);
        });

        it('keeps the label in the widget color', () => {
            expect(render(widget, { ...colored, rawValue: false }, used(10000))).toBe(`${BASE}Overage Used: ${FG_RESET}${LOW}$100.00${FG_RESET}`);
        });

        it('keeps the widget color without a monthly limit', () => {
            expect(render(widget, colored, { usageData: { extraUsageEnabled: true, extraUsageUsed: 10000 } })).toBe(`${BASE}$100.00${FG_RESET}`);
            expect(render(widget, colored, used(10000, 0))).toBe(`${BASE}$100.00${FG_RESET}`);
        });

        // The gradient reaches its end color at the limit unless it's set to end sooner
        it('places the spend along a gradient that ends at the limit', () => {
            const at = (settingsLevel: 0 | 1 | 2 | 3, cents: number, item = gradient) => widget.render(item, used(cents), { ...DEFAULT_SETTINGS, colorLevel: settingsLevel });

            expect(at(3, 25000)).toBe(`${gradientPresetCodeAt('traffic', 0.5, 'truecolor')}$250.00${FG_RESET}`);
            expect(at(3, 50000)).toBe(`${gradientPresetCodeAt('traffic', 1, 'truecolor')}$500.00${FG_RESET}`);
            expect(at(3, 25000, { ...gradient, metadata: { ...gradient.metadata, valueGradientEnd: '50' } })).toBe(`${gradientPresetCodeAt('traffic', 1, 'truecolor')}$250.00${FG_RESET}`);
            expect(at(2, 25000)).toBe(`${gradientPresetCodeAt('traffic', 0.5, 'ansi256')}$250.00${FG_RESET}`);
            expect(at(1, 25000)).toBe(`${BASE}$250.00${FG_RESET}`);
        });

        it('renders plain text when colors are off for the whole status line', () => {
            expect(widget.render(colored, used(45000), { ...DEFAULT_SETTINGS, colorLevel: 0 })).toBe('$450.00');
        });

        // The sample is $106.00 of Remaining's $3,894.00 sample plus it
        it('previews its sample in its color', () => {
            expect(render(widget, { ...colored, rawValue: false }, { isPreview: true })).toBe(`${BASE}Overage Used: ${FG_RESET}${LOW}$106.00${FG_RESET}`);
        });

        it('offers value colors, names them on the editor row and keeps their colors', () => {
            expect(widget.getCustomKeybinds()).toEqual([{ key: 'v', label: '(v)alue colors', action: 'edit-value-colors' }]);
            expect(widget.renderEditor({ widget: colored, onComplete: () => undefined, onCancel: () => undefined })).toBeTruthy();
            expect(widget.getEditorDisplay(item).modifierText).toBeUndefined();
            expect(widget.getEditorDisplay(colored).modifierText).toBe('(value colors)');
            expect(widget.getEditorDisplay(gradient).modifierText).toBe('(value colors: traffic gradient)');
            expect(widget.preservesRenderedColors(colored)).toBe(true);
            expect(widget.preservesRenderedColors(item)).toBe(false);
        });
    });
});
