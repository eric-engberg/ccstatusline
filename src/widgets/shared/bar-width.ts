import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

// How big a widget's bar is. Short, medium and long are fixed sizes; a
// percentage asks for that share of the status line's width; 'fill' takes all
// the room the rest of the line leaves. The renderer sizes percentage and fill
// bars to the line and shrinks them to fit the terminal, down to MIN_BAR_CELLS.
export type NamedBarSize = 'short' | 'medium' | 'long';
export type BarSize = NamedBarSize | 'fill' | number;

const BAR_WIDTH_KEY = 'barWidth';
const NAMED_BAR_SIZES: readonly NamedBarSize[] = ['short', 'medium', 'long'];
const NAMED_BAR_CELLS: Record<NamedBarSize, number> = { short: 10, medium: 16, long: 32 };
const MIN_PERCENT = 10;
const MAX_PERCENT = 100;
const PERCENT_STEP = 5;

export const MIN_BAR_CELLS = 5;
export const EDIT_BAR_WIDTH_ACTION = 'edit-bar-width';

const BAR_WIDTH_KEYBIND: CustomKeybind = { key: 'b', label: '(b)ar size', action: EDIT_BAR_WIDTH_ACTION };

function isNamedBarSize(value: unknown): value is NamedBarSize {
    return NAMED_BAR_SIZES.includes(value as NamedBarSize);
}

// Orders the sizes for stepping: the named ones, then percentages, then fill
function rank(size: BarSize): number {
    if (isNamedBarSize(size)) {
        return NAMED_BAR_SIZES.indexOf(size);
    }
    return size === 'fill' ? MAX_PERCENT + NAMED_BAR_SIZES.length + 1 : size + NAMED_BAR_SIZES.length;
}

const STEPS: BarSize[] = [...NAMED_BAR_SIZES];
for (let percent = MIN_PERCENT; percent <= MAX_PERCENT; percent += PERCENT_STEP) {
    STEPS.push(percent);
}
STEPS.push('fill');

// The size a display mode has always meant, for bars with no size of their own:
// long and medium block bars, short sliders
export function getImpliedBarSize(item: WidgetItem): NamedBarSize {
    const display = item.metadata?.display;
    if (display === 'progress') {
        return 'long';
    }
    return display === 'slider' || display === 'slider-only' ? 'short' : 'medium';
}

/** The bar's own size setting, or null when it has none. */
export function getStoredBarSize(item: WidgetItem): BarSize | null {
    const value = item.metadata?.[BAR_WIDTH_KEY];
    if (value === 'fill' || isNamedBarSize(value)) {
        return value;
    }
    const percent = /^\d+$/.test(value ?? '') ? Number(value) : Number.NaN;
    return percent >= MIN_PERCENT && percent <= MAX_PERCENT ? percent : null;
}

export function getBarSize(item: WidgetItem): BarSize {
    return getStoredBarSize(item) ?? getImpliedBarSize(item);
}

/** What a bar sized to its line asks for; null for the fixed sizes. */
export function getLineBarWidth(item: WidgetItem): number | 'fill' | null {
    const size = getBarSize(item);
    return isNamedBarSize(size) ? null : size;
}

// A bar's cells when the renderer hasn't sized it to its line: its fixed size,
// or, for a percentage or fill bar on a line of unknown width, its display
// mode's size
export function getFixedBarCells(item: WidgetItem): number {
    const size = getBarSize(item);
    return NAMED_BAR_CELLS[isNamedBarSize(size) ? size : getImpliedBarSize(item)];
}

/** The barWidth value for a size, or null when the display mode already implies it. */
export function getBarSizeMetadata(size: BarSize, implied: NamedBarSize): string | null {
    return size === implied ? null : String(size);
}

// The next size left (-1) or right (1), stopping at short and at fill
export function stepBarSize(size: BarSize, direction: -1 | 1): BarSize {
    const current = rank(size);
    // The step before the first one at or above the current size is the last below it
    const next = direction === 1
        ? STEPS.find(step => rank(step) > current)
        : STEPS[STEPS.findIndex(step => rank(step) >= current) - 1];
    return next ?? size;
}

export function formatBarSize(size: BarSize): string {
    return typeof size === 'number' ? `${size}%` : size;
}

// The line editor's modifier, e.g. "long" or "50% width"
export function getBarSizeModifier(item: WidgetItem): string {
    const size = getBarSize(item);
    return isNamedBarSize(size) ? size : `${formatBarSize(size)} width`;
}

export function getBarWidthKeybinds(showsBar: boolean): CustomKeybind[] {
    return showsBar ? [BAR_WIDTH_KEYBIND] : [];
}

// The cells a sized bar asks for on a line this wide; fill asks for all of it
export function getDesiredBarCells(width: number | 'fill', lineWidth: number): number {
    if (width === 'fill') {
        return Number.POSITIVE_INFINITY;
    }
    return Math.max(MIN_BAR_CELLS, Math.round((width / 100) * lineWidth));
}

// Sizes a line's bars, given the cells each asks for and the room the line has
// beyond every bar at MIN_BAR_CELLS. Percentage bars are served first, shrunk in
// proportion when they don't all fit; fill bars split what's left evenly.
export function allocateBarCells(desired: number[], room: number): number[] {
    const cells = desired.map(() => MIN_BAR_CELLS);
    let extra = Math.max(0, room);

    const sized = desired.flatMap((cellCount, index) => (Number.isFinite(cellCount) ? [index] : []));
    const needs = sized.map(index => (desired[index] ?? MIN_BAR_CELLS) - MIN_BAR_CELLS);
    const totalNeed = needs.reduce((sum, need) => sum + need, 0);
    const grants = totalNeed <= extra
        ? needs
        : needs.map(need => Math.floor((need * extra) / totalNeed));
    let leftover = Math.min(extra, totalNeed) - grants.reduce((sum, grant) => sum + grant, 0);
    sized.forEach((index, position) => {
        const bonus = leftover > 0 && (grants[position] ?? 0) < (needs[position] ?? 0) ? 1 : 0;
        leftover -= bonus;
        cells[index] = MIN_BAR_CELLS + (grants[position] ?? 0) + bonus;
    });
    extra -= Math.min(extra, totalNeed);

    const fills = desired.flatMap((cellCount, index) => (Number.isFinite(cellCount) ? [] : [index]));
    const share = fills.length > 0 ? Math.floor(extra / fills.length) : 0;
    const remainder = fills.length > 0 ? extra % fills.length : 0;
    fills.forEach((index, position) => {
        cells[index] = MIN_BAR_CELLS + share + (position >= fills.length - remainder ? 1 : 0);
    });

    return cells;
}
