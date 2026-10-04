import type { ColorLevelString } from '../../types/ColorLevel';
import {
    gradientCodeAt,
    rgbToAnsi256,
    type Rgb
} from '../../utils/gradient';

export const BAR_GRADIENT_PRESETS = ['traffic', 'thermal', 'viridis', 'cividis', 'blue-orange', 'mono'] as const;
export type BarGradientPreset = typeof BAR_GRADIENT_PRESETS[number];

interface BarGradient {
    stops: Rgb[];
    // 16-color terminals get three bands instead of a gradient
    bands: [string, string, string];
}

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
    'traffic': { stops: [hex('00C850'), hex('DCC800'), hex('DC2814')], bands: ['\x1b[32m', '\x1b[33m', '\x1b[31m'] },
    'thermal': { stops: [hex('3A6FD8'), hex('A24BD0'), hex('E8364A')], bands: ['\x1b[34m', '\x1b[35m', '\x1b[31m'] },
    'viridis': { stops: [hex('2A788E'), hex('22A884'), hex('7AD151'), hex('FDE725')], bands: ['\x1b[34m', '\x1b[36m', '\x1b[33m'] },
    'cividis': { stops: [hex('3E6AA8'), hex('8A8779'), hex('FFEA46')], bands: ['\x1b[34m', '\x1b[37m', '\x1b[33m'] },
    'blue-orange': { stops: [hex('0072B2'), hex('F0E442'), hex('D55E00')], bands: ['\x1b[34m', '\x1b[33m', '\x1b[31m'] },
    'mono': { stops: [hex('707070'), hex('B4B4B4'), hex('FFFFFF')], bands: ['\x1b[90m', '\x1b[37m', '\x1b[97m'] }
};

export function isBarGradientPreset(value: string | undefined): value is BarGradientPreset {
    return (BAR_GRADIENT_PRESETS as readonly string[]).includes(value ?? '');
}

const EMPTY_CELL: Rgb = { r: 60, g: 60, b: 60 };
const FILLED_CELLS = new Set(['█', '▓']);
const EMPTY_CELLS = new Set(['░']);
const EMPTY_CELL_CODE_ANSI16 = '\x1b[90m';
const DEFAULT_FOREGROUND = '\x1b[39m';

function filledCellCode(gradient: BarGradient, t: number, colorLevel: ColorLevelString): string {
    if (colorLevel === 'ansi16') {
        return gradient.bands[Math.min(gradient.bands.length - 1, Math.floor(t * gradient.bands.length))] ?? '';
    }
    return gradientCodeAt(gradient.stops, t, colorLevel);
}

function emptyCellCode(colorLevel: ColorLevelString): string {
    if (colorLevel === 'ansi16') {
        return EMPTY_CELL_CODE_ANSI16;
    }
    if (colorLevel === 'ansi256') {
        return `\x1b[38;5;${rgbToAnsi256(EMPTY_CELL)}m`;
    }
    return `\x1b[38;2;${EMPTY_CELL.r};${EMPTY_CELL.g};${EMPTY_CELL.b}m`;
}

// Colors a bar's filled cells by where they sit along the preset's gradient, so
// a fuller bar reaches further toward its urgent end, and its empty cells dark gray.
// Other characters, such as brackets, are left alone. Each colored run ends with
// the default-foreground code, which the renderer turns back into the widget's
// own color.
export function paintGradientBar(bar: string, colorLevel: ColorLevelString, preset: BarGradientPreset = 'traffic'): string {
    const gradient = BAR_GRADIENTS[preset];
    const chars = Array.from(bar);
    const cellCount = chars.filter(char => FILLED_CELLS.has(char) || EMPTY_CELLS.has(char)).length;
    let cellIndex = 0;
    let activeCode = '';
    let painted = '';

    for (const char of chars) {
        let code = '';
        if (FILLED_CELLS.has(char)) {
            code = filledCellCode(gradient, cellCount > 1 ? cellIndex / (cellCount - 1) : 0, colorLevel);
            cellIndex++;
        } else if (EMPTY_CELLS.has(char)) {
            code = emptyCellCode(colorLevel);
            cellIndex++;
        }

        if (code !== activeCode) {
            painted += code || DEFAULT_FOREGROUND;
            activeCode = code;
        }
        painted += char;
    }

    return activeCode ? painted + DEFAULT_FOREGROUND : painted;
}
