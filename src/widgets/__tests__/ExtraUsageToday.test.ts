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
import { ExtraUsageTodayWidget } from '../ExtraUsageToday';
import { gradientPresetCodeAt } from '../shared/gradient-bar';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

const item: WidgetItem = { id: 'today', type: 'extra-usage-today' };

// $123.45 spent this month, $46.10 of it today.
const usageData = {
    extraUsageEnabled: true,
    extraUsageUsed: 12345,
    extraUsageUsedToday: 4610
};

function render(widgetItem: WidgetItem, context: RenderContext = {}): string | null {
    return new ExtraUsageTodayWidget().render(widgetItem, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageTodayWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows the extra usage spent today', () => {
        expect(render(item, { usageData })).toBe('Overage Today: $46.10');
        expect(render({ ...item, rawValue: true }, { usageData })).toBe('$46.10');
    });

    // Usage-based plans (Enterprise) have no plan limits, so extra usage is the
    // account's whole spend rather than overage beyond a limit.
    it('labels it as spend when the account has no plan limits', () => {
        expect(render(item, { usageData: { ...usageData, noPlanLimits: true } })).toBe('Spend Today: $46.10');
    });

    it('formats the amount in the currency reported by the API', () => {
        expect(render(item, { usageData: { ...usageData, extraUsageCurrency: 'EUR' } })).toBe('Overage Today: €46.10');
    });

    it('applies the global cost style', () => {
        const settings = { ...DEFAULT_SETTINGS, numberFormat: { cost: { style: 'whole' as const } } };
        const widget = new ExtraUsageTodayWidget();

        expect(widget.render(item, { usageData }, settings)).toBe('Overage Today: $46');
        expect(widget.supportsNumberFormat()).toBe(true);
    });

    // Today's spend only exists once a usage fetch has run since the UTC day
    // began; until then there is nothing to show.
    it('renders nothing while today\'s spend is not known yet', () => {
        expect(render(item, { usageData: { extraUsageEnabled: true, extraUsageUsed: 12345 } })).toBeNull();
    });

    it('renders n/a when extra usage is disabled, or nothing when that state is hidden', () => {
        const context: RenderContext = { usageData: { extraUsageEnabled: false } };

        expect(render(item, context)).toBe('Overage Today: n/a');
        expect(render({ ...item, metadata: { hide: 'disabled' } }, context)).toBeNull();
    });

    it('shows usage errors only when the extra usage data is missing', () => {
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(item, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render({ ...item, metadata: { hide: 'no-data' } }, { usageData: { error: 'timeout' } })).toBeNull();
        expect(render(item, { usageData: { ...usageData, error: 'timeout' } })).toBe('Overage Today: $46.10');
    });

    it('renders a sample amount in the preview', () => {
        expect(render(item, { isPreview: true })).toBe('Overage Today: $46.10');
    });

    it('declares the disabled and no-data hideable states', () => {
        const widget = new ExtraUsageTodayWidget();

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
        expect(widget.getCategory()).toBe('Usage');
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
        const weekdays: WidgetItem = { ...colored, metadata: { ...colored.metadata, weekdaysOnly: 'true' } };

        // $100.00 spent before today, so $270.00 of the $370.00 limit was left
        // when the day began: $10.00 a day over the month's 27 days left, or
        // $13.50 over its 20 weekdays.
        function spentToday(cents: number, limit = 37000): RenderContext {
            return { usageData: { extraUsageEnabled: true, extraUsageLimit: limit, extraUsageUsed: 10000 + cents, extraUsageUsedToday: cents } };
        }

        beforeEach(() => {
            // Monday 5 October 2026
            vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-05T15:00:00Z').getTime());
        });

        it('colors today\'s spend green below 80% of the day\'s budget, yellow up to it and red above it', () => {
            expect(render(colored, spentToday(799))).toBe(`${LOW}$7.99${FG_RESET}`);
            expect(render(colored, spentToday(800))).toBe(`${MID}$8.00${FG_RESET}`);
            expect(render(colored, spentToday(1000))).toBe(`${MID}$10.00${FG_RESET}`);
            expect(render(colored, spentToday(1001))).toBe(`${HIGH}$10.01${FG_RESET}`);
        });

        it('keeps the label in the widget color', () => {
            expect(render({ ...colored, rawValue: false }, spentToday(500))).toBe(`${BASE}Overage Today: ${FG_RESET}${LOW}$5.00${FG_RESET}`);
        });

        it('spreads the budget over weekdays when that option is on', () => {
            // $10.00 is 74% of a $13.50 weekday budget
            expect(render(weekdays, spentToday(1000))).toBe(`${LOW}$10.00${FG_RESET}`);
            expect(render(weekdays, spentToday(1080))).toBe(`${MID}$10.80${FG_RESET}`);
        });

        it('is red when nothing was left of the limit as the day began', () => {
            expect(render(colored, spentToday(0, 10000))).toBe(`${HIGH}$0.00${FG_RESET}`);
            expect(render(colored, spentToday(0, 9000))).toBe(`${HIGH}$0.00${FG_RESET}`);
        });

        it('keeps the widget color without a monthly limit to budget from', () => {
            const context = { usageData: { extraUsageEnabled: true, extraUsageUsed: 10500, extraUsageUsedToday: 500 } };

            expect(render(colored, context)).toBe(`${BASE}$5.00${FG_RESET}`);
        });

        it('still renders nothing while today\'s spend is not known yet', () => {
            expect(render(colored, { usageData: { extraUsageEnabled: true, extraUsageLimit: 37000, extraUsageUsed: 10000 } })).toBeNull();
        });

        it('places the spend along a gradient at 256 colors and up, and keeps the widget color at 16', () => {
            const widget = new ExtraUsageTodayWidget();
            const gradient = { ...colored, metadata: { ...colored.metadata, valueColorMode: 'gradient' } };

            expect(widget.render(gradient, spentToday(500), { ...DEFAULT_SETTINGS, colorLevel: 3 })).toBe(`${gradientPresetCodeAt('traffic', 0.5, 'truecolor')}$5.00${FG_RESET}`);
            expect(widget.render(gradient, spentToday(500), { ...DEFAULT_SETTINGS, colorLevel: 2 })).toBe(`${gradientPresetCodeAt('traffic', 0.5, 'ansi256')}$5.00${FG_RESET}`);
            expect(widget.render(gradient, spentToday(500), { ...DEFAULT_SETTINGS, colorLevel: 1 })).toBe(`${BASE}$5.00${FG_RESET}`);
        });

        it('renders plain text when colors are off for the whole status line', () => {
            expect(new ExtraUsageTodayWidget().render(colored, spentToday(1001), { ...DEFAULT_SETTINGS, colorLevel: 0 })).toBe('$10.01');
        });

        // The sample is $46.10 of Daily Budget's $194.70 sample
        it('previews its sample in its color', () => {
            expect(render({ ...colored, rawValue: false }, { isPreview: true })).toBe(`${BASE}Overage Today: ${FG_RESET}${LOW}$46.10${FG_RESET}`);
        });

        it('offers value colors, and the weekdays toggle once they\'re on', () => {
            const widget = new ExtraUsageTodayWidget();

            expect(widget.getCustomKeybinds(item)).toEqual([{ key: 'v', label: '(v)alue colors', action: 'edit-value-colors' }]);
            expect(widget.getCustomKeybinds(colored)).toEqual([
                { key: 'v', label: '(v)alue colors', action: 'edit-value-colors' },
                { key: 'w', label: '(w)eekdays only', action: 'toggle-weekdays' }
            ]);
            expect(widget.handleEditorAction('toggle-weekdays', colored)?.metadata?.weekdaysOnly).toBe('true');
            expect(widget.handleEditorAction('edit-value-colors', colored)).toBeNull();
            expect(widget.renderEditor({ widget: colored, onComplete: () => undefined, onCancel: () => undefined })).toBeTruthy();
        });

        it('names the options on the editor row', () => {
            const widget = new ExtraUsageTodayWidget();

            expect(widget.getEditorDisplay(item).modifierText).toBeUndefined();
            expect(widget.getEditorDisplay({ ...item, metadata: { weekdaysOnly: 'true' } }).modifierText).toBeUndefined();
            expect(widget.getEditorDisplay(colored).modifierText).toBe('(value colors)');
            expect(widget.getEditorDisplay({ ...weekdays, metadata: { ...weekdays.metadata, valueColorMode: 'gradient' } }).modifierText).toBe('(value colors: traffic gradient, weekdays)');
        });

        // Value colors embed their own foreground codes, so the renderer has
        // to leave this widget's foreground alone
        it('keeps its own colors only while value colors are on', () => {
            const widget = new ExtraUsageTodayWidget();

            expect(widget.preservesRenderedColors(colored)).toBe(true);
            expect(widget.preservesRenderedColors(item)).toBe(false);
        });
    });
});
