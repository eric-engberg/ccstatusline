import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { removeMetadataKeys } from './metadata';

// How wide a widget's bar is. 'default' keeps its display mode's own size; a
// percentage asks for that share of the status line's width; 'fill' takes all
// the room the rest of the line leaves. The renderer sizes these bars to the
// line and shrinks them to fit the terminal, down to MIN_BAR_CELLS.
export type BarWidth = 'default' | 'fill' | number;

const BAR_WIDTH_KEY = 'barWidth';
const MIN_PERCENT = 10;
const MAX_PERCENT = 100;
const PERCENT_STEP = 5;

export const MIN_BAR_CELLS = 5;
export const EDIT_BAR_WIDTH_ACTION = 'edit-bar-width';

const BAR_WIDTH_KEYBIND: CustomKeybind = { key: 'b', label: '(b)ar width', action: EDIT_BAR_WIDTH_ACTION };

// Orders the settings for stepping: the default below 10%, fill above 100%
function rank(width: BarWidth): number {
    if (width === 'default') {
        return 0;
    }
    return width === 'fill' ? MAX_PERCENT + 1 : width;
}

const STEPS: BarWidth[] = ['default'];
for (let percent = MIN_PERCENT; percent <= MAX_PERCENT; percent += PERCENT_STEP) {
    STEPS.push(percent);
}
STEPS.push('fill');

export function getBarWidth(item: WidgetItem): BarWidth {
    const value = item.metadata?.[BAR_WIDTH_KEY];
    if (value === 'fill') {
        return 'fill';
    }
    const percent = /^\d+$/.test(value ?? '') ? Number(value) : Number.NaN;
    return percent >= MIN_PERCENT && percent <= MAX_PERCENT ? percent : 'default';
}

export function setBarWidth(item: WidgetItem, width: BarWidth): WidgetItem {
    if (width === 'default') {
        return removeMetadataKeys(item, [BAR_WIDTH_KEY]);
    }
    return { ...item, metadata: { ...(item.metadata ?? {}), [BAR_WIDTH_KEY]: String(width) } };
}

// The next setting left (-1) or right (1), stopping at the default and at fill
export function stepBarWidth(width: BarWidth, direction: -1 | 1): BarWidth {
    const current = rank(width);
    const next = direction === 1
        ? STEPS.find(step => rank(step) > current)
        : STEPS.filter(step => rank(step) < current).at(-1);
    return next ?? width;
}

export function formatBarWidth(width: BarWidth): string {
    return typeof width === 'number' ? `${width}%` : width;
}

// The line editor's modifier, e.g. "50% width"; null for the default
export function getBarWidthModifier(item: WidgetItem): string | null {
    const width = getBarWidth(item);
    return width === 'default' ? null : `${formatBarWidth(width)} width`;
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
