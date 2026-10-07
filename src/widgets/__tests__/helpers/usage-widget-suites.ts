import {
    beforeEach,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../../types/RenderContext';
import type {
    CustomKeybind,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';

interface UsageWidgetLike {
    getCustomKeybinds(item?: WidgetItem): CustomKeybind[];
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay;
    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null;
    renderEditor?(props: WidgetEditorProps): unknown;
    supportsRawValue(): boolean;
}

interface UsagePercentWidgetSuiteConfig<TWidget extends UsageWidgetLike> {
    baseItem: WidgetItem;
    createWidget: () => TWidget;
    errorMessageMock: { mockReturnValue: (value: string) => void };
    expectedModifierText: string;
    expectedPreviewInvertedTime: string;
    expectedProgress: string;
    expectedRawInvertedTime: string;
    expectedRawProgress: string;
    expectedRawTime: string;
    expectedInvertedTime: string;
    expectedTime: string;
    expectedWholePercentTime: string;
    modifierItem: WidgetItem;
    progressItem: WidgetItem;
    rawProgressItem: WidgetItem;
    rawTimeItem: WidgetItem;
    render: (widget: TWidget, item: WidgetItem, context?: RenderContext) => string | null;
    usageField: 'sessionUsage' | 'weeklyUsage' | 'weeklySonnetUsage' | 'weeklyOpusUsage' | 'fableUsage';
    usageValue: number;
}

interface UsageTimerEditorSuiteConfig<TWidget extends UsageWidgetLike & { getDisplayName(): string }> {
    baseItem: WidgetItem;
    createWidget: () => TWidget;
    expectedDisplayName: string;
    expectedProgressKeybinds?: CustomKeybind[];
    supportsDateMode?: boolean;
    supportsSliderMode?: boolean;
    expectedModifierText: string;
    modifierItem: WidgetItem;
    expectedTimeKeybinds?: CustomKeybind[];
}

const EXPECTED_TIMER_TIME_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
    { key: 's', label: '(s)hort time', action: 'toggle-compact' }
];

const EXPECTED_TIMER_PROGRESS_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
    { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' },
    { key: 'g', label: '(g)radient', action: 'cycle-gradient' },
    { key: 'b', label: '(b)ar size', action: 'edit-bar-width' },
    { key: 'n', label: '(n) hide numbers', action: 'toggle-bar-numbers' }
];

function getUsageContext(field: 'sessionUsage' | 'weeklyUsage' | 'weeklySonnetUsage' | 'weeklyOpusUsage' | 'fableUsage', value: number): RenderContext {
    return { usageData: { [field]: value } };
}

function getExpectedUsageKeybinds(item: WidgetItem, includeCursor = false): CustomKeybind[] {
    const nextDirection = item.metadata?.invert === 'true' ? 'used' : 'remaining';
    const keybinds: CustomKeybind[] = [
        { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
        { key: 'u', label: `(u) show ${nextDirection}`, action: 'toggle-invert' }
    ];

    // Bar modes add the time cursor, the bar gradient, the bar size and the numbers
    if (includeCursor) {
        const numbersAction = item.metadata?.display === 'slider-only' ? 'show' : 'hide';
        keybinds.push({ key: 't', label: '(t)ime cursor', action: 'toggle-cursor' });
        keybinds.push(
            { key: 'g', label: '(g)radient', action: 'cycle-gradient' },
            { key: 'b', label: '(b)ar size', action: 'edit-bar-width' },
            { key: 'n', label: `(n) ${numbersAction} numbers`, action: 'toggle-bar-numbers' }
        );
    }

    return keybinds;
}

export function runUsagePercentWidgetSuite<TWidget extends UsageWidgetLike>(config: UsagePercentWidgetSuiteConfig<TWidget>): void {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exposes widget-managed keybinds for time and bar modes', () => {
        const widget = config.createWidget();
        const sliderItem: WidgetItem = {
            ...config.baseItem,
            metadata: { display: 'slider' }
        };
        const sliderOnlyItem: WidgetItem = {
            ...config.baseItem,
            metadata: { display: 'slider-only' }
        };

        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds(config.baseItem)).toEqual(getExpectedUsageKeybinds(config.baseItem));
        expect(widget.getCustomKeybinds(config.progressItem)).toEqual(getExpectedUsageKeybinds(config.progressItem, true));
        expect(widget.getCustomKeybinds(sliderItem)).toEqual(getExpectedUsageKeybinds(sliderItem, true));
        expect(widget.getCustomKeybinds(sliderOnlyItem)).toEqual(getExpectedUsageKeybinds(sliderOnlyItem, true));
    });

    it.each([
        {
            expected: config.expectedTime,
            item: config.baseItem,
            name: 'renders percentage text in time mode'
        },
        {
            expected: config.expectedProgress,
            item: config.progressItem,
            name: 'renders progress mode'
        },
        {
            expected: config.expectedRawTime,
            item: config.rawTimeItem,
            name: 'renders raw text mode without label'
        },
        {
            expected: config.expectedRawProgress,
            item: config.rawProgressItem,
            name: 'renders raw progress mode without label'
        }
    ])('$name', ({ expected, item }) => {
        const widget = config.createWidget();
        const context = getUsageContext(config.usageField, config.usageValue);

        expect(config.render(widget, item, context)).toBe(expected);
    });

    it('shows usage error text when API call fails', () => {
        const widget = config.createWidget();

        config.errorMessageMock.mockReturnValue('[Timeout]');
        expect(config.render(widget, config.baseItem, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });

    it('hides usage error text when the no-data state is enabled', () => {
        const widget = config.createWidget();

        config.errorMessageMock.mockReturnValue('[Timeout]');
        expect(config.render(widget, {
            ...config.baseItem,
            metadata: { hide: 'no-data' }
        }, { usageData: { error: 'timeout' } })).toBeNull();
    });

    it('renders available usage data before unrelated usage errors', () => {
        const widget = config.createWidget();
        const context: RenderContext = {
            usageData: {
                [config.usageField]: config.usageValue,
                error: 'timeout'
            }
        };

        expect(config.render(widget, config.baseItem, context)).toBe(config.expectedTime);
    });

    // formatPercent's format argument is optional and its default reproduces the
    // baseline output, so a render path that stops passing the resolved format
    // stays invisible against default settings. Pinning a non-default style is
    // what makes that reachable.
    it('applies the resolved number format to the percentage', () => {
        const widget = config.createWidget();
        const context = getUsageContext(config.usageField, config.usageValue);
        const wholePercentItem: WidgetItem = {
            ...config.baseItem,
            numberFormat: { style: 'whole' }
        };

        expect(config.render(widget, wholePercentItem, context)).toBe(config.expectedWholePercentTime);
    });

    it('renders inverted percentage in time mode', () => {
        const widget = config.createWidget();
        const context = getUsageContext(config.usageField, config.usageValue);
        const invertedTimeItem: WidgetItem = {
            ...config.baseItem,
            metadata: { invert: 'true' }
        };
        const rawInvertedTimeItem: WidgetItem = {
            ...config.rawTimeItem,
            metadata: { invert: 'true' }
        };

        expect(config.render(widget, invertedTimeItem, context)).toBe(config.expectedInvertedTime);
        expect(config.render(widget, rawInvertedTimeItem, context)).toBe(config.expectedRawInvertedTime);
        expect(config.render(widget, invertedTimeItem, { isPreview: true })).toBe(config.expectedPreviewInvertedTime);
    });

    it('preserves invert and clears cursor metadata when cycling back to time mode', () => {
        const widget = config.createWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            ...config.baseItem,
            metadata: {
                display: 'glyph',
                invert: 'true',
                cursor: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBe('true');
        expect(updated?.metadata?.cursor).toBeUndefined();
    });

    // (p) cycles the style; the size, long the first time, stays with the bar
    it('cycles the text, a block bar, a slider and the level glyph', () => {
        const widget = config.createWidget();

        const first = widget.handleEditorAction('toggle-progress', config.baseItem);
        const second = widget.handleEditorAction('toggle-progress', first ?? config.baseItem);
        const third = widget.handleEditorAction('toggle-progress', second ?? config.baseItem);
        const fourth = widget.handleEditorAction('toggle-progress', third ?? config.baseItem);

        expect(first?.metadata).toEqual({ display: 'progress' });
        expect(second?.metadata).toEqual({ display: 'slider', barWidth: 'long' });
        expect(third?.metadata).toEqual({ display: 'glyph', barWidth: 'long' });
        expect(fourth?.metadata).toEqual({ display: 'time', barWidth: 'long' });
    });

    // What's left would flip the levels, so the glyph always measures what's used
    it('shows the level glyph for the used percent instead of the number', () => {
        const widget = config.createWidget();
        const glyphItem: WidgetItem = { ...config.baseItem, rawValue: true, metadata: { display: 'glyph' } };

        expect(config.render(widget, glyphItem, getUsageContext(config.usageField, 42))).toBe('⚡');
        expect(config.render(widget, { ...glyphItem, metadata: { display: 'glyph', invert: 'true' } }, getUsageContext(config.usageField, 95))).toBe('🚨');
        expect(config.render(widget, { ...glyphItem, rawValue: false }, getUsageContext(config.usageField, 10))).toMatch(/: 🟢$/);
    });

    it('offers (g) and (l) in the level glyph mode and names it on the editor row', () => {
        const widget = config.createWidget();
        const glyphItem: WidgetItem = { ...config.baseItem, metadata: { display: 'glyph', invert: 'true' } };
        const editorProps = { widget: glyphItem, onComplete: () => undefined, onCancel: () => undefined };

        expect(widget.getCustomKeybinds(glyphItem).map(keybind => keybind.key)).toEqual(['p', 'g', 'l']);
        expect(widget.getEditorDisplay(glyphItem).modifierText).toBe('(level glyph)');
        expect(widget.renderEditor?.({ ...editorProps, action: 'edit-glyph-levels' })).toBeTruthy();
        expect(widget.renderEditor?.({ ...editorProps, action: 'edit-symbol-override' })).toBeTruthy();
    });

    it('toggles invert metadata and shows used/remaining editor modifiers', () => {
        const widget = config.createWidget();

        const inverted = widget.handleEditorAction('toggle-invert', config.baseItem);
        const cleared = widget.handleEditorAction('toggle-invert', inverted ?? config.baseItem);

        expect(inverted?.metadata?.invert).toBe('true');
        expect(cleared?.metadata?.invert).toBe('false');
        expect(widget.getEditorDisplay(config.baseItem).modifierText).toBe('(used)');
        expect(widget.getEditorDisplay(config.modifierItem).modifierText).toBe(config.expectedModifierText);
    });

    it('shows time cursor editor modifiers in short bar modes', () => {
        const widget = config.createWidget();

        expect(widget.getEditorDisplay({
            ...config.baseItem,
            metadata: {
                cursor: 'true',
                display: 'slider'
            }
        }).modifierText).toBe('(slider bar, short, used, time cursor)');
        expect(widget.getEditorDisplay({
            ...config.baseItem,
            metadata: {
                cursor: 'true',
                display: 'slider-only'
            }
        }).modifierText).toBe('(slider bar, short, numbers off, used, time cursor)');
    });

    it('ignores stale compact metadata in editor modifiers', () => {
        const widget = config.createWidget();
        const modifierItemWithCompact: WidgetItem = {
            ...config.modifierItem,
            metadata: {
                ...(config.modifierItem.metadata ?? {}),
                compact: 'true'
            }
        };

        expect(widget.getEditorDisplay({
            ...config.baseItem,
            metadata: { compact: 'true' }
        }).modifierText).toBe('(used)');
        expect(widget.getEditorDisplay(modifierItemWithCompact).modifierText).toBe(config.expectedModifierText);
    });
}

export function runUsageTimerEditorSuite<TWidget extends UsageWidgetLike & { getDisplayName(): string }>(config: UsageTimerEditorSuiteConfig<TWidget>): void {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('supports raw value and exposes widget-managed keybinds for time and progress modes', () => {
        const widget = config.createWidget();

        expect(widget.getDisplayName()).toBe(config.expectedDisplayName);
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds(config.baseItem)).toEqual(config.expectedTimeKeybinds ?? EXPECTED_TIMER_TIME_KEYBINDS);
        expect(widget.getCustomKeybinds(config.modifierItem)).toEqual(config.expectedProgressKeybinds ?? EXPECTED_TIMER_PROGRESS_KEYBINDS);
    });

    it('clears invert metadata when cycling back to time mode', () => {
        const widget = config.createWidget();
        const lastBarMode = config.supportsSliderMode ? 'slider-only' : 'progress-short';
        const updated = widget.handleEditorAction('toggle-progress', {
            ...config.baseItem,
            metadata: {
                display: lastBarMode,
                invert: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
    });

    // (p) cycles the style; the size, long the first time, stays with the bar
    it('cycles the time, a block bar and a slider', () => {
        const widget = config.createWidget();

        const first = widget.handleEditorAction('toggle-progress', config.baseItem);
        const second = widget.handleEditorAction('toggle-progress', first ?? config.baseItem);

        expect(first?.metadata?.display).toBe('progress');

        if (config.supportsSliderMode) {
            const third = widget.handleEditorAction('toggle-progress', second ?? config.baseItem);

            expect(second?.metadata?.display).toBe('slider');
            expect(second?.metadata?.barWidth).toBe('long');
            expect(third?.metadata?.display).toBe('time');
        } else {
            expect(second?.metadata?.display).toBe('time');
        }
    });

    // Changing a widget's type keeps its metadata, so a percent widget's level
    // glyph can come along. A timer has no glyph and shows the time, so the
    // editor reads it as the time too, and (p) goes on to the block bar.
    it('treats a level glyph carried over from a percent widget as the time', () => {
        const widget = config.createWidget();
        const glyphItem: WidgetItem = { ...config.baseItem, metadata: { display: 'glyph', compact: 'true' } };

        expect(widget.getEditorDisplay(glyphItem).modifierText).toBe('(compact)');
        expect(widget.getCustomKeybinds(glyphItem)).toEqual(config.expectedTimeKeybinds ?? EXPECTED_TIMER_TIME_KEYBINDS);
        expect(widget.handleEditorAction('toggle-progress', glyphItem)?.metadata).toEqual({ display: 'progress' });
    });

    it('clears compact metadata when cycling into progress mode', () => {
        const widget = config.createWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            ...config.baseItem,
            metadata: { compact: 'true' }
        });

        expect(updated?.metadata?.display).toBe('progress');
        expect(updated?.metadata?.compact).toBeUndefined();
    });

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = config.createWidget();

        const inverted = widget.handleEditorAction('toggle-invert', config.baseItem);
        const cleared = widget.handleEditorAction('toggle-invert', inverted ?? config.baseItem);

        expect(inverted?.metadata?.invert).toBe('true');
        expect(cleared?.metadata?.invert).toBe('false');
        expect(widget.getEditorDisplay(config.baseItem).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(config.modifierItem).modifierText).toBe(config.expectedModifierText);
    });

    it('toggles compact metadata and shows compact modifier text', () => {
        const widget = config.createWidget();

        const compact = widget.handleEditorAction('toggle-compact', config.baseItem);
        const cleared = widget.handleEditorAction('toggle-compact', compact ?? config.baseItem);

        expect(compact?.metadata?.compact).toBe('true');
        expect(cleared?.metadata?.compact).toBe('false');
        expect(widget.getEditorDisplay({ ...config.baseItem, metadata: { compact: 'true' } }).modifierText).toBe('(compact)');
    });
    if (config.supportsDateMode) {
        it('toggles date metadata and shows date modifier text', () => {
            const widget = config.createWidget();

            const dated = widget.handleEditorAction('toggle-date', config.baseItem);
            const cleared = widget.handleEditorAction('toggle-date', dated ?? config.baseItem);

            expect(dated?.metadata?.absolute).toBe('true');
            expect(cleared?.metadata?.absolute).toBe('false');
            expect(widget.getEditorDisplay({ ...config.baseItem, metadata: { absolute: 'true' } }).modifierText).toBe('(date)');
        });
    }
}
