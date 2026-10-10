import { execSync } from 'node:child_process';
import os from 'node:os';
import type React from 'react';

import type { NumberFormat } from '../types/NumberFormat';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    renderMagnitude,
    resolveNumberFormat
} from '../utils/number-format';

import { makeModifierText } from './shared/editor-display';
import {
    LIMIT_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './shared/value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor,
    type ValueColorsEditorOptions
} from './shared/value-colors-editor';

const LABEL = 'Mem: ';
const DEFAULT_COLOR = 'cyan';
const VALUE_COLORS_EDITOR: ValueColorsEditorOptions = {
    title: 'Memory Usage: value colors',
    scale: LIMIT_SCALE,
    sampleNote: 'of memory used',
    defaultColor: DEFAULT_COLOR,
    maxPercent: 100,
    label: LABEL
};

function formatBytes(bytes: number, format: NumberFormat): string {
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    const KB = 1024;

    if (bytes >= GB)
        return `${renderMagnitude(bytes / GB, format, 1)}G`;
    if (bytes >= MB)
        return `${renderMagnitude(bytes / MB, format, 0)}M`;
    if (bytes >= KB)
        return `${renderMagnitude(bytes / KB, format, 0)}K`;
    return `${bytes}B`;
}

// Get memory usage like htop does on macOS (Active + Wired)
function getUsedMemoryMacOS(): number | null {
    try {
        const output = execSync('vm_stat', { encoding: 'utf8', windowsHide: true });
        const lines = output.split('\n');

        // Parse page size from first line: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
        const firstLine = lines[0];
        if (!firstLine)
            return null;

        const pageSizeMatch = /page size of (\d+) bytes/.exec(firstLine);
        const pageSizeString = pageSizeMatch?.[1];
        if (!pageSizeString)
            return null;
        const pageSize = Number.parseInt(pageSizeString, 10);

        // Parse page counts
        let activePages = 0;
        let wiredPages = 0;

        for (const line of lines) {
            const activeMatch = /Pages active:\s+(\d+)/.exec(line);
            const activeValue = activeMatch?.[1];
            if (activeValue)
                activePages = Number.parseInt(activeValue, 10);
            const wiredMatch = /Pages wired down:\s+(\d+)/.exec(line);
            const wiredValue = wiredMatch?.[1];
            if (wiredValue)
                wiredPages = Number.parseInt(wiredValue, 10);
        }

        return (activePages + wiredPages) * pageSize;
    } catch {
        return null;
    }
}

export class FreeMemoryWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows system memory usage (used/total)'; }
    getDisplayName(): string { return 'Memory Usage'; }
    getCategory(): string { return 'Environment'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const valueColors = getValueColorsModifier(item);
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(valueColors ? [valueColors] : []) };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [VALUE_COLORS_KEYBIND];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, VALUE_COLORS_EDITOR);
    }

    // Value colors paint only the value (or the whole text), so the renderer
    // colors the rest with the theme or widget color
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    // Value colors measure the share of memory used
    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('memory', item, settings);
        const formatOptions = getValueFormatOptions(settings);
        if (context.isPreview) {
            const value = `${formatBytes(12.4 * 1024 ** 3, format)}/${formatBytes(16 * 1024 ** 3, format)}`;
            return formatColoredValue(item, this.getLabelPrefix(), value, 12.4 / 16 * 100, LIMIT_SCALE, formatOptions);
        }

        const total = os.totalmem();
        let used: number;

        if (os.platform() === 'darwin') {
            // Use htop-style calculation on macOS
            used = getUsedMemoryMacOS() ?? (total - os.freemem());
        } else {
            // Fallback for other platforms
            used = total - os.freemem();
        }

        const value = `${formatBytes(used, format)}/${formatBytes(total, format)}`;
        return formatColoredValue(item, this.getLabelPrefix(), value, total > 0 ? used / total * 100 : null, LIMIT_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
