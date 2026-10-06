import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { removeMetadataKeys } from './metadata';
import {
    SYMBOL_OVERRIDE_ACTION,
    getSlotSymbol,
    type SymbolSlot
} from './symbol-override';

// The glyph display mode of the percent widgets: one glyph for how high the
// used percent runs, e.g. 🟢 → ⚡ → 🔥 → 🚨. A second copy of the widget can
// show the number beside it. The glyphs and the three break points between
// them are the widget's own; each stores nothing while at its default.
export const LEVEL_GLYPH_DISPLAY = 'glyph';
export const EDIT_LEVELS_ACTION = 'edit-glyph-levels';

export const LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type Level = typeof LEVELS[number];
// The levels that start at a break point
export type LevelBreakPoint = Exclude<Level, 'low'>;
export const LEVEL_BREAK_POINTS: readonly LevelBreakPoint[] = ['medium', 'high', 'critical'];

const LEVEL_NAMES: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const DEFAULT_GLYPHS: Record<Level, string> = { low: '🟢', medium: '⚡', high: '🔥', critical: '🚨' };
const DEFAULT_BREAK_POINTS: Record<LevelBreakPoint, number> = { medium: 20, high: 70, critical: 90 };
const GLYPH_KEYS: Record<Level, string> = { low: 'levelGlyphLow', medium: 'levelGlyphMedium', high: 'levelGlyphHigh', critical: 'levelGlyphCritical' };
const BREAK_POINT_KEYS: Record<LevelBreakPoint, string> = { medium: 'levelFromMedium', high: 'levelFromHigh', critical: 'levelFromCritical' };
const MIN_BREAK_POINT = 1;
const MAX_BREAK_POINT = 100;
const BREAK_POINT_STEP = 5;

const LEVEL_KEYBINDS: CustomKeybind[] = [
    { key: 'g', label: '(g)lyphs', action: SYMBOL_OVERRIDE_ACTION },
    { key: 'l', label: '(l)evels', action: EDIT_LEVELS_ACTION }
];

export function isLevelGlyphMode(item: WidgetItem): boolean {
    return item.metadata?.display === LEVEL_GLYPH_DISPLAY;
}

// Break points out of range or out of order fall back to the defaults, all
// together, so the levels never overlap
export function getLevelBreakPoints(item: WidgetItem): Record<LevelBreakPoint, number> {
    const read = (point: LevelBreakPoint): number => {
        const value = item.metadata?.[BREAK_POINT_KEYS[point]] ?? '';
        return /^\d+$/.test(value) ? Number(value) : DEFAULT_BREAK_POINTS[point];
    };
    const points = { medium: read('medium'), high: read('high'), critical: read('critical') };
    const valid = points.medium >= MIN_BREAK_POINT
        && points.medium < points.high
        && points.high < points.critical
        && points.critical <= MAX_BREAK_POINT;
    return valid ? points : { ...DEFAULT_BREAK_POINTS };
}

export function getLevel(item: WidgetItem, usedPercent: number): Level {
    const points = getLevelBreakPoints(item);
    const reached = LEVEL_BREAK_POINTS.filter(point => usedPercent >= points[point]);
    return reached.at(-1) ?? 'low';
}

function getLevelRanges(item: WidgetItem): Record<Level, string> {
    const points = getLevelBreakPoints(item);
    return {
        low: `under ${points.medium}%`,
        medium: `${points.medium}-${points.high - 1}%`,
        high: `${points.high}-${points.critical - 1}%`,
        critical: `${points.critical}% and up`
    };
}

function getLevelSlot(level: Level, label: string): SymbolSlot {
    return { id: GLYPH_KEYS[level], label, defaultSymbol: DEFAULT_GLYPHS[level] };
}

// One glyph slot per level, for the shared glyph editor, labeled with its range
export function getLevelGlyphSlots(item: WidgetItem): SymbolSlot[] {
    const ranges = getLevelRanges(item);
    return LEVELS.map(level => getLevelSlot(level, `${LEVEL_NAMES[level]} (${ranges[level]})`));
}

export function getLevelGlyph(item: WidgetItem, usedPercent: number): string {
    const level = getLevel(item, usedPercent);
    return getSlotSymbol(item, getLevelSlot(level, LEVEL_NAMES[level]));
}

// The glyph at each level with its range, e.g. "🟢 under 20%  ⚡ 20-69%"
export function formatLevelSample(item: WidgetItem): string {
    const ranges = getLevelRanges(item);
    return LEVELS.map(level => `${getSlotSymbol(item, getLevelSlot(level, LEVEL_NAMES[level]))} ${ranges[level]}`).join('  ');
}

function setLevelBreakPoint(item: WidgetItem, point: LevelBreakPoint, value: number): WidgetItem {
    const key = BREAK_POINT_KEYS[point];
    if (value === DEFAULT_BREAK_POINTS[point]) {
        return removeMetadataKeys(item, [key]);
    }
    return { ...item, metadata: { ...item.metadata, [key]: String(value) } };
}

// The range a break point can take without reaching its neighbors
function getBreakPointRange(item: WidgetItem, point: LevelBreakPoint): { min: number; max: number } {
    const points = getLevelBreakPoints(item);
    const index = LEVEL_BREAK_POINTS.indexOf(point);
    const below = LEVEL_BREAK_POINTS[index - 1];
    const above = LEVEL_BREAK_POINTS[index + 1];
    return {
        min: below ? points[below] + 1 : MIN_BREAK_POINT,
        max: above ? points[above] - 1 : MAX_BREAK_POINT
    };
}

// Steps land on multiples of the step, so a break point that's off them (held
// next to a neighbor, or typed) steps back onto them
export function stepLevelBreakPoint(item: WidgetItem, point: LevelBreakPoint, direction: 1 | -1): WidgetItem {
    const { min, max } = getBreakPointRange(item, point);
    const current = getLevelBreakPoints(item)[point];
    const stepped = direction === 1
        ? (Math.floor(current / BREAK_POINT_STEP) + 1) * BREAK_POINT_STEP
        : (Math.ceil(current / BREAK_POINT_STEP) - 1) * BREAK_POINT_STEP;
    return setLevelBreakPoint(item, point, Math.min(max, Math.max(min, stepped)));
}

/** A typed break point: the updated item, or the error to show. */
export function typeLevelBreakPoint(item: WidgetItem, point: LevelBreakPoint, text: string): WidgetItem | string {
    const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
    if (Number.isNaN(value) || value < MIN_BREAK_POINT || value > MAX_BREAK_POINT) {
        return `Use a whole number from ${MIN_BREAK_POINT} to ${MAX_BREAK_POINT}.`;
    }

    const points = getLevelBreakPoints(item);
    const { min, max } = getBreakPointRange(item, point);
    const index = LEVEL_BREAK_POINTS.indexOf(point);
    const above = LEVEL_BREAK_POINTS[index + 1];
    const below = LEVEL_BREAK_POINTS[index - 1];
    if (value > max && above) {
        return `${LEVEL_NAMES[point]} has to start below ${LEVEL_NAMES[above]} (${points[above]}%).`;
    }
    if (value < min && below) {
        return `${LEVEL_NAMES[point]} has to start above ${LEVEL_NAMES[below]} (${points[below]}%).`;
    }
    return setLevelBreakPoint(item, point, value);
}

export function getLevelBreakPointLabel(point: LevelBreakPoint): string {
    return `${LEVEL_NAMES[point]} from`;
}

export function getLevelGlyphKeybinds(): CustomKeybind[] {
    return LEVEL_KEYBINDS;
}
