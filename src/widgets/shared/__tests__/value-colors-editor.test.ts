import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';
import {
    renderValueColorsEditor,
    type ValueColorsEditorOptions
} from '../value-colors-editor';

import {
    DOWN,
    ENTER,
    ESC,
    LEFT,
    RIGHT,
    renderWidgetEditor
} from './helpers/widget-editor-harness';

// Rows in break points mode: mode, low, mid, high, mid from, high above.
// In gradient mode: mode, gradient, ends at.
const TODAY_OPTIONS: ValueColorsEditorOptions = {
    title: 'Extra Usage Today: value colors',
    scale: { midFrom: 80, highFrom: 100, highEdge: 'above' },
    sampleNote: 'of today\'s budget',
    defaultColor: 'green'
};
const UTILIZATION_OPTIONS: ValueColorsEditorOptions = {
    title: 'Extra Usage Utilization: value colors',
    scale: { midFrom: 70, highFrom: 90, highEdge: 'from' },
    sampleNote: 'used',
    defaultColor: 'green',
    maxPercent: 100
};

const today: WidgetItem = { id: 't', type: 'extra-usage-today', rawValue: true };
const todayGradient: WidgetItem = { ...today, metadata: { valueColorMode: 'gradient' } };

function renderEditor(widget: WidgetItem, options = TODAY_OPTIONS, settings?: Settings) {
    const editor = (props: WidgetEditorProps) => renderValueColorsEditor({ ...props, settings }, options);
    return renderWidgetEditor(editor, widget);
}

describe('value colors editor', () => {
    it('samples values around the break points and lists break points mode\'s settings', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toContain('Extra Usage Today: value colors');
            expect(output).toContain('Sample: 40% 80% 100% 120% of today\'s budget');
            expect(output).toMatch(/mode\s+Break points/);
            expect(output).toMatch(/low\s+Green/);
            expect(output).toMatch(/mid\s+Yellow/);
            expect(output).toMatch(/high\s+Red/);
            expect(output).toMatch(/mid from\s+80%/);
            expect(output).toMatch(/high above\s+100%/);
            expect(output).not.toMatch(/gradient\s+traffic/);
            expect(output).not.toContain('ends at');
        } finally {
            editor.cleanup();
        }
    });

    it('labels the high break point by whether it starts the high band', async () => {
        const editor = renderEditor({ ...today, type: 'extra-usage-utilization' }, UTILIZATION_OPTIONS);

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toMatch(/high from\s+90%/);
            // Utilization can't pass 100%
            expect(output).toContain('Sample: 35% 70% 90% 100% used');
        } finally {
            editor.cleanup();
        }
    });

    it('turns value colors on with Space and saves on Enter', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            await editor.press(' ', ENTER);
            expect(editor.savedMetadata()).toEqual({ valueColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });

    // Gradient mode shows only its own settings, and samples along the gradient and past its end
    it('switches to a gradient and cycles its preset both ways', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            editor.takeOutput();
            await editor.press(RIGHT);
            const output = editor.takeOutput();
            expect(output).toContain('Sample: 25% 50% 75% 100% 125% of today\'s budget');
            expect(output).toMatch(/mode\s+Gradient/);
            expect(output).toMatch(/gradient\s+traffic/);
            expect(output).toMatch(/ends at\s+100%/);
            expect(output).not.toMatch(/low\s+Green/);
            expect(output).not.toContain('mid from');
            await editor.press(DOWN, LEFT, ENTER);
            expect(editor.savedMetadata()).toEqual({ valueColorMode: 'gradient', valueGradient: 'mono' });
        } finally {
            editor.cleanup();
        }
    });

    it('steps and takes a typed gradient end', async () => {
        const editor = renderEditor(todayGradient);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, LEFT);
            expect(editor.takeOutput()).toMatch(/ends at\s+95%/);
            await editor.press('1', '5', '0', ENTER, ENTER);
            expect(editor.savedMetadata()).toEqual({ valueColorMode: 'gradient', valueGradientEnd: '150' });
        } finally {
            editor.cleanup();
        }
    });

    it.each([
        [2, 'Color Level is 256 Color, so the gradient moves in coarse steps.'],
        [1, 'Color Level is Basic (16 colors), too few for a gradient, so the value keeps the widget color.'],
        [0, 'Color Level is No Color, so the value isn\'t colored.']
    ] as const)('warns about a gradient at color level %d', async (colorLevel, warning) => {
        const editor = renderEditor(todayGradient, TODAY_OPTIONS, { ...DEFAULT_SETTINGS, colorLevel });

        try {
            await editor.ready();
            expect(editor.takeOutput()).toContain(`⚠ ${warning}`);
        } finally {
            editor.cleanup();
        }
    });

    it('has no warning at truecolor, or for break points', async () => {
        const truecolor = renderEditor(todayGradient, TODAY_OPTIONS, { ...DEFAULT_SETTINGS, colorLevel: 3 });
        const breakPoints = renderEditor(today, TODAY_OPTIONS, { ...DEFAULT_SETTINGS, colorLevel: 2 });

        try {
            await truecolor.ready();
            await breakPoints.ready();
            expect(truecolor.takeOutput()).not.toContain('⚠');
            expect(breakPoints.takeOutput()).not.toContain('⚠');
        } finally {
            truecolor.cleanup();
            breakPoints.cleanup();
        }
    });

    it('steps a break point by 5 and updates the sample', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, DOWN, RIGHT);
            expect(editor.takeOutput()).toContain('Sample: 43% 85% 100% 115%');
            await editor.press(ENTER);
            expect(editor.savedMetadata()).toEqual({ valueMidFrom: '85' });
        } finally {
            editor.cleanup();
        }
    });

    it('takes a typed break point', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN, '1');
            expect(editor.takeOutput()).toContain('high above (percent, 1-999): 1');
            await editor.press('2', '0', ENTER, ENTER);
            expect(editor.savedMetadata()).toEqual({ valueHighFrom: '120' });
        } finally {
            editor.cleanup();
        }
    });

    it('says what\'s wrong with a typed break point and lets ESC drop it', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN, '8', '0', ENTER);
            expect(editor.takeOutput()).toContain('High has to start above mid (80%).');
            await editor.press(ESC, ENTER);
            expect(editor.onComplete).toHaveBeenCalledTimes(1);
            expect(editor.savedMetadata()).toBeUndefined();
        } finally {
            editor.cleanup();
        }
    });

    it('cycles a band through the named colors and takes a custom one', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            // Green, then yellow among the named colors
            await editor.press(DOWN, RIGHT, DOWN, DOWN, 'x', 'f', 'f', '8', '8', '0', '0', ENTER, ENTER);
            expect(editor.savedMetadata()).toEqual({ 'valueColor.low': 'yellow', 'valueColor.high': 'hex:ff8800' });
        } finally {
            editor.cleanup();
        }
    });

    // The last row, in both modes: whether the label takes the value's color too
    it('switches between coloring the value only and the whole widget, sampling with the label', async () => {
        const editor = renderEditor({ ...today, rawValue: false }, { ...TODAY_OPTIONS, label: 'Spend Today: ' });

        try {
            await editor.ready();
            let output = editor.takeOutput();
            expect(output).toMatch(/colors\s+Value only/);
            expect(output).toContain('Sample: 40% 80% 100% 120% of today\'s budget');

            // mode, low, mid, high, mid from, high above, then colors
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, RIGHT);
            output = editor.takeOutput();
            expect(output).toMatch(/colors\s+Whole widget/);
            expect(output).toContain('Sample: Spend Today: 40%  Spend Today: 80%  Spend Today: 100%  Spend Today: 120% of today\'s budget');

            await editor.press(ENTER);
            expect(editor.savedMetadata()).toEqual({ valueColorScope: 'widget' });
        } finally {
            editor.cleanup();
        }
    });

    it('offers the colors row in gradient mode, and samples without a label in raw value mode', async () => {
        const editor = renderEditor({ ...todayGradient, metadata: { ...todayGradient.metadata, valueColorScope: 'widget' } }, { ...TODAY_OPTIONS, label: 'Spend Today: ' });

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toMatch(/colors\s+Whole widget/);
            expect(output).toContain('Sample: 25% 50% 75% 100% 125% of today\'s budget');
        } finally {
            editor.cleanup();
        }
    });

    it('restores the defaults with d and keeps the on/off switch', async () => {
        const editor = renderEditor({ ...today, metadata: { valueColors: 'true', valueColorMode: 'gradient', valueMidFrom: '50' } });

        try {
            await editor.ready();
            await editor.press('d', ENTER);
            expect(editor.savedMetadata()).toEqual({ valueColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });
});
