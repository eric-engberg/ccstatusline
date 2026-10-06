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
    stripOscCodes,
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
    renderStatusLineWithInfo,
    type PreRenderedWidget,
    type RenderResult
} from '../../utils/renderer';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
    /**
     * Pre-rendered widget output per line. Owned by the caller because the color editors
     * need the same output to name the same theme slots, and pre-rendering runs custom
     * commands - doing it here as well would run them twice per keystroke.
     */
    preRenderedLines: PreRenderedWidget[][];
    onTruncationChange?: (isTruncated: boolean) => void;
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
    const printableLine = stripOscCodes(line);
    const availableWidth = Math.max(0, terminalWidth - getVisibleWidth(PREVIEW_LINE_INDENT));
    return truncateStyledText(printableLine, availableWidth, { ellipsis: true });
}

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings, preRenderedLines, onTruncationChange }) => {
    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const { renderedLines, anyTruncated } = React.useMemo(() => {
        if (!settings)
            return { renderedLines: [], anyTruncated: false };

        const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(getAutoAlignLines(settings, preRenderedLines), settings);

        let counters = START_LINE_COUNTERS;
        const result: string[] = [];
        let truncated = false;

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
                if (renderResult.wasTruncated) {
                    truncated = true;
                }

                counters = advanceLineCounters(counters, settings, i, lineItems, preRenderedWidgets);
            }
        }

        return { renderedLines: result, anyTruncated: truncated };
    }, [lines, terminalWidth, settings, preRenderedLines]);

    // Notify parent when truncation status changes
    React.useEffect(() => {
        onTruncationChange?.(anyTruncated);
    }, [anyTruncated, onTruncationChange]);

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
