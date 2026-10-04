import type { ColorLevelString } from '../../types/ColorLevel';
import {
    gradientCodeAt,
    rgbToAnsi256,
    type Rgb
} from '../../utils/gradient';

// Green, through yellow, to red
const BAR_GRADIENT: Rgb[] = [
    { r: 0, g: 200, b: 80 },
    { r: 220, g: 200, b: 0 },
    { r: 220, g: 40, b: 20 }
];
const EMPTY_CELL: Rgb = { r: 60, g: 60, b: 60 };
const FILLED_CELLS = new Set(['█', '▓']);
const EMPTY_CELLS = new Set(['░']);
// 16-color terminals get three bands instead of a gradient
const BAND_CODES = ['\x1b[32m', '\x1b[33m', '\x1b[31m'];
const EMPTY_CELL_CODE_ANSI16 = '\x1b[90m';
const DEFAULT_FOREGROUND = '\x1b[39m';

function filledCellCode(t: number, colorLevel: ColorLevelString): string {
    if (colorLevel === 'ansi16') {
        return BAND_CODES[Math.min(BAND_CODES.length - 1, Math.floor(t * BAND_CODES.length))] ?? '';
    }
    return gradientCodeAt(BAR_GRADIENT, t, colorLevel);
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

// Colors a bar's filled cells by where they sit along a green-to-red gradient,
// so a fuller bar reaches further into the red, and its empty cells dark gray.
// Other characters, such as brackets, are left alone. Each colored run ends with
// the default-foreground code, which the renderer turns back into the widget's
// own color.
export function paintGradientBar(bar: string, colorLevel: ColorLevelString): string {
    const chars = Array.from(bar);
    const cellCount = chars.filter(char => FILLED_CELLS.has(char) || EMPTY_CELLS.has(char)).length;
    let cellIndex = 0;
    let activeCode = '';
    let painted = '';

    for (const char of chars) {
        let code = '';
        if (FILLED_CELLS.has(char)) {
            code = filledCellCode(cellCount > 1 ? cellIndex / (cellCount - 1) : 0, colorLevel);
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
