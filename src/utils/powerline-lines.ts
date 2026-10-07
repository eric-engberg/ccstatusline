import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

// Each line can be Powerline or plain. `powerline.enabled` is the default, and
// `powerline.lineEnabled[i]` overrides it for line i (null or missing follows
// the default). Only lines that differ from the default are stored.
type LineEnabled = (boolean | null)[] | undefined;

export function isPowerlineLine(settings: Settings, lineIndex: number): boolean {
    return settings.powerline.lineEnabled?.[lineIndex] ?? settings.powerline.enabled;
}

export function isEveryLinePowerline(settings: Settings): boolean {
    return settings.lines.every((_, index) => isPowerlineLine(settings, index));
}

export function isAnyLinePowerline(settings: Settings): boolean {
    return settings.lines.some((_, index) => isPowerlineLine(settings, index));
}

/** The settings a line renders and is edited with: its own Powerline switch. */
export function getLineSettings(settings: Settings, lineIndex: number): Settings {
    const enabled = isPowerlineLine(settings, lineIndex);
    return enabled === settings.powerline.enabled
        ? settings
        : { ...settings, powerline: { ...settings.powerline, enabled } };
}

/**
 * Whether a line draws its widgets' backgrounds. A line set to plain while
 * Powerline is on doesn't: they're Powerline colors. In plain mode they're the
 * user's own and show.
 */
export function drawsWidgetBackgrounds(settings: Settings, lineIndex: number): boolean {
    return !settings.powerline.enabled || isPowerlineLine(settings, lineIndex);
}

/** The widgets a line renders: without backgrounds on a line that doesn't draw them. */
export function getLineRenderItems(settings: Settings, lineIndex: number, items: WidgetItem[]): WidgetItem[] {
    if (drawsWidgetBackgrounds(settings, lineIndex)) {
        return items;
    }
    return items.map(({ backgroundColor, ...item }) => item);
}

// Trailing nulls dropped, and nothing at all when no line has its own setting
function normalize(lineEnabled: (boolean | null)[]): LineEnabled {
    const trimmed = [...lineEnabled];
    while (trimmed.length > 0 && (trimmed.at(-1) ?? null) === null) {
        trimmed.pop();
    }
    return trimmed.length > 0 ? trimmed : undefined;
}

/** Switches a line between Powerline and plain. */
export function toggleLinePowerline(settings: Settings, lineIndex: number): Settings {
    const enabled = !isPowerlineLine(settings, lineIndex);
    const lineEnabled = Array.from(
        { length: Math.max(settings.powerline.lineEnabled?.length ?? 0, lineIndex + 1) },
        (_, index) => settings.powerline.lineEnabled?.[index] ?? null
    );
    lineEnabled[lineIndex] = enabled === settings.powerline.enabled ? null : enabled;
    return { ...settings, powerline: { ...settings.powerline, lineEnabled: normalize(lineEnabled) } };
}

/** The settings after lines `a` and `b` swap places. */
export function swapLinePowerline(lineEnabled: LineEnabled, a: number, b: number): LineEnabled {
    if (!lineEnabled) {
        return undefined;
    }
    const swapped = Array.from({ length: Math.max(lineEnabled.length, a + 1, b + 1) }, (_, index) => lineEnabled[index] ?? null);
    [swapped[a], swapped[b]] = [swapped[b] ?? null, swapped[a] ?? null];
    return normalize(swapped);
}

/** The settings after line `lineIndex` is deleted. */
export function removeLinePowerline(lineEnabled: LineEnabled, lineIndex: number): LineEnabled {
    return lineEnabled ? normalize(lineEnabled.filter((_, index) => index !== lineIndex)) : undefined;
}

/** Auto-align lines up columns across Powerline lines only; a plain line keeps its place empty. */
export function getAutoAlignLines<T>(settings: Settings, preRenderedLines: T[][]): T[][] {
    return preRenderedLines.map((line, index) => (isPowerlineLine(settings, index) ? line : []));
}
