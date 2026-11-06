import chalk from 'chalk';
import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    getVisibleWidth,
    truncateStyledText
} from '../../utils/ansi';
import {
    START_LINE_COUNTERS,
    advanceLineCounters
} from '../../utils/line-counters';
import {
    getAutoAlignLines,
    getLineRenderItems,
    getLineSettings
} from '../../utils/powerline-lines';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLineWithInfo,
    type PreRenderedWidget,
    type RenderResult
} from '../../utils/renderer';
import { sanitizeTerminalText } from '../../utils/terminal-sanitize';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
}

const renderSingleLine = (
    widgets: WidgetItem[],
    terminalWidth: number,
    settings: Settings,
    lineIndex: number,
    globalSeparatorIndex: number,
    globalPowerlineThemeIndex: number,
    globalPowerlineStartCapIndex: number,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): RenderResult => {
    // Create render context for preview
    const context: RenderContext = {
        terminalWidth,
        isPreview: true,
        minimalist: settings.minimalistMode,
        gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
        customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds,
        lineIndex,
        globalSeparatorIndex,
        globalPowerlineThemeIndex,
        globalPowerlineStartCapIndex
    };

    return renderStatusLineWithInfo(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
};

const PREVIEW_LINE_INDENT = '  ';

export function preparePreviewLineForTerminal(line: string, terminalWidth: number): string {
    // Ink's ANSI tokenizer recognizes BEL-terminated hyperlinks, but not ST.
    // After sanitizing, string terminators can only belong to OSC 8 links.
    const printableLine = sanitizeTerminalText(line).replace(/\x1b\\/g, '\x07');
    const availableWidth = Math.max(0, terminalWidth - getVisibleWidth(PREVIEW_LINE_INDENT));
    return truncateStyledText(printableLine, availableWidth, { ellipsis: true });
}

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings }) => {
    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const renderedLines = React.useMemo(() => {
        if (!settings)
            return [];

        // Always pre-render all widgets once (for efficiency)
        const preRenderedLines = preRenderAllWidgets(lines, settings, {
            terminalWidth,
            isPreview: true,
            minimalist: settings.minimalistMode,
            gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
            customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds
        });
        const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(getAutoAlignLines(settings, preRenderedLines), settings);

        let counters = START_LINE_COUNTERS;
        const result: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const lineItems = lines[i];
            if (lineItems && lineItems.length > 0) {
                const preRenderedWidgets = preRenderedLines[i] ?? [];
                // Each line renders in its own mode, Powerline or plain
                const renderResult = renderSingleLine(
                    getLineRenderItems(settings, i, lineItems),
                    terminalWidth,
                    getLineSettings(settings, i),
                    i,
                    counters.separator,
                    counters.theme,
                    counters.startCap,
                    preRenderedWidgets,
                    preCalculatedMaxWidths
                );
                result.push(renderResult.line);

                counters = advanceLineCounters(counters, settings, i, lineItems, preRenderedWidgets);
            }
        }

        return result;
    }, [lines, terminalWidth, settings]);

    return (
        <Box flexDirection='column'>
            <Box borderStyle='round' borderColor='gray' borderDimColor width='100%' paddingLeft={1}>
                <Text>
                    &gt;
                    <Text dimColor> Preview  (ctrl+s to save configuration at any time)</Text>
                </Text>
            </Box>
            {renderedLines.map((line, index) => (
                <Text key={index} wrap='truncate'>
                    {PREVIEW_LINE_INDENT}
                    {preparePreviewLineForTerminal(line, terminalWidth)}
                    {chalk.reset('')}
                </Text>
            ))}
        </Box>
    );
};
