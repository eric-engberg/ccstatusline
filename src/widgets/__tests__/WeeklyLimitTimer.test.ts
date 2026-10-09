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
// Imported before the widget, as the reset timer tests do: loading a widget first
// enters the usage -> config -> widget registry import cycle midway under Node.
import { formatUsageDuration } from '../../utils/usage';
import { WeeklyLimitTimerWidget } from '../WeeklyLimitTimer';

const DAY = 24 * 60 * 60 * 1000;
const ITEM: WidgetItem = { id: 'weekly-limit', type: 'weekly-limit-timer' };
const COMPACT: WidgetItem = { ...ITEM, metadata: { compact: 'true' } };

// Five days into a window that resets Thursday 2026-10-15 at 00:00 UTC
const RESET_AT = '2026-10-15T00:00:00.000Z';
const NOW = Date.parse(RESET_AT) - 2 * DAY;

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new WeeklyLimitTimerWidget().render(item, context, DEFAULT_SETTINGS);
}

function usage(weeklyUsage: number | undefined, weeklyResetAt = RESET_AT): RenderContext {
    return { usageData: { weeklyUsage, weeklyResetAt } };
}

describe('WeeklyLimitTimerWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows the time until the weekly limit at this week\'s average pace', () => {
        // 72% in 5 days: the other 28% take 46h 40m
        expect(render(ITEM, usage(72))).toBe('Weekly Limit: 1d 22hr 40m');
    });

    it('formats durations like the reset timers', () => {
        const limitInMs = 46 * 60 * 60 * 1000 + 40 * 60 * 1000;

        expect(render(ITEM, usage(72))).toBe(`Weekly Limit: ${formatUsageDuration(limitInMs)}`);
        expect(render(COMPACT, usage(72))).toBe(`Weekly Limit: ${formatUsageDuration(limitInMs, true)}`);
    });

    it('shows the short form with s', () => {
        expect(render(COMPACT, usage(72))).toBe('Weekly Limit: 1d22h40m');
    });

    it('drops the label in raw value mode', () => {
        expect(render({ ...ITEM, rawValue: true }, usage(72))).toBe('1d 22hr 40m');
    });

    it('never shows 0m in the last minute', () => {
        // 30 seconds of the remaining pace at 5 days in
        const percent = 100 * 432_000_000 / (432_000_000 + 30_000);

        expect(render(ITEM, usage(percent))).toBe('Weekly Limit: 1m');
    });

    it.each([
        ['the limit comes after the reset', usage(50)],
        ['the limit is reached', usage(100)],
        ['nothing is used yet', usage(0)],
        ['the window is less than a day old', usage(30, new Date(NOW + 6.5 * DAY).toISOString())],
        ['there is no weekly percent', usage(undefined)],
        ['there is no reset time', { usageData: { weeklyUsage: 72 } }],
        ['there is no usage data', {}]
    ])('renders nothing when %s', (_label, context: RenderContext) => {
        expect(render(ITEM, context)).toBeNull();
    });

    it('shows a sample in the preview', () => {
        expect(render(ITEM, { isPreview: true })).toBe('Weekly Limit: 1d 13hr');
        expect(render(COMPACT, { isPreview: true })).toBe('Weekly Limit: 1d13h');
    });

    it('describes itself for the line editor', () => {
        const widget = new WeeklyLimitTimerWidget();

        expect(widget.getDisplayName()).toBe('Weekly Limit Timer');
        expect(widget.getCategory()).toBe('Usage');
        expect(widget.getDefaultColor()).toBe('red');
        expect(widget.getLabelPrefix()).toBe('Weekly Limit: ');
        expect(widget.getEditorDisplay(ITEM).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(COMPACT).modifierText).toBe('(compact)');
    });

    it('toggles the short form with s', () => {
        const widget = new WeeklyLimitTimerWidget();

        expect(widget.getCustomKeybinds()).toEqual([{ key: 's', label: '(s)hort time', action: 'toggle-compact' }]);
        expect(widget.handleEditorAction('toggle-compact', ITEM)?.metadata?.compact).toBe('true');
        expect(widget.handleEditorAction('toggle-invert', ITEM)).toBeNull();
    });
});
