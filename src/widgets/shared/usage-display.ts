import type { NumberFormat } from '../../types/NumberFormat';
import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    WidgetItem
} from '../../types/Widget';
import {
    DEFAULT_RESET_LOCALE,
    canonicalizeLocale
} from '../../utils/locales';
import { formatPercent } from '../../utils/number-format';

import {
    getBarLayoutModifiers,
    getBarNumbersKeybinds,
    getBarStyle,
    keepBarLayout,
    setBarStyle,
    showsBarPercent
} from './bar-layout';
import {
    getBarWidthKeybinds,
    getFixedBarCells
} from './bar-width';
import { makeModifierText } from './editor-display';
import {
    getGradientKeybinds,
    getGradientModifier,
    paintWidgetBar
} from './gradient-bar';
import {
    LEVEL_GLYPH_DISPLAY,
    getLevelGlyphKeybinds,
    isLevelGlyphMode
} from './level-glyph';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys,
    toggleMetadataFlag
} from './metadata';
import { makeTimerProgressBar } from './progress-bar';

export type UsageDisplayMode = 'time' | 'progress' | 'progress-short' | 'slider' | 'slider-only';

// Shared by the usage percentage widgets and the reset timers, which render the
// same error placeholders
export const USAGE_NO_DATA_HIDEABLE_STATE: HideableState = { key: 'no-data', label: 'when usage data is unavailable' };

const SLIDER_WIDTH = 10;

const PROGRESS_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p) bar style', action: 'toggle-progress' };
const INVERT_TOGGLE_KEYBIND: CustomKeybind = { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' };
const COMPACT_TOGGLE_KEYBIND: CustomKeybind = { key: 's', label: '(s)hort time', action: 'toggle-compact' };
const CURSOR_TOGGLE_KEYBIND: CustomKeybind = { key: 't', label: '(t)ime cursor', action: 'toggle-cursor' };
const DATE_TOGGLE_KEYBIND: CustomKeybind = { key: 't', label: '(t)imestamp', action: 'toggle-date' };
// 'h' opens the shared hide checklist, and the items editor appends that bind
// last while matching takes the first hit, so a widget-level 'h' would make the
// checklist unreachable in the modes that offer this toggle.
const HOUR_FORMAT_TOGGLE_KEYBIND: CustomKeybind = { key: 'f', label: '12/24 (f)ormat', action: 'toggle-hour-format' };
const WEEKDAY_TOGGLE_KEYBIND: CustomKeybind = { key: 'w', label: '(w)eekday', action: 'toggle-weekday' };
const TIMEZONE_KEYBIND: CustomKeybind = { key: 'z', label: 'time(z)one', action: 'edit-timezone' };
const LOCALE_KEYBIND: CustomKeybind = { key: 'l', label: '(l)ocale', action: 'edit-locale' };

export function getUsageDisplayMode(item: WidgetItem): UsageDisplayMode {
    const mode = item.metadata?.display;
    if (mode === 'progress' || mode === 'progress-short' || mode === 'slider' || mode === 'slider-only') {
        return mode;
    }
    return 'time';
}

export function isUsageProgressMode(mode: UsageDisplayMode): boolean {
    return mode === 'progress' || mode === 'progress-short';
}

export function isUsageSliderMode(mode: UsageDisplayMode): boolean {
    return mode === 'slider' || mode === 'slider-only';
}

interface SliderBarOptions { cursorPercent?: number }

// The bar modes' text, e.g. "[████░░░░] 50.0%" or "▓▓▓▓░░░░", with the
// widget's gradient, if any. Null in the text mode, without calling getCursor,
// which can be costly to resolve.
export function formatUsageBar(
    item: WidgetItem,
    percent: number,
    format: NumberFormat,
    settings: Settings,
    context: RenderContext,
    getCursor: () => SliderBarOptions | undefined = () => undefined
): string | null {
    const style = getBarStyle(item);
    if (style === null) {
        return null;
    }
    const cells = context.barCells ?? getFixedBarCells(item);
    const bar = style === 'block'
        ? `[${makeTimerProgressBar(percent, cells, getCursor())}]`
        : makeSliderBar(percent, cells, getCursor());
    const text = showsBarPercent(item) ? `${bar} ${formatPercent(percent, format)}` : bar;
    return paintWidgetBar(text, item, settings, isUsageInverted(item));
}

export function makeSliderBar(percent: number, width: number = SLIDER_WIDTH, options?: SliderBarOptions): string {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    const cursorPos = options?.cursorPercent !== undefined
        ? Math.min(Math.floor((Math.max(0, Math.min(100, options.cursorPercent)) / 100) * width), width - 1)
        : -1;

    let bar = '';
    for (let i = 0; i < width; i++) {
        if (i === cursorPos) {
            bar += '│';
        } else if (i < filled) {
            bar += '▓';
        } else {
            bar += '░';
        }
    }

    return bar;
}

export function isUsageInverted(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'invert');
}

export function isUsageCompact(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'compact');
}

export function isUsageCursorEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'cursor');
}

export function toggleUsageCursor(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'cursor');
}

export function isUsageDateMode(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'absolute');
}

export function isUsage12HourClock(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'hour12');
}

export function getUsageTimezone(item: WidgetItem): string | undefined {
    const tz = item.metadata?.timezone;
    return typeof tz === 'string' && tz.length > 0 ? tz : undefined;
}

export function getUsageLocale(item: WidgetItem): string | undefined {
    const locale = item.metadata?.locale;
    return typeof locale === 'string' && locale.length > 0 ? locale : undefined;
}

export function getUsageLocaleModifier(item: WidgetItem): string | undefined {
    const locale = getUsageLocale(item);
    return locale ? `locale: ${locale}` : undefined;
}

export function getUsageTimezoneModifier(item: WidgetItem): string | undefined {
    const timezone = getUsageTimezone(item);
    return timezone ? `tz: ${timezone}` : undefined;
}

export function setUsageTimezone(item: WidgetItem, timezone: string): WidgetItem {
    if (timezone === 'UTC') {
        return removeMetadataKeys(item, ['timezone']);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            timezone
        }
    };
}

export function setUsageLocale(item: WidgetItem, locale: string): WidgetItem {
    const canonicalLocale = canonicalizeLocale(locale);
    if (!canonicalLocale || canonicalLocale === DEFAULT_RESET_LOCALE) {
        return removeMetadataKeys(item, ['locale']);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            locale: canonicalLocale
        }
    };
}

export function toggleUsageCompact(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'compact');
}

export function toggleUsageDateMode(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'absolute');
}

export function toggleUsageHourFormat(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'hour12');
}

export function isUsageWeekdayEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'weekday');
}

export function toggleUsageWeekday(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'weekday');
}

interface UsageDisplayModifierOptions {
    includeCompact?: boolean;
    includeDate?: boolean;
    // The percent widgets' level glyph. Without it, a glyph carried over from
    // one of them by a type change renders as the text mode, so it reads as that.
    includeGlyph?: boolean;
    showUsageDirection?: boolean;
    /** The widget's own modifiers, after the shared ones. */
    extraModifiers?: string[];
}

export function getUsageDisplayModifierText(
    item: WidgetItem,
    options: UsageDisplayModifierOptions = {}
): string | undefined {
    if (options.includeGlyph && isLevelGlyphMode(item)) {
        return '(level glyph)';
    }
    const mode = getUsageDisplayMode(item);
    const modifiers = getBarLayoutModifiers(item);

    if (options.showUsageDirection) {
        modifiers.push(isUsageInverted(item) ? 'remaining' : 'used');
    } else if (isUsageInverted(item)) {
        modifiers.push('inverted');
    }

    if (isUsageCursorEnabled(item) && (isUsageProgressMode(mode) || isUsageSliderMode(mode))) {
        modifiers.push('time cursor');
    }

    if (options.includeCompact && !isUsageProgressMode(mode) && isUsageCompact(item)) {
        modifiers.push('compact');
    }

    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item)) {
        modifiers.push('date');
    }

    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item) && isUsage12HourClock(item)) {
        modifiers.push('12hr');
    }

    const timezoneModifier = getUsageTimezoneModifier(item);
    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item) && timezoneModifier) {
        modifiers.push(timezoneModifier);
    }

    const localeModifier = getUsageLocaleModifier(item);
    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item) && localeModifier) {
        modifiers.push(localeModifier);
    }

    const gradientModifier = getGradientModifier(item);
    if (showsUsageBar(item) && gradientModifier) {
        modifiers.push(gradientModifier);
    }

    modifiers.push(...(options.extraModifiers ?? []));
    return makeModifierText(modifiers);
}

// The plain number: neither a bar nor the level glyph, so value colors apply
export function showsPlainUsageValue(item: WidgetItem): boolean {
    return !showsUsageBar(item) && !isLevelGlyphMode(item);
}

export function showsUsageBar(item: WidgetItem): boolean {
    const mode = getUsageDisplayMode(item);
    return isUsageProgressMode(mode) || isUsageSliderMode(mode);
}

// (p) cycles the style, not the size, which is (b)'s: text, then a block bar
// (long, the first time), then a slider, then text again
// The percent widgets add the level glyph after the slider (includeGlyph). The
// others take a glyph carried over by a type change as the text it renders as.
export function cycleUsageDisplayMode(item: WidgetItem, disabledInProgressKeys: string[] = [], includeSlider = false, preserveInvertInTime = false, includeGlyph = false): WidgetItem {
    const style = getBarStyle(item);
    if (style === null && !(includeGlyph && isLevelGlyphMode(item))) {
        return setBarStyle(removeMetadataKeys(item, disabledInProgressKeys), 'block', 'long');
    }
    if (style === 'block' && includeSlider) {
        return setBarStyle(item, 'slider');
    }

    // Leaving the bar, its size and numbers setting are kept for when it comes back
    const kept = style === null ? item : keepBarLayout(item);
    if (style !== null && includeGlyph) {
        return { ...kept, metadata: { ...kept.metadata, display: LEVEL_GLYPH_DISPLAY } };
    }
    const nextItem = removeMetadataKeys(kept, preserveInvertInTime ? ['cursor'] : ['invert', 'cursor']);
    return { ...nextItem, metadata: { ...nextItem.metadata, display: 'time' } };
}

export function toggleUsageInverted(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'invert');
}

export function getUsagePercentCustomKeybinds(item?: WidgetItem, includeCursor = true): CustomKeybind[] {
    // The level glyph always measures what's used, so used/remaining doesn't apply
    if (item && isLevelGlyphMode(item)) {
        return [PROGRESS_TOGGLE_KEYBIND, ...getLevelGlyphKeybinds()];
    }
    const nextDirection = item && isUsageInverted(item) ? 'used' : 'remaining';
    const keybinds: CustomKeybind[] = [
        PROGRESS_TOGGLE_KEYBIND,
        { key: 'u', label: `(u) show ${nextDirection}`, action: 'toggle-invert' }
    ];

    if (item && includeCursor) {
        const mode = getUsageDisplayMode(item);
        if (isUsageProgressMode(mode) || isUsageSliderMode(mode)) {
            keybinds.push(CURSOR_TOGGLE_KEYBIND);
        }
    }

    const showsBar = item ? showsUsageBar(item) : false;
    keybinds.push(...getGradientKeybinds(showsBar), ...getBarWidthKeybinds(showsBar), ...getBarNumbersKeybinds(item, showsBar));

    return keybinds;
}

interface UsageTimerCustomKeybindOptions {
    includeDate?: boolean;
    includeHourFormat?: boolean;
    includeLocale?: boolean;
    includeTimezone?: boolean;
    includeWeekday?: boolean;
}

export function getUsageTimerCustomKeybinds(
    item?: WidgetItem,
    options: UsageTimerCustomKeybindOptions = {}
): CustomKeybind[] {
    const keybinds = [PROGRESS_TOGGLE_KEYBIND];

    const mode = item ? getUsageDisplayMode(item) : 'time';
    const isBarMode = isUsageProgressMode(mode) || isUsageSliderMode(mode);

    if (item && isBarMode) {
        keybinds.push(INVERT_TOGGLE_KEYBIND);
    } else {
        keybinds.push(COMPACT_TOGGLE_KEYBIND);

        if (options.includeDate) {
            keybinds.push(DATE_TOGGLE_KEYBIND);
        }
    }

    if (item && isUsageDateMode(item) && !isBarMode) {
        if (options.includeHourFormat) {
            keybinds.push(HOUR_FORMAT_TOGGLE_KEYBIND);
        }

        if (options.includeWeekday) {
            keybinds.push(WEEKDAY_TOGGLE_KEYBIND);
        }

        if (options.includeTimezone) {
            keybinds.push(TIMEZONE_KEYBIND);
        }

        if (options.includeLocale) {
            keybinds.push(LOCALE_KEYBIND);
        }
    }

    const showsBar = item !== undefined && isBarMode;
    keybinds.push(...getGradientKeybinds(showsBar), ...getBarWidthKeybinds(showsBar), ...getBarNumbersKeybinds(item, showsBar));

    return keybinds;
}
