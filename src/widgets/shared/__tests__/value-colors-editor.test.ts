import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';
import {
    makeValueColorsConfig,
    renderValueColorsEditor
} from '../value-colors-editor';

import {
    DOWN,
    ENTER,
    ESC,
    LEFT,
    RIGHT,
    renderWidgetEditor
} from './helpers/widget-editor-harness';

// Rows: mode, low, mid, high, mid from, high above, gradient
const CONFIG = makeValueColorsConfig({
    title: 'Extra Usage Today: value colors',
    scale: { midFrom: 80, highFrom: 100, highEdge: 'above' },
    sampleNote: 'of today\'s budget',
    defaultColor: 'green'
});
const UTILIZATION_CONFIG = makeValueColorsConfig({
    title: 'Extra Usage Utilization: value colors',
    scale: { midFrom: 70, highFrom: 90, highEdge: 'from' },
    sampleNote: 'used',
    defaultColor: 'green',
    maxPercent: 100
});

const today: WidgetItem = { id: 't', type: 'extra-usage-today', rawValue: true };

function renderEditor(widget: WidgetItem, config = CONFIG) {
    const editor = (props: WidgetEditorProps) => renderValueColorsEditor(props, config);
    return renderWidgetEditor(editor, widget);
}

describe('value colors editor', () => {
    it('samples values around the break points and lists every setting', async () => {
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
            expect(output).toMatch(/gradient\s+traffic/);
        } finally {
            editor.cleanup();
        }
    });

    it('labels the high break point by whether it starts the high band', async () => {
        const editor = renderEditor({ ...today, type: 'extra-usage-utilization' }, UTILIZATION_CONFIG);

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

    it('switches to a gradient and cycles its preset both ways', async () => {
        const editor = renderEditor(today);

        try {
            await editor.ready();
            await editor.press(RIGHT);
            expect(editor.takeOutput()).toMatch(/mode\s+Gradient \(truecolor only\)/);
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, LEFT, ENTER);
            expect(editor.savedMetadata()).toEqual({ valueColorMode: 'gradient', valueGradient: 'mono' });
        } finally {
            editor.cleanup();
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
