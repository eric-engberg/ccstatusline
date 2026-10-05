import {
    describe,
    expect,
    it
} from 'vitest';

import {
    paintCode,
    paintForeground
} from '../foreground';

const ORANGE = '\x1b[38;2;255;136;0m';
const FG_RESET = '\x1b[39m';

describe('paintCode', () => {
    it('wraps the text in the code and restores only the default foreground', () => {
        expect(paintCode('Opus', ORANGE)).toBe(`${ORANGE}Opus${FG_RESET}`);
    });

    it('leaves the text bare without a code, and paints nothing around empty text', () => {
        expect(paintCode('Opus', '')).toBe('Opus');
        expect(paintCode('', ORANGE)).toBe('');
    });
});

describe('paintForeground', () => {
    it('paints the text in a color at the given color level', () => {
        expect(paintForeground('Opus', 'hex:ff8800', 'truecolor')).toBe(`${ORANGE}Opus${FG_RESET}`);
        expect(paintForeground('Opus', 'ansi256:208', 'ansi256')).toBe(`\x1b[38;5;208mOpus${FG_RESET}`);
    });

    // The color menu's "Default" stores an empty color
    it('leaves the text bare for a color with no code', () => {
        expect(paintForeground('Opus', '', 'truecolor')).toBe('Opus');
    });
});
