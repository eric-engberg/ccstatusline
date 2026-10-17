import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import {
    gradientCodeAt,
    type Rgb
} from '../../utils/gradient';

import { removeMetadataKeys } from './metadata';
import type { BarCell } from './progress-bar';
import {
    isValueColorsEnabled,
    setValueColorsFlag
} from './value-colors-flag';

export const BAR_GRADIENT_PRESETS = ['traffic', 'thermal', 'viridis', 'cividis', 'blue-orange', 'mono'] as const;
export type BarGradientPreset = typeof BAR_GRADIENT_PRESETS[number];

interface BarGradient { stops: Rgb[] }

function hex(value: string): Rgb {
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16)
    };
}

// Every preset runs from calm to urgent. Viridis, cividis, blue-orange and mono
// stay readable with red-green color blindness; viridis, cividis and mono get
// steadily brighter, so they also read in grayscale. Viridis and cividis skip
// their darkest colors, which vanish on black terminals and dark Powerline segments.
const BAR_GRADIENTS: Record<BarGradientPreset, BarGradient> = {
    'traffic': { stops: [hex('00C850'), hex('DCC800'), hex('DC2814')] },
    'thermal': { stops: [hex('3A6FD8'), hex('A24BD0'), hex('E8364A')] },
    'viridis': { stops: [hex('2A788E'), hex('22A884'), hex('7AD151'), hex('FDE725')] },
    'cividis': { stops: [hex('3E6AA8'), hex('8A8779'), hex('FFEA46')] },
    'blue-orange': { stops: [hex('0072B2'), hex('F0E442'), hex('D55E00')] },
    'mono': { stops: [hex('707070'), hex('B4B4B4'), hex('FFFFFF')] }
};

// The code at a position (0 to 1) along a preset, for widgets that color a
// single value by how far along it is. One color at a time needs no smooth
// blend, so 256 colors will do.
export function gradientPresetCodeAt(preset: BarGradientPreset, position: number, colorLevel: 'ansi256' | 'truecolor'): string {
    return gradientCodeAt(BAR_GRADIENTS[preset].stops, position, colorLevel);
}

export function isBarGradientPreset(value: string | undefined): value is BarGradientPreset {
    return (BAR_GRADIENT_PRESETS as readonly string[]).includes(value ?? '');
}

const EMPTY_CELL_CODE = '\x1b[38;2;60;60;60m';
const DEFAULT_FOREGROUND = '\x1b[39m';
const FAINT = '\x1b[2m';
// Normal intensity ends faint, and bold with it
const NORMAL_INTENSITY = '\x1b[22m';
const NORMAL_INTENSITY_THEN_BOLD = '\x1b[22;1m';

/** The characters a bar draws its filled and empty cells with; the time cursor is always │. */
export interface BarGlyphs {
    filled: string;
    empty: string;
}

const CURSOR_GLYPH = '│';

/** How a bar's cells are painted: by a gradient preset or not at all, with faint empty cells or not. */
export interface BarPaint {
    preset: BarGradientPreset | null;
    // Runs the gradient from the urgent end, for bars that fill with what's left
    reversed?: boolean;
    // Draws the empty cells as they would look filled, but faint, for a bar
    // whose filled and empty cells are the same character. Ending faint ends
    // bold too, so a bold widget's bar turns bold back on after them.
    faintEmpty?: { bold: boolean };
}

// Draws a bar's cells. With a preset, filled cells are colored by where they sit
// along its gradient, so a fuller bar reaches further toward its urgent end, and
// empty cells dark gray; the time cursor keeps the widget color. Truecolor only:
// the 256-color palette is too coarse for a smooth gradient. Each colored run
// ends with the default-foreground code, which the renderer turns back into the
// widget's own color. Faint empty cells take the color they would have filled
// instead of the gray, and each faint run ends before the next cell that isn't
// empty, so faint never reaches past the bar.
export function paintBarCells(cells: readonly BarCell[], glyphs: BarGlyphs, paint: BarPaint): string {
    const gradient = paint.preset ? BAR_GRADIENTS[paint.preset] : null;
    const endFaint = paint.faintEmpty?.bold ? NORMAL_INTENSITY_THEN_BOLD : NORMAL_INTENSITY;
    const isFaint = (index: number) => paint.faintEmpty !== undefined && cells[index] === 'empty';
    let activeCode = '';
    let painted = '';

    cells.forEach((cell, index) => {
        const cellFaint = isFaint(index);
        let code = '';
        if (gradient && (cell === 'filled' || cellFaint)) {
            const position = cells.length > 1 ? index / (cells.length - 1) : 0;
            code = gradientCodeAt(gradient.stops, paint.reversed ? 1 - position : position, 'truecolor');
        } else if (gradient && cell === 'empty') {
            code = EMPTY_CELL_CODE;
        }

        if (cellFaint !== isFaint(index - 1)) {
            painted += cellFaint ? FAINT : endFaint;
        }
        if (code !== activeCode) {
            painted += code || DEFAULT_FOREGROUND;
            activeCode = code;
        }
        painted += cell === 'cursor' ? CURSOR_GLYPH : glyphs[cell];
    });

    if (isFaint(cells.length - 1)) {
        painted += endFaint;
    }
    return activeCode ? painted + DEFAULT_FOREGROUND : painted;
}

export const CYCLE_GRADIENT_ACTION = 'cycle-gradient';
const GRADIENT_KEY = 'gradient';
const GRADIENT_KEYBIND: CustomKeybind = { key: 'g', label: '(g)radient', action: CYCLE_GRADIENT_ACTION };

// "true" is the earlier on/off setting, from before there were presets. Value
// colors give the whole bar one color for its level, so while they're on a
// saved preset is set aside.
export function getGradientPreset(item: WidgetItem): BarGradientPreset | null {
    if (isValueColorsEnabled(item)) {
        return null;
    }
    const value = item.metadata?.[GRADIENT_KEY];
    if (value === 'true') {
        return 'traffic';
    }
    return isBarGradientPreset(value) ? value : null;
}

// Off, then each preset in turn, then off again. Turning a preset on turns
// value colors off, keeping their settings.
export function cycleGradientPreset(item: WidgetItem): WidgetItem {
    const current = getGradientPreset(item);
    const next = current === null ? BAR_GRADIENT_PRESETS[0] : BAR_GRADIENT_PRESETS[BAR_GRADIENT_PRESETS.indexOf(current) + 1];
    if (!next) {
        return clearGradientPreset(item);
    }
    const base = setValueColorsFlag(item, false);
    return { ...base, metadata: { ...(base.metadata ?? {}), [GRADIENT_KEY]: next } };
}

export function clearGradientPreset(item: WidgetItem): WidgetItem {
    return removeMetadataKeys(item, [GRADIENT_KEY]);
}

// The 256-color palette is too coarse for a smooth gradient, so it needs truecolor
export function supportsBarGradient(settings: Settings): boolean {
    return settings.colorLevel === 3;
}

// A widget offers (g) while it shows a bar; the line editor hides it below
// truecolor (see filterGradientKeybinds)
export function getGradientKeybinds(showsBar: boolean): CustomKeybind[] {
    return showsBar ? [GRADIENT_KEYBIND] : [];
}

// The line editor's modifier for the widget's preset, e.g. "gradient: thermal"
export function getGradientModifier(item: WidgetItem): string | null {
    const preset = getGradientPreset(item);
    return preset ? `gradient: ${preset}` : null;
}

// Like Edit Colors' color options, (g) is offered only where it can show
export function filterGradientKeybinds(keybinds: CustomKeybind[], settings: Settings): CustomKeybind[] {
    return supportsBarGradient(settings) ? keybinds : keybinds.filter(keybind => keybind.action !== CYCLE_GRADIENT_ACTION);
}

// Below truecolor a saved preset renders plain; the line editor says why
export function noteGradientNeedsTruecolor(modifierText: string | undefined, settings: Settings): string | undefined {
    if (!modifierText || supportsBarGradient(settings)) {
        return modifierText;
    }
    return modifierText.replace(/gradient: ([a-z-]+)/, 'gradient: $1, needs truecolor');
}

// A bar with a preset colors its own cells, so a gradient widget color has to
// go around them instead of over them (Widget.colorsOnlyItsRuns). Below
// truecolor or under a global foreground override nothing is painted, and there
// is nothing to go around.
export function paintsBarGradient(item: WidgetItem, showsBar: boolean): boolean {
    return showsBar && getGradientPreset(item) !== null;
}

// The widget's bar gradient, when the settings allow it. A global foreground
// override owns every widget's foreground, so it wins.
export function getBarPaintPreset(item: WidgetItem, settings: Settings): BarGradientPreset | null {
    const override = settings.overrideForegroundColor;
    if (!supportsBarGradient(settings) || (override && override !== 'none')) {
        return null;
    }
    return getGradientPreset(item);
}
