import {
    getAvailableBackgroundColorsForUI,
    getAvailableColorsForUI
} from '../../../utils/colors';

// The 256-color palette laid out as a grid: the 16 basic colors, the 6x6x6
// color cube as six 6x6 blocks side by side (one block per red level, green
// down the rows, blue across each block), then the 24 grays
export const PALETTE_ROW_COUNT = 8;

const CUBE_START = 16;
const GRAYS_START = 232;
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
// xterm's defaults; terminals theme these, so they're only used to pick a
// readable marker color, never shown
const BASIC_HEX = [
    '000000', '800000', '008000', '808000', '000080', '800080', '008080', 'C0C0C0',
    '808080', 'FF0000', '00FF00', 'FFFF00', '0000FF', 'FF00FF', '00FFFF', 'FFFFFF'
];

// Named colors in ANSI order (black, red, ... bright white), without "Default"
const FOREGROUND_NAMES = getAvailableColorsForUI().filter(color => color.value !== '');
const BACKGROUND_NAMES = getAvailableBackgroundColorsForUI().filter(color => color.value !== '');

export type PaletteDirection = 'up' | 'down' | 'left' | 'right';

export function getPaletteRow(row: number): number[] {
    if (row === 0) {
        return Array.from({ length: 16 }, (_, i) => i);
    }
    if (row === PALETTE_ROW_COUNT - 1) {
        return Array.from({ length: 24 }, (_, i) => GRAYS_START + i);
    }
    const green = row - 1;
    return Array.from({ length: 36 }, (_, column) => {
        const red = Math.floor(column / 6);
        const blue = column % 6;
        return CUBE_START + 36 * red + 6 * green + blue;
    });
}

export function getPalettePosition(index: number): { row: number; column: number } {
    if (index < CUBE_START) {
        return { row: 0, column: index };
    }
    if (index >= GRAYS_START) {
        return { row: PALETTE_ROW_COUNT - 1, column: index - GRAYS_START };
    }
    const offset = index - CUBE_START;
    const red = Math.floor(offset / 36);
    const green = Math.floor(offset / 6) % 6;
    const blue = offset % 6;
    return { row: green + 1, column: 6 * red + blue };
}

export function movePaletteIndex(index: number, direction: PaletteDirection): number {
    const { row, column } = getPalettePosition(index);
    const cells = getPaletteRow(row);

    if (direction === 'left' || direction === 'right') {
        const step = direction === 'right' ? 1 : -1;
        return cells[(column + step + cells.length) % cells.length] ?? index;
    }

    const nextRow = (row + (direction === 'down' ? 1 : -1) + PALETTE_ROW_COUNT) % PALETTE_ROW_COUNT;
    const nextCells = getPaletteRow(nextRow);
    // Scale the column so the first and last cells of rows line up
    const nextColumn = Math.round(column * (nextCells.length - 1) / (cells.length - 1));
    return nextCells[nextColumn] ?? index;
}

function toHex(red: number, green: number, blue: number): string {
    return [red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function getPaletteHex(index: number): string {
    if (index < CUBE_START) {
        return BASIC_HEX[index] ?? '000000';
    }
    if (index >= GRAYS_START) {
        const level = 8 + 10 * (index - GRAYS_START);
        return toHex(level, level, level);
    }
    const offset = index - CUBE_START;
    const level = (n: number) => CUBE_LEVELS[n] ?? 0;
    return toHex(level(Math.floor(offset / 36)), level(Math.floor(offset / 6) % 6), level(offset % 6));
}

function hexToRgb(hex: string): [number, number, number] {
    return [0, 2, 4].map(start => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

export function getPaletteLabel(index: number): string {
    const name = index < CUBE_START ? FOREGROUND_NAMES[index]?.name : undefined;
    return `ANSI ${index}  ${name ?? `#${getPaletteHex(index)}`}`;
}

export function getPaletteMarkerColor(index: number): 'black' | 'white' {
    const [red, green, blue] = hexToRgb(getPaletteHex(index));
    return 0.299 * red + 0.587 * green + 0.114 * blue > 128 ? 'black' : 'white';
}

// Basic colors are saved by name, the same values the arrow keys cycle through
export function paletteIndexToColor(index: number, background: boolean): string {
    if (index < CUBE_START) {
        const names = background ? BACKGROUND_NAMES : FOREGROUND_NAMES;
        const named = names[index]?.value;
        if (named) {
            return named;
        }
    }
    return `ansi256:${index}`;
}

// Basic colors aren't candidates: terminals theme them, so their real values are unknown
function nearestPaletteIndex(hex: string): number {
    const [red, green, blue] = hexToRgb(hex);
    let nearest = CUBE_START;
    let nearestDistance = Infinity;
    for (let index = CUBE_START; index < 256; index++) {
        const [r, g, b] = hexToRgb(getPaletteHex(index));
        const distance = (r - red) ** 2 + (g - green) ** 2 + (b - blue) ** 2;
        if (distance < nearestDistance) {
            nearest = index;
            nearestDistance = distance;
        }
    }
    return nearest;
}

export function colorToPaletteIndex(color: string): number {
    const named = [FOREGROUND_NAMES, BACKGROUND_NAMES]
        .map(names => names.findIndex(entry => entry.value === color))
        .find(index => index !== -1);
    if (named !== undefined) {
        return named;
    }
    if (color.startsWith('ansi256:')) {
        const code = Number.parseInt(color.substring(8), 10);
        if (code >= 0 && code <= 255) {
            return code;
        }
    }
    if (/^hex:[0-9a-f]{6}$/i.test(color)) {
        return nearestPaletteIndex(color.substring(4));
    }
    return 0;
}
