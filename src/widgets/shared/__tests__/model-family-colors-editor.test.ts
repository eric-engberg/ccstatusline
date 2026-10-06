import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import { ModelFamilyColorsEditor } from '../model-family-colors-editor';

import {
    DOWN,
    ENTER,
    ESC,
    RIGHT,
    renderWidgetEditor
} from './helpers/widget-editor-harness';

const rawModel: WidgetItem = { id: 'm', type: 'model', rawValue: true };

function renderEditor(widget: WidgetItem) {
    return renderWidgetEditor(ModelFamilyColorsEditor, widget);
}

describe('ModelFamilyColorsEditor', () => {
    it('samples the highlighted family and follows the cursor', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            const first = editor.takeOutput();
            expect(first).toContain('Model: family colors');
            expect(first).toContain('Sample: Opus');

            await editor.press(DOWN);
            expect(editor.takeOutput()).toContain('Sample: Sonnet');
        } finally {
            editor.cleanup();
        }
    });

    it('lists every family with its color', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toMatch(/opus\s+Magenta/);
            expect(output).toMatch(/sonnet\s+Cyan/);
            expect(output).toMatch(/haiku\s+Green/);
            expect(output).toMatch(/fable\s+Red/);
        } finally {
            editor.cleanup();
        }
    });

    it('turns family colors on with Space and saves on Enter', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            await editor.press(' ', ENTER);
            expect(editor.savedMetadata()).toEqual({ familyColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });

    it('cycles the highlighted family through the named colors', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            // Opus defaults to magenta; the named colors run ... blue, magenta, cyan ...
            await editor.press(RIGHT, ENTER);
            expect(editor.savedMetadata()?.['familyColor.opus']).toBe('cyan');
        } finally {
            editor.cleanup();
        }
    });

    it('takes a custom color with x', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, 'x', 'f', 'f', '8', '8', '0', '0', ENTER, ENTER);
            expect(editor.savedMetadata()?.['familyColor.fable']).toBe('hex:ff8800');
        } finally {
            editor.cleanup();
        }
    });

    it('restores the default colors with d and keeps the on/off switch', async () => {
        const editor = renderEditor({ ...rawModel, metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff8800' } });

        try {
            await editor.ready();
            await editor.press('d', ENTER);
            expect(editor.savedMetadata()).toEqual({ familyColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });

    it('cancels with ESC without saving', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            await editor.press(' ', ESC);
            expect(editor.onCancel).toHaveBeenCalledTimes(1);
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.cleanup();
        }
    });
});
