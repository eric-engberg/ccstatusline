import {
    gradientCodeAt,
    type Rgb
} from '../../utils/gradient';

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

export function isBarGradientPreset(value: string | undefined): value is BarGradientPreset {
    return (BAR_GRADIENT_PRESETS as readonly string[]).includes(value ?? '');
}

const EMPTY_CELL_CODE = '\x1b[38;2;60;60;60m';
const FILLED_CELLS = new Set(['█', '▓']);
const EMPTY_CELLS = new Set(['░']);
const DEFAULT_FOREGROUND = '\x1b[39m';

// Colors a bar's filled cells by where they sit along the preset's gradient, so
// a fuller bar reaches further toward its urgent end, and its empty cells dark gray.
// Truecolor only: the 256-color palette is too coarse for a smooth gradient.
// Other characters, such as brackets, are left alone. Each colored run ends with
// the default-foreground code, which the renderer turns back into the widget's
// own color.
export function paintGradientBar(bar: string, preset: BarGradientPreset = 'traffic'): string {
    const gradient = BAR_GRADIENTS[preset];
    const chars = Array.from(bar);
    const cellCount = chars.filter(char => FILLED_CELLS.has(char) || EMPTY_CELLS.has(char)).length;
    let cellIndex = 0;
    let activeCode = '';
    let painted = '';

    for (const char of chars) {
        let code = '';
        if (FILLED_CELLS.has(char)) {
            code = gradientCodeAt(gradient.stops, cellCount > 1 ? cellIndex / (cellCount - 1) : 0, 'truecolor');
            cellIndex++;
        } else if (EMPTY_CELLS.has(char)) {
            code = EMPTY_CELL_CODE;
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
