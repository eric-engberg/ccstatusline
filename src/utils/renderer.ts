import chalk from 'chalk';

import type {
    RenderContext,
    Widget,
    WidgetItem
} from '../types';
import {
    getColorLevelString,
    type ColorLevel
} from '../types/ColorLevel';
import type {
    DefaultPaddingSide,
    Settings
} from '../types/Settings';
import {
    EDIT_BAR_WIDTH_ACTION,
    MIN_BAR_CELLS,
    allocateBarCells,
    getDesiredBarCells,
    getLineBarWidth
} from '../widgets/shared/bar-width';
import {
    MERGE_TARGET_HIDDEN_HIDEABLE_STATE,
    isHidden
} from '../widgets/shared/hideable';

import {
    applyLineGradient,
    applyLineGradientSegment,
    getVisibleText,
    getVisibleWidth,
    stripSgrCodes,
    truncateStyledText
} from './ansi';
import {
    applyColors,
    applyParensDim,
    bgToFg,
    getColorAnsiCode,
    getPowerlineTheme,
    restoreForegroundAfterRuns
} from './colors';
import { calculateContextPercentage } from './context-percentage';
import {
    isGradientSpec,
    parseGradientSpec
} from './gradient';
import { getTerminalWidth } from './terminal';
import {
    getWidget,
    widgetColorsOnlyItsRuns,
    widgetPreservesColors
} from './widgets';

export { formatTokens } from './format-tokens';

// Build a red warning badge indicating that settings.json could not be loaded.
// Passes colorLevel through so color is suppressed when the terminal has no color support.
export function buildConfigWarningBadge(colorLevel: ColorLevel): string {
    return applyColors('⚠ invalid config', 'red', undefined, false, getColorLevelString(colorLevel));
}

// Paint a foreground gradient across a finished line when overrideForegroundColor
// is a gradient spec (e.g. "gradient:hex:FF0000,hex:0000FF"); a no-op otherwise.
// Applied as the final step, after truncation, so the trailing reset is not sliced
// off (see the call site for why ordering matters).
function maybeApplyForegroundGradient(
    line: string,
    settings: Settings,
    colorLevel: 'ansi16' | 'ansi256' | 'truecolor'
): string {
    const stops = parseGradientSpec(settings.overrideForegroundColor);
    return stops ? applyLineGradient(line, stops, colorLevel) : line;
}

function hasForegroundOverride(settings: Settings): boolean {
    return Boolean(settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none');
}

// A global foreground override owns the foreground even for widgets that
// normally carry intrinsic ANSI colors. Other styling (bold, dim, background)
// remains independent of foreground preservation.
function preservesIntrinsicForeground(item: WidgetItem, settings: Settings): boolean {
    return widgetPreservesColors(item) && !hasForegroundOverride(settings);
}

// Whether the item's text carries foreground codes of its own, for all of it
// or only some runs; a global foreground override strips them
function embedsForegroundCodes(item: WidgetItem): boolean {
    return widgetPreservesColors(item) || widgetColorsOnlyItsRuns(item);
}

// Split the default padding string into the leading/trailing pieces that
// actually get applied, based on which side(s) padding is configured for.
function resolvePaddingSides(padding: string, side: DefaultPaddingSide | undefined): { leading: string; trailing: string } {
    if (side === 'left')
        return { leading: padding, trailing: '' };
    if (side === 'right')
        return { leading: '', trailing: padding };
    return { leading: padding, trailing: padding };
}

function resolveEffectiveTerminalWidth(
    detectedWidth: number | null,
    settings: Settings,
    context: RenderContext
): number | null {
    if (!detectedWidth) {
        return null;
    }

    const flexMode = settings.flexMode as string;

    if (context.isPreview) {
        if (flexMode === 'full') {
            return detectedWidth - 6;
        }
        if (flexMode === 'full-minus-40') {
            return detectedWidth - 40;
        }
        if (flexMode === 'full-until-compact') {
            return detectedWidth - 6;
        }
        return null;
    }

    if (flexMode === 'full') {
        return detectedWidth - 6;
    }
    if (flexMode === 'full-minus-40') {
        return detectedWidth - 40;
    }
    if (flexMode === 'full-until-compact') {
        const threshold = settings.compactThreshold;
        const contextPercentage = calculateContextPercentage(context);
        return contextPercentage >= threshold
            ? detectedWidth - 40
            : detectedWidth - 6;
    }

    return null;
}

function renderPowerlineStatusLine(
    widgets: WidgetItem[],
    settings: Settings,
    context: RenderContext,
    lineIndex = 0,  // Which line we're rendering (for theme color cycling)
    globalSeparatorOffset = 0,  // Starting separator index for this line
    globalThemeColorOffset = 0,  // Starting theme color index for this line
    preRenderedWidgets: PreRenderedWidget[],  // Pre-rendered widgets for this line
    preCalculatedMaxWidths: number[]  // Pre-calculated max widths for alignment
): string {
    const powerlineConfig = settings.powerline as Record<string, unknown> | undefined;
    const config = powerlineConfig ?? {};
    const continueThemeAcrossLines = Boolean(config.continueThemeAcrossLines);

    // Get separator configuration
    const separators = (config.separators as string[] | undefined) ?? ['\uE0B0'];
    const invertBgs = (config.separatorInvertBackground as boolean[] | undefined) ?? separators.map(() => false);

    // Get caps arrays or fallback to empty arrays
    const startCaps = (config.startCaps as string[] | undefined) ?? [];
    const endCaps = (config.endCaps as string[] | undefined) ?? [];

    // Get the cap for this line (cycle through if more lines than caps)
    const capLineIndex = context.lineIndex ?? lineIndex;
    const startCapIndex = context.globalPowerlineStartCapIndex ?? capLineIndex;
    const getStartCap = (segmentOffset: number): string => (
        startCaps.length > 0 ? (startCaps[(startCapIndex + segmentOffset) % startCaps.length] ?? '') : ''
    );
    const getEndCap = (segmentOffset: number): string => (
        endCaps.length > 0 ? (endCaps[(startCapIndex + segmentOffset) % endCaps.length] ?? '') : ''
    );

    // Get theme colors if a theme is set and not 'custom'
    const themeName = config.theme as string | undefined;
    let themeColors: { fg: string[]; bg: string[] } | undefined;

    if (themeName && themeName !== 'custom') {
        const theme = getPowerlineTheme(themeName);
        if (theme) {
            const colorLevel = getColorLevelString(settings.colorLevel);
            const colorLevelKey = colorLevel === 'ansi16' ? '1' : colorLevel === 'ansi256' ? '2' : '3';
            themeColors = theme[colorLevelKey];
        }
    }

    // Get color level from settings
    const colorLevel = getColorLevelString(settings.colorLevel);
    const overrideForegroundGradientStops = parseGradientSpec(settings.overrideForegroundColor);
    const isSeparatorBoundary = (widget: WidgetItem | undefined): boolean => (
        widget?.type === 'separator' || widget?.type === 'flex-separator'
    );

    // Filter out separator and flex-separator widgets in powerline mode
    const filteredWidgets = widgets.filter(widget => widget.type !== 'separator' && widget.type !== 'flex-separator'
    );

    // Sentinel inserted into the rendered string at each flex position. The
    // SOH control char is essentially never present in real widget
    // content, so a plain split works for the post-render pass.
    const FLEX_SENTINEL = '\x01FLEX_SEP\x01';

    if (filteredWidgets.length === 0)
        return '';

    const detectedWidth = context.terminalWidth ?? getTerminalWidth();

    // Calculate terminal width based on flex mode settings
    const terminalWidth = resolveEffectiveTerminalWidth(detectedWidth, settings, context);

    // Build widget elements (similar to regular mode but without separators)
    const widgetElements: {
        content: string;
        bgColor?: string;
        fgColor?: string;
        mergesWithNext: boolean;
        originalIndex: number;
        widget: WidgetItem;
    }[] = [];
    let widgetColorIndex = continueThemeAcrossLines ? globalThemeColorOffset : 0;

    // A merge reaches the next widget that renders something. It carries past an
    // empty widget only if that widget is merged onward too; otherwise the merge
    // ends with it, as if the empty widget were the one it joined.
    const mergeReachesNextRenderedWidget = (originalIndex: number): boolean => {
        for (let j = originalIndex + 1; j < widgets.length; j++) {
            const nextWidget = widgets[j];
            if (!nextWidget)
                continue;
            if (isSeparatorBoundary(nextWidget))
                return false;
            if (preRenderedWidgets[j]?.content)
                return true;
            if (!nextWidget.merge)
                return false;
        }

        return false;
    };

    const canMergeWithNextRenderedWidget = (originalIndex: number | undefined): boolean => {
        if (originalIndex === undefined)
            return false;

        const widget = widgets[originalIndex];
        return Boolean(widget?.merge && mergeReachesNextRenderedWidget(originalIndex));
    };

    const findPreviousRenderedWidgetIndexBeforeSeparator = (originalIndex: number): number | null => {
        for (let j = originalIndex - 1; j >= 0; j--) {
            const previousWidget = widgets[j];
            if (!previousWidget)
                continue;
            if (isSeparatorBoundary(previousWidget))
                return null;
            if (preRenderedWidgets[j]?.content)
                return j;
        }

        return null;
    };

    // Create a mapping from filteredWidgets to preRenderedWidgets indices
    // This is needed because filteredWidgets excludes separators but preRenderedWidgets includes all widgets
    const preRenderedIndices: number[] = [];
    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (widget && widget.type !== 'separator' && widget.type !== 'flex-separator') {
            preRenderedIndices.push(i);
        }
    }

    for (let i = 0; i < filteredWidgets.length; i++) {
        const widget = filteredWidgets[i];
        if (!widget)
            continue;
        let widgetText = '';
        let defaultColor = 'white';

        // Handle separators specially (they're not widgets)
        if (widget.type === 'separator' || widget.type === 'flex-separator') {
            // These are filtered out in powerline mode
            continue;
        }

        // Use pre-rendered content - use the correct index from the mapping
        const actualPreRenderedIndex = preRenderedIndices[i];
        const preRendered = actualPreRenderedIndex !== undefined ? preRenderedWidgets[actualPreRenderedIndex] : undefined;
        const widgetImpl = getWidget(widget.type);
        if (preRendered?.content) {
            widgetText = preRendered.content;
            // Get default color from widget impl for consistency
            if (widgetImpl) {
                defaultColor = widgetImpl.getDefaultColor();
            }
        }

        if (widgetText) {
            // Apply default padding from settings
            const padding = settings.defaultPadding ?? '';
            const { leading: sideLeadingPadding, trailing: sideTrailingPadding } = resolvePaddingSides(padding, settings.defaultPaddingSide);

            // If override FG color is set and this widget carries its own colors,
            // we need to strip the ANSI codes from the widget text
            if (hasForegroundOverride(settings) && embedsForegroundCodes(widget)) {
                // Strip ANSI color codes when override is active
                widgetText = stripSgrCodes(widgetText);
            }

            // Check if padding should be omitted due to no-padding merge
            const previousRenderedIndex = actualPreRenderedIndex !== undefined
                ? findPreviousRenderedWidgetIndexBeforeSeparator(actualPreRenderedIndex)
                : null;
            const previousRenderedWidget = previousRenderedIndex !== null
                ? widgets[previousRenderedIndex]
                : undefined;
            const mergesWithNext = canMergeWithNextRenderedWidget(actualPreRenderedIndex);
            const omitLeadingPadding = previousRenderedWidget?.merge === 'no-padding'
                && canMergeWithNextRenderedWidget(previousRenderedIndex ?? undefined);
            const omitTrailingPadding = widget.merge === 'no-padding' && mergesWithNext;

            const leadingPadding = omitLeadingPadding ? '' : sideLeadingPadding;
            const trailingPadding = omitTrailingPadding ? '' : sideTrailingPadding;
            const paddedText = `${leadingPadding}${widgetText}${trailingPadding}`;

            // Determine colors
            let fgColor = widget.color ?? defaultColor;
            let bgColor = widget.backgroundColor;

            // Apply theme colors if a theme is set (and not 'custom')
            // For widgets that preserve their own colors, only skip foreground theme colors
            const skipFgTheme = preservesIntrinsicForeground(widget, settings);

            if (themeColors) {
                if (!skipFgTheme) {
                    fgColor = themeColors.fg[widgetColorIndex % themeColors.fg.length] ?? fgColor;
                }
                bgColor = themeColors.bg[widgetColorIndex % themeColors.bg.length] ?? bgColor;

                // Only increment color index if this widget is not merged with the next one
                // This ensures merged widgets share the same color
                if (!mergesWithNext) {
                    widgetColorIndex++;
                }
            }

            // Apply solid override FG color if set (overrides theme). Gradient
            // overrides are applied to widget text during rendering below so
            // powerline separators keep their foreground/background contrast.
            if (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none'
                && !isGradientSpec(settings.overrideForegroundColor)) {
                fgColor = settings.overrideForegroundColor;
            }

            widgetElements.push({
                content: paddedText,
                bgColor: bgColor ?? undefined,  // Make sure undefined, not empty string
                fgColor: fgColor,
                mergesWithNext,
                originalIndex: actualPreRenderedIndex ?? -1,
                widget: widget
            });
        }
    }

    if (widgetElements.length === 0)
        return '';

    const renderedElementIndexByOriginalIndex = new Map<number, number>();
    widgetElements.forEach((element, index) => {
        renderedElementIndexByOriginalIndex.set(element.originalIndex, index);
    });

    // Track flex-separators against rendered widget positions. Some widgets
    // intentionally render empty and are omitted from widgetElements, so using
    // filtered config indices would move flex slots to the wrong visible side.
    const flexAfterIndex = new Map<number, number>();
    const startCapBeforeIndex = new Map<number, number>();
    const segmentOffsetByRenderedIndex = new Map<number, number>();
    let leadingFlexCount = 0;
    let totalFlexCount = 0;
    let lastRenderedIndex: number | null = null;
    let pendingFlexCount = 0;
    let segmentOffset = 0;
    let hasRenderedSegment = false;
    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (!widget || widget.type === 'separator')
            continue;

        if (widget.type === 'flex-separator') {
            totalFlexCount++;
            if (lastRenderedIndex === null) {
                leadingFlexCount++;
            } else {
                pendingFlexCount++;
                flexAfterIndex.set(lastRenderedIndex, (flexAfterIndex.get(lastRenderedIndex) ?? 0) + 1);
            }
            continue;
        }

        const renderedIndex = renderedElementIndexByOriginalIndex.get(i);
        if (renderedIndex !== undefined) {
            if (!hasRenderedSegment) {
                startCapBeforeIndex.set(renderedIndex, segmentOffset);
                pendingFlexCount = 0;
                hasRenderedSegment = true;
            } else if (pendingFlexCount > 0) {
                segmentOffset++;
                startCapBeforeIndex.set(renderedIndex, segmentOffset);
                pendingFlexCount = 0;
            }
            segmentOffsetByRenderedIndex.set(renderedIndex, segmentOffset);
            lastRenderedIndex = renderedIndex;
        }
    }

    // Apply auto-alignment if enabled
    const autoAlign = config.autoAlign as boolean | undefined;
    if (autoAlign) {
        // Apply padding to current line's widgets based on pre-calculated max widths
        let alignmentPos = 0;
        for (let i = 0; i < widgetElements.length; i++) {
            const element = widgetElements[i];
            if (!element)
                continue;

            // An excluded widget, and everything after it on this line, keeps its
            // natural width (mirrors the skip in calculateMaxWidthsFromPreRendered).
            if (element.widget.excludeFromAutoAlign)
                break;

            // Check if previous widget was merged with this one
            const prevWidget = i > 0 ? widgetElements[i - 1] : null;
            const isPreviousMerged = prevWidget?.mergesWithNext;

            // Only apply alignment to non-merged widgets (widgets that follow a merge are excluded)
            if (!isPreviousMerged) {
                const maxWidth = preCalculatedMaxWidths[alignmentPos];
                if (maxWidth !== undefined) {
                    // Calculate combined width if this widget merges with following ones
                    let combinedLength = getVisibleWidth(element.content);
                    let j = i;
                    while (j < widgetElements.length - 1 && widgetElements[j]?.mergesWithNext) {
                        j++;
                        const nextElement = widgetElements[j];
                        if (nextElement) {
                            combinedLength += getVisibleWidth(nextElement.content);
                        }
                    }

                    const paddingNeeded = maxWidth - combinedLength;
                    if (paddingNeeded > 0) {
                        // Add padding to the last widget in the merge group
                        const lastElement = widgetElements[j];
                        if (lastElement) {
                            lastElement.content += ' '.repeat(paddingNeeded);
                        }
                    }

                    // Skip over merged widgets
                    i = j;
                }
                alignmentPos++;
            }
        }
    }

    const powerlineGradientWidth = overrideForegroundGradientStops && colorLevel !== 'ansi16'
        ? widgetElements.reduce((sum, element) => {
            const isPreserveColors = preservesIntrinsicForeground(element.widget, settings);
            return isPreserveColors ? sum : sum + getVisibleWidth(element.content);
        }, 0)
        : 0;
    let powerlineGradientColumn = 0;

    // Build the final powerline string
    let result = '';

    if (leadingFlexCount > 0) {
        result += FLEX_SENTINEL.repeat(leadingFlexCount);
    }

    // Render widgets with powerline separators
    let localSeparatorIndex = 0;
    for (let i = 0; i < widgetElements.length; i++) {
        const widget = widgetElements[i];
        const nextWidget = widgetElements[i + 1];

        if (!widget)
            continue;

        // Apply colors to widget content using raw ANSI codes for powerline mode
        // This avoids reset codes that interfere with separator rendering
        const shouldBold = (settings.globalBold) || widget.widget.bold;
        const shouldDim = widget.widget.dim === true;

        // Check if we need a separator after this widget
        const needsSeparator = i < widgetElements.length - 1 && separators.length > 0 && nextWidget !== undefined && !widget.mergesWithNext;
        const flexCountAfter = flexAfterIndex.get(i) ?? 0;
        const currentSegmentOffset = segmentOffsetByRenderedIndex.get(i) ?? 0;
        const isLastWidget = i === widgetElements.length - 1;
        const hasEndCapAfterWidget = Boolean(getEndCap(currentSegmentOffset)) && (flexCountAfter > 0 || isLastWidget);

        const startCapSegmentOffset = startCapBeforeIndex.get(i);
        if (startCapSegmentOffset !== undefined) {
            const segmentStartCap = getStartCap(startCapSegmentOffset);
            if (segmentStartCap) {
                if (widget.bgColor) {
                    // Start cap uses this segment's first widget background as foreground.
                    const capFg = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(capFg, colorLevel, false);
                    result += fgCode + segmentStartCap + '\x1b[39m';
                } else {
                    result += segmentStartCap;
                }
            }
        }

        let widgetContent = '';

        // Intrinsic colors replace only the renderer's foreground. Global/item
        // intensity and Powerline backgrounds still apply around that content.
        const isPreserveColors = preservesIntrinsicForeground(widget.widget, settings);

        if (shouldBold) {
            widgetContent += '\x1b[1m';
        }
        if (shouldDim) {
            widgetContent += '\x1b[2m';
        }
        const textGradientStops = !isPreserveColors && powerlineGradientWidth > 1
            ? overrideForegroundGradientStops
            : null;
        const styledContent = widget.widget.dim === 'parens'
            ? applyParensDim(widget.content, shouldBold)
            : widget.content;

        const fgCode = widget.fgColor && !isPreserveColors && !textGradientStops
            ? getColorAnsiCode(widget.fgColor, colorLevel, false)
            : '';
        widgetContent += fgCode;
        // Always apply background for consistency in powerline mode
        if (widget.bgColor) {
            widgetContent += getColorAnsiCode(widget.bgColor, colorLevel, true);
        }
        if (textGradientStops) {
            const gradientResult = applyLineGradientSegment(
                styledContent,
                textGradientStops,
                colorLevel,
                powerlineGradientColumn,
                powerlineGradientWidth
            );
            widgetContent += gradientResult.text;
            powerlineGradientColumn = gradientResult.nextColumn;
        } else if (fgCode && widgetColorsOnlyItsRuns(widget.widget)) {
            widgetContent += restoreForegroundAfterRuns(styledContent, fgCode);
        } else {
            widgetContent += fgCode ? restoreForegroundAfterRuns(styledContent, fgCode) : styledContent;
        }
        // Reset colors after content
        // For custom commands with preserveColors, also reset text attributes like dim
        if (isPreserveColors) {
            // Full reset to clear any attributes from command (including dim from Claude Code)
            widgetContent += '\x1b[0m';
        } else {
            widgetContent += '\x1b[49m\x1b[39m';
            // Dim should be scoped to the widget text only. Reset before
            // separators/end caps so faint intensity cannot leak forward.
            const shouldRestoreBoldForBoundary = shouldDim && shouldBold && (needsSeparator || hasEndCapAfterWidget);
            if (shouldRestoreBoldForBoundary) {
                widgetContent += '\x1b[22;1m';
            } else if (shouldDim || (shouldBold && !needsSeparator && !hasEndCapAfterWidget)) {
                widgetContent += '\x1b[22m';
            }
        }

        result += widgetContent;

        // If a flex-separator originally sat between widget i and i+1, emit
        // the current segment's end cap followed by a FLEX_SENTINEL. The
        // post-render pass replaces the sentinel with the correct number of
        // spaces. The regular between-widgets separator is suppressed since
        // the flex space separates powerline segments rather than adjacent
        // widgets inside a segment.
        if (flexCountAfter > 0) {
            const segmentEndCap = getEndCap(currentSegmentOffset);
            if (segmentEndCap) {
                if (widget.bgColor) {
                    const capFg = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(capFg, colorLevel, false);
                    result += fgCode + segmentEndCap + '\x1b[39m';
                } else {
                    result += segmentEndCap;
                }
            }
            if (shouldBold) {
                result += '\x1b[22m';
            }
            result += FLEX_SENTINEL.repeat(flexCountAfter);
            continue;
        }

        // Add separator between widgets (not after last one, and not if current widget is merged with next)
        if (needsSeparator) {
            // Determine which separator to use based on global position
            // Use separators in order, cycling across rendered separator slots.
            const globalIndex = globalSeparatorOffset + localSeparatorIndex;
            const separatorIndex = globalIndex % separators.length;
            const separator = separators[separatorIndex] ?? '\uE0B0';
            const shouldInvert = invertBgs[separatorIndex] ?? false;

            // Powerline separator coloring:
            // Normal (not inverted):
            //   - Foreground: previous widget's background color (converted to fg)
            //   - Background: next widget's background color
            // Inverted:
            //   - Foreground: next widget's background color (converted to fg)
            //   - Background: previous widget's background color

            // Build separator with raw ANSI codes to avoid reset issues
            let separatorOutput: string;

            // Check if adjacent widgets have the same background color
            const sameBackground = widget.bgColor && nextWidget.bgColor && widget.bgColor === nextWidget.bgColor;

            if (shouldInvert) {
                // Inverted: swap fg/bg logic
                if (widget.bgColor && nextWidget.bgColor) {
                    if (sameBackground) {
                        // Same background: use next widget's foreground color
                        const fgColor = nextWidget.fgColor;
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(widget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    } else {
                        // Different backgrounds: use standard inverted logic
                        const fgColor = bgToFg(nextWidget.bgColor);
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(widget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    }
                } else if (widget.bgColor && !nextWidget.bgColor) {
                    const fgColor = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else if (!widget.bgColor && nextWidget.bgColor) {
                    const fgColor = bgToFg(nextWidget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else {
                    separatorOutput = separator;
                }
            } else {
                // Normal (not inverted)
                if (widget.bgColor && nextWidget.bgColor) {
                    if (sameBackground) {
                        // Same background: use previous widget's foreground color
                        const fgColor = widget.fgColor;
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(nextWidget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    } else {
                        // Different backgrounds: use standard logic
                        const fgColor = bgToFg(widget.bgColor);
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(nextWidget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    }
                } else if (widget.bgColor && !nextWidget.bgColor) {
                    // Only previous widget has background
                    const fgColor = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else if (!widget.bgColor && nextWidget.bgColor) {
                    // Only next widget has background
                    const fgColor = bgToFg(nextWidget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else {
                    // Neither has background
                    separatorOutput = separator;
                }
            }

            result += separatorOutput;

            // Reset bold/dim after separator if either was set
            if (shouldBold || shouldDim) {
                result += '\x1b[22m';
            }
            localSeparatorIndex++;
        }
    }

    // Add end cap if specified
    if (widgetElements.length > 0) {
        const lastWidgetIndex = widgetElements.length - 1;
        const lastWidget = widgetElements[lastWidgetIndex];
        const lastWidgetBold = (settings.globalBold) || lastWidget?.widget.bold;
        const lastWidgetDim = lastWidget?.widget.dim === true;
        const lastSegmentOffset = segmentOffsetByRenderedIndex.get(lastWidgetIndex) ?? 0;
        const lastWidgetHasFlexAfter = (flexAfterIndex.get(lastWidgetIndex) ?? 0) > 0;
        const segmentEndCap = getEndCap(lastSegmentOffset);

        if (segmentEndCap && !lastWidgetHasFlexAfter) {
            if (lastWidget?.bgColor) {
                // End cap uses last widget's background as foreground (converted)
                const capFg = bgToFg(lastWidget.bgColor);
                const fgCode = getColorAnsiCode(capFg, colorLevel, false);
                result += fgCode + segmentEndCap + '\x1b[39m';
            } else {
                result += segmentEndCap;
            }

            // Reset bold/dim after end cap if needed
            if (lastWidgetBold || lastWidgetDim) {
                result += '\x1b[22m';
            }
        }
    }

    // If any flex-separators were configured, replace each FLEX_SENTINEL with
    // the appropriate number of spaces so the rendered line expands to fill
    // the terminal width. End caps are already present here so their width is
    // reserved before flex space is distributed.
    if (totalFlexCount > 0) {
        if (terminalWidth && terminalWidth > 0) {
            const parts = result.split(FLEX_SENTINEL);
            const totalContentWidth = parts.reduce((sum, p) => sum + getVisibleWidth(p), 0);
            const flexCount = parts.length - 1;
            const totalSpace = Math.max(0, terminalWidth - totalContentWidth);
            const spacePerFlex = flexCount > 0 ? Math.floor(totalSpace / flexCount) : 0;
            const extraSpace = flexCount > 0 ? totalSpace % flexCount : 0;
            let newResult = parts[0] ?? '';
            for (let i = 1; i < parts.length; i++) {
                const flexSize = spacePerFlex + (i - 1 < extraSpace ? 1 : 0);
                newResult += ' '.repeat(flexSize) + (parts[i] ?? '');
            }
            result = newResult;
        } else {
            // No terminal width detected - keep a visible break between segments.
            result = result.split(FLEX_SENTINEL).join(' ');
        }
    }

    // Reset colors at the end
    result += chalk.reset('');

    // Handle truncation if terminal width is known
    if (terminalWidth && terminalWidth > 0) {
        const plainLength = getVisibleWidth(result);
        if (plainLength > terminalWidth) {
            result = truncateStyledText(result, terminalWidth, { ellipsis: true });
        }
    }

    return result;
}

// Format separator with appropriate spacing
function formatSeparator(sep: string): string {
    if (sep === '|') {
        return ' | ';
    } else if (sep === ' ') {
        return ' ';
    } else if (sep === ',') {
        return ', ';
    } else if (sep === '-') {
        return ' - ';
    }
    return sep;
}

function isSpacingSeparator(widget: WidgetItem | undefined, defaultSeparator: string | undefined): boolean {
    return widget?.type === 'separator'
        && (widget.character ?? defaultSeparator ?? '|').trim().length === 0;
}

export interface RenderResult {
    line: string;
    wasTruncated: boolean;
}

export interface PreRenderedWidget {
    content: string;      // The rendered widget text (without padding)
    plainLength: number;  // Length without ANSI codes
    widget: WidgetItem;   // Original widget config
    // The width auto-align uses, when it differs from plainLength: a bar sized to
    // its line counts at its minimum, so it doesn't widen other lines' columns
    alignmentWidth?: number;
}

export function countPowerlineStartCapSlots(
    widgets: WidgetItem[],
    preRenderedWidgets: PreRenderedWidget[]
): number {
    let pendingFlexAfterRenderedSegment = false;
    let hasRenderedSegment = false;
    let renderedSegmentCount = 0;

    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (!widget || widget.type === 'separator')
            continue;

        if (widget.type === 'flex-separator') {
            if (hasRenderedSegment) {
                pendingFlexAfterRenderedSegment = true;
            }
            continue;
        }

        if (!preRenderedWidgets[i]?.content)
            continue;

        if (!hasRenderedSegment) {
            hasRenderedSegment = true;
            renderedSegmentCount = 1;
        } else if (pendingFlexAfterRenderedSegment) {
            renderedSegmentCount++;
            pendingFlexAfterRenderedSegment = false;
        }
    }

    return renderedSegmentCount;
}

// Decorative widget types that can opt into hiding alongside their merge target
const DECORATIVE_WIDGET_TYPES = new Set(['custom-text', 'custom-symbol']);

function isSeparatorType(type: string): boolean {
    return type === 'separator' || type === 'flex-separator';
}

// Collapses decorative items (custom-text/custom-symbol) that opted into the
// merge-target-hidden state when the widget they are merged with rendered
// nothing, so merged chains hide as a unit instead of leaving orphaned icons.
export function applyMergeTargetHiding(preRenderedLine: PreRenderedWidget[]): void {
    let chainStart = 0;
    for (let i = 0; i <= preRenderedLine.length; i++) {
        const element = preRenderedLine[i];
        if (element && !isSeparatorType(element.widget.type)) {
            continue;
        }

        applyMergeTargetHidingToSegment(preRenderedLine.slice(chainStart, i));
        chainStart = i + 1;
    }
}

function applyMergeTargetHidingToSegment(segment: PreRenderedWidget[]): void {
    let chainStart = 0;
    for (let i = 0; i < segment.length; i++) {
        const linksToNext = Boolean(segment[i]?.widget.merge) && i < segment.length - 1;
        if (linksToNext) {
            continue;
        }

        const chain = segment.slice(chainStart, i + 1);
        chainStart = i + 1;
        if (chain.length < 2) {
            continue;
        }

        for (let position = 0; position < chain.length; position++) {
            const element = chain[position];
            if (!element
                || !DECORATIVE_WIDGET_TYPES.has(element.widget.type)
                || !isHidden(element.widget, MERGE_TARGET_HIDDEN_HIDEABLE_STATE.key)) {
                continue;
            }

            // The target is the nearest non-decorative widget in the chain,
            // preferring the merge direction (forward), falling back to the
            // widget merging into this one (backward)
            const target = chain.slice(position + 1).find(candidate => !DECORATIVE_WIDGET_TYPES.has(candidate.widget.type))
                ?? chain.slice(0, position).reverse().find(candidate => !DECORATIVE_WIDGET_TYPES.has(candidate.widget.type));

            if (target?.content === '') {
                element.content = '';
                element.plainLength = 0;
            }
        }
    }
}

// A bar with a width setting, which preRenderAllWidgets sizes to its line
interface SizedBar {
    index: number;  // Position in the pre-rendered line
    width: number | 'fill';
    widgetImpl: Widget;
    item: WidgetItem;  // As rendered, minimalist override included
}

// The widget's bar to size to its line: one it shows now, with a width setting,
// on a line whose width is known. Widgets offer (b) only while they show a bar,
// so a width kept from a bar mode is ignored in their other modes.
function findSizedBar(widgetImpl: Widget, item: WidgetItem, index: number, getLineWidth: () => number | null): SizedBar | null {
    const width = getLineBarWidth(item);
    if (width === null) {
        return null;
    }
    const showsBar = widgetImpl.getCustomKeybinds?.(item).some(keybind => keybind.action === EDIT_BAR_WIDTH_ACTION) ?? false;
    return showsBar && getLineWidth() ? { index, width, widgetImpl, item } : null;
}

// The padding auto-align gives each bar's column on its line, beyond the bar's
// minimum: room the bar grows into without widening the line. A merge group's
// padding goes to its first bar.
function getBarColumnPadding(preRenderedLine: PreRenderedWidget[], bars: SizedBar[], maxWidths: number[], settings: Settings): number[] {
    if (!settings.powerline.enabled || !settings.powerline.autoAlign) {
        return bars.map(() => 0);
    }
    const columns = getAlignmentColumns(preRenderedLine, settings);
    const claimed = new Set<number>();
    return bars.map((bar) => {
        const position = columns.findIndex(column => column.indices.includes(bar.index));
        const column = columns[position];
        if (!column || claimed.has(position)) {
            return 0;
        }
        claimed.add(position);
        return Math.max(0, (maxWidths[position] ?? 0) - column.width);
    });
}

// Grows each line's sized bars into the room the line leaves at the terminal's
// width, measured with every bar at MIN_BAR_CELLS and flex separators at their
// narrowest. Auto-align keeps the minimum widths, so a grown bar doesn't widen
// the same column on other lines.
function sizeBarsToLines(
    allLinesWidgets: WidgetItem[][],
    preRenderedLines: PreRenderedWidget[][],
    sizedBars: SizedBar[][],
    lineWidth: number,
    settings: Settings,
    context: RenderContext
): void {
    const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    sizedBars.forEach((bars, lineIndex) => {
        const preRenderedLine = preRenderedLines[lineIndex] ?? [];
        const shownBars = bars.filter(bar => preRenderedLine[bar.index]?.content);
        if (shownBars.length === 0) {
            return;
        }

        const measureContext = { ...context, terminalWidth: 0, lineIndex };
        const minimumWidth = getVisibleWidth(renderStatusLine(allLinesWidgets[lineIndex] ?? [], settings, measureContext, preRenderedLine, maxWidths));
        // A bar fills its column's padding before it takes the line's room
        const padding = getBarColumnPadding(preRenderedLine, shownBars, maxWidths, settings);
        const desired = shownBars.map(bar => getDesiredBarCells(bar.width, lineWidth));
        const cells = allocateBarCells(desired.map((count, position) => Math.max(MIN_BAR_CELLS, count - (padding[position] ?? 0))), lineWidth - minimumWidth)
            .map((count, position) => Math.min(desired[position] ?? count, count + (padding[position] ?? 0)));
        shownBars.forEach((bar, position) => {
            const entry = preRenderedLine[bar.index];
            if (!entry) {
                return;
            }
            const content = bar.widgetImpl.render(bar.item, { ...context, barCells: cells[position] }, settings) ?? '';
            entry.alignmentWidth = entry.plainLength;
            entry.content = content;
            entry.plainLength = getVisibleWidth(content);
        });
    });
}

// Pre-renders one widget, without padding. A sized bar renders at MIN_BAR_CELLS
// and comes back as `bar`, for sizeBarsToLines to grow.
function preRenderWidget(
    widget: WidgetItem,
    index: number,
    settings: Settings,
    context: RenderContext,
    getLineWidth: () => number | null
): { entry: PreRenderedWidget; bar: SizedBar | null } {
    // Separators are handled specially, and unknown widgets render nothing but
    // keep their place, so indices match the configured widgets
    const widgetImpl = widget.type === 'separator' || widget.type === 'flex-separator' ? undefined : getWidget(widget.type);
    if (!widgetImpl) {
        return { entry: { content: '', plainLength: 0, widget }, bar: null };
    }

    const effectiveWidget = context.minimalist ? { ...widget, rawValue: true } : widget;
    const bar = findSizedBar(widgetImpl, effectiveWidget, index, getLineWidth);
    const content = widgetImpl.render(effectiveWidget, bar ? { ...context, barCells: MIN_BAR_CELLS } : context, settings) ?? '';
    // getVisibleWidth measures the display width of Unicode text
    return { entry: { content, plainLength: getVisibleWidth(content), widget }, bar };
}

// Pre-render all widgets once and cache the results. Bars with a width setting
// first render at MIN_BAR_CELLS, then grow to fit their lines.
export function preRenderAllWidgets(
    allLinesWidgets: WidgetItem[][],
    settings: Settings,
    context: RenderContext
): PreRenderedWidget[][] {
    const preRenderedLines: PreRenderedWidget[][] = [];
    const sizedBars: SizedBar[][] = [];
    // Resolved only once a sized bar needs it; null when the width is unknown
    let lineWidth: number | null | undefined;
    const getLineWidth = (): number | null => {
        lineWidth ??= resolveEffectiveTerminalWidth(context.terminalWidth ?? getTerminalWidth(), settings, context);
        return lineWidth;
    };

    for (const lineWidgets of allLinesWidgets) {
        const results = lineWidgets.map((widget, index) => preRenderWidget(widget, index, settings, context, getLineWidth));
        const preRenderedLine = results.map(result => result.entry);
        applyMergeTargetHiding(preRenderedLine);
        preRenderedLines.push(preRenderedLine);
        sizedBars.push(results.flatMap(result => (result.bar ? [result.bar] : [])));
    }

    if (lineWidth) {
        sizeBarsToLines(allLinesWidgets, preRenderedLines, sizedBars, lineWidth, settings, context);
    }

    return preRenderedLines;
}

// One auto-align column on a line: a widget, or a merge group
interface AlignmentColumn {
    width: number;  // Padding included
    indices: number[];  // Positions in the pre-rendered line
}

// Separators end a merge group and aren't columns themselves
function isAlignmentBoundary(entry: PreRenderedWidget | undefined): boolean {
    return entry?.widget.type === 'separator' || entry?.widget.type === 'flex-separator';
}

// Whether a widget after this one renders before the next separator, so a
// merge from this one has something to merge into
function hasRenderedWidgetBeforeSeparator(preRenderedLine: PreRenderedWidget[], originalIndex: number): boolean {
    for (let j = originalIndex + 1; j < preRenderedLine.length; j++) {
        const nextEntry = preRenderedLine[j];
        if (!nextEntry)
            continue;
        if (isAlignmentBoundary(nextEntry))
            return false;
        if (nextEntry.content)
            return true;
    }

    return false;
}

// A line's auto-align columns, in order
function getAlignmentColumns(preRenderedLine: PreRenderedWidget[], settings: Settings): AlignmentColumn[] {
    const columns: AlignmentColumn[] = [];
    const defaultPadding = settings.defaultPadding ?? '';
    const { leading: sideLeadingPadding, trailing: sideTrailingPadding } = resolvePaddingSides(defaultPadding, settings.defaultPaddingSide);
    const paddingPairLength = sideLeadingPadding.length + sideTrailingPadding.length;

    const renderedWidgets = preRenderedLine
        .map((entry, originalIndex) => ({
            ...entry,
            originalIndex,
            mergesWithNext: Boolean(entry.widget.merge && hasRenderedWidgetBeforeSeparator(preRenderedLine, originalIndex))
        }))
        .filter(entry => !isAlignmentBoundary(entry) && entry.content);

    let i = 0;
    while (i < renderedWidgets.length) {
        // An excluded widget opts itself and the rest of the line out of the
        // shared column widths. This only applies to merge-group heads;
        // widgets merged into a previous widget keep the group's width.
        if (renderedWidgets[i]?.widget.excludeFromAutoAlign)
            break;

        const group = getMergeGroup(renderedWidgets, i, paddingPairLength);
        columns.push(group.column);

        // The next column starts after the widgets merged into this one
        i = group.end + 1;
    }

    return columns;
}

// The column a widget heads: its width plus the widths of the widgets merged
// into it, and the position of the group's last widget
function getMergeGroup(
    renderedWidgets: (PreRenderedWidget & { originalIndex: number; mergesWithNext: boolean })[],
    start: number,
    paddingPairLength: number
): { column: AlignmentColumn; end: number } {
    const head = renderedWidgets[start];
    let totalWidth = head ? (head.alignmentWidth ?? head.plainLength) + paddingPairLength : 0;
    const indices = head ? [head.originalIndex] : [];

    let j = start;
    while (j < renderedWidgets.length - 1 && renderedWidgets[j]?.mergesWithNext) {
        j++;
        const nextWidget = renderedWidgets[j];
        if (nextWidget) {
            // When merging with 'no-padding', don't count padding between widgets
            const padding = renderedWidgets[j - 1]?.widget.merge === 'no-padding' ? 0 : paddingPairLength;
            totalWidth += (nextWidget.alignmentWidth ?? nextWidget.plainLength) + padding;
            indices.push(nextWidget.originalIndex);
        }
    }

    return { column: { width: totalWidth, indices }, end: j };
}

// Calculate max widths from pre-rendered widgets for alignment
export function calculateMaxWidthsFromPreRendered(
    preRenderedLines: PreRenderedWidget[][],
    settings: Settings
): number[] {
    const maxWidths: number[] = [];
    for (const preRenderedLine of preRenderedLines) {
        getAlignmentColumns(preRenderedLine, settings).forEach((column, alignmentPos) => {
            maxWidths[alignmentPos] = Math.max(maxWidths[alignmentPos] ?? 0, column.width);
        });
    }

    return maxWidths;
}

export function renderStatusLineWithInfo(
    widgets: WidgetItem[],
    settings: Settings,
    context: RenderContext,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): RenderResult {
    const line = renderStatusLine(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
    // Check if line contains the truncation ellipsis
    const wasTruncated = getVisibleText(line).includes('...');
    return { line, wasTruncated };
}

export function renderStatusLine(
    widgets: WidgetItem[],
    settings: Settings,
    context: RenderContext,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): string {
    // Force 24-bit color for non-preview statusline rendering
    // Chalk level is now set globally in ccstatusline.ts and tui.tsx
    // No need to override here

    // Get color level from settings
    const colorLevel = getColorLevelString(settings.colorLevel);

    // Check if powerline mode is enabled
    const powerlineSettings = settings.powerline as Record<string, unknown> | undefined;
    const isPowerlineMode = Boolean(powerlineSettings?.enabled);

    // If powerline mode is enabled, use powerline renderer
    if (isPowerlineMode)
        return renderPowerlineStatusLine(
            widgets,
            settings,
            context,
            context.lineIndex ?? 0,
            context.globalSeparatorIndex ?? 0,
            context.globalPowerlineThemeIndex ?? 0,
            preRenderedWidgets,
            preCalculatedMaxWidths
        );

    // Helper to apply colors with optional background, bold, and dim
    const applyColorsWithOverride = (text: string, foregroundColor?: string, backgroundColor?: string, bold?: boolean, dim?: boolean | 'parens', keepColoredRuns?: boolean): string => {
        // Override foreground color takes precedence over EVERYTHING, including passed foreground
        // color — except a gradient: spec, which is not a solid color. The gradient is applied as a
        // whole-line pass after assembly, so when it will render (color levels above ansi16) we emit
        // no per-widget foreground and let the gradient own it; at ansi16 the gradient is a no-op, so
        // the widget's own foreground is kept.
        let fgColor = foregroundColor;
        const fgOverride = settings.overrideForegroundColor;
        if (fgOverride && fgOverride !== 'none') {
            if (!isGradientSpec(fgOverride)) {
                fgColor = fgOverride;
            } else if (colorLevel !== 'ansi16') {
                fgColor = undefined;
            }
        }

        // Override background color takes precedence over EVERYTHING, including passed background color
        let bgColor = backgroundColor;
        if (settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none') {
            bgColor = settings.overrideBackgroundColor;
        }

        const shouldBold = (settings.globalBold) || bold;
        return applyColors(text, fgColor, bgColor, shouldBold, colorLevel, dim, keepColoredRuns);
    };

    const detectedWidth = context.terminalWidth ?? getTerminalWidth();

    // Calculate terminal width based on flex mode settings
    const terminalWidth = resolveEffectiveTerminalWidth(detectedWidth, settings, context);

    const elements: { content: string; type: string; widget?: WidgetItem; mergesWithNext?: boolean }[] = [];
    let hasFlexSeparator = false;

    // A merge carries past a widget that renders nothing only if that widget is
    // merged onward too; otherwise the merge ends with it.
    const mergeEndsAtEmptyWidget = (index: number): boolean => {
        for (let j = index + 1; j < widgets.length; j++) {
            const next = widgets[j];
            if (!next)
                continue;
            if (next.type === 'separator' || next.type === 'flex-separator' || preRenderedWidgets[j]?.content)
                return false;
            if (!next.merge)
                return true;
        }

        return false;
    };

    // Build elements based on configured widgets
    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (!widget)
            continue;

        // Handle separators specially (they're not widgets)
        if (widget.type === 'separator') {
            // Empty widgets do not break the relationship between a separator
            // and the preceding visible content. A visible separator owns that
            // boundary, while spacing-only separators can be replaced by a
            // more meaningful separator that follows the empty widget.
            let contentBeforeIndex: number | null = null;
            let replacesSpacingSeparator = false;
            let crossedEmptyWidget = false;
            let crossedUnmergedEmptyWidget = false;
            for (let j = i - 1; j >= 0; j--) {
                const prevWidget = widgets[j];
                if (!prevWidget)
                    continue;
                if (prevWidget.type === 'separator') {
                    if (!isSpacingSeparator(prevWidget, settings.defaultSeparator))
                        break;
                    replacesSpacingSeparator = true;
                    continue;
                }
                if (prevWidget.type === 'flex-separator')
                    break;
                if (preRenderedWidgets[j]?.content) {
                    // A merge owns the boundary across widgets that render empty,
                    // but only while each of them is merged onward too.
                    if (!prevWidget.merge || !crossedEmptyWidget || crossedUnmergedEmptyWidget)
                        contentBeforeIndex = j;
                    break;
                }
                crossedEmptyWidget = true;
                if (!prevWidget.merge)
                    crossedUnmergedEmptyWidget = true;
            }
            if (contentBeforeIndex === null)
                continue;

            if (replacesSpacingSeparator) {
                while (isSpacingSeparator(elements[elements.length - 1]?.widget, settings.defaultSeparator)) {
                    elements.pop();
                }
            }

            const sepChar = widget.character ?? (settings.defaultSeparator ?? '|');
            const formattedSep = formatSeparator(sepChar);

            // Check if we should inherit colors from the previous widget
            let separatorColor = widget.color ?? 'gray';
            let separatorBg = widget.backgroundColor;
            let separatorBold = widget.bold;
            let separatorDim = widget.dim;

            if (settings.inheritSeparatorColors && !widget.color && !widget.backgroundColor) {
                // Only inherit if the separator doesn't have explicit colors set
                const prevWidget = widgets[contentBeforeIndex];
                if (prevWidget) {
                    // Get the previous widget's colors
                    let widgetColor = prevWidget.color;
                    if (!widgetColor) {
                        const widgetImpl = getWidget(prevWidget.type);
                        widgetColor = widgetImpl ? widgetImpl.getDefaultColor() : 'white';
                    }
                    separatorColor = widgetColor;
                    separatorBg = prevWidget.backgroundColor;
                    separatorBold = prevWidget.bold;
                    separatorDim = prevWidget.dim;
                }
            }

            elements.push({ content: applyColorsWithOverride(formattedSep, separatorColor, separatorBg, separatorBold, separatorDim), type: 'separator', widget });
            continue;
        }

        if (widget.type === 'flex-separator') {
            elements.push({ content: 'FLEX', type: 'flex-separator', widget });
            hasFlexSeparator = true;
            continue;
        }

        // Use widget registry for regular widgets
        try {
            let widgetText: string | undefined;
            let defaultColor = 'white';

            // Use pre-rendered content
            const preRendered = preRenderedWidgets[i];
            if (preRendered?.content) {
                widgetText = preRendered.content;
                // Get default color from widget impl for consistency
                const widgetImpl = getWidget(widget.type);
                if (widgetImpl) {
                    defaultColor = widgetImpl.getDefaultColor();
                }
            }

            if (widgetText) {
                // Special handling for widgets that preserve their own colors
                if (widgetPreservesColors(widget)) {
                    // Handle max width truncation for commands with ANSI codes
                    let finalOutput = widgetText;
                    if (widget.maxWidth && widget.maxWidth > 0) {
                        const plainLength = getVisibleWidth(widgetText);
                        if (plainLength > widget.maxWidth) {
                            finalOutput = truncateStyledText(widgetText, widget.maxWidth, { ellipsis: false });
                        }
                    }
                    if (hasForegroundOverride(settings)) {
                        finalOutput = stripSgrCodes(finalOutput);
                    }
                    // Preserve intrinsic foregrounds only when no global
                    // foreground override is active. Bold, dim, backgrounds,
                    // and global overrides still wrap the widget normally.
                    elements.push({
                        content: applyColorsWithOverride(finalOutput, undefined, widget.backgroundColor, widget.bold, widget.dim),
                        type: widget.type,
                        widget,
                        mergesWithNext: Boolean(widget.merge) && !mergeEndsAtEmptyWidget(i)
                    });
                } else {
                    // Normal widget rendering with colors, around any runs the
                    // widget colors itself unless a global override owns the foreground
                    const colorsOwnRuns = widgetColorsOnlyItsRuns(widget);
                    const text = colorsOwnRuns && hasForegroundOverride(settings) ? stripSgrCodes(widgetText) : widgetText;
                    elements.push({
                        content: applyColorsWithOverride(text, widget.color ?? defaultColor, widget.backgroundColor, widget.bold, widget.dim, colorsOwnRuns),
                        type: widget.type,
                        widget,
                        mergesWithNext: Boolean(widget.merge) && !mergeEndsAtEmptyWidget(i)
                    });
                }
            }
        } catch {
            // Unknown widget type - skip
            continue;
        }
    }

    if (elements.length === 0)
        return '';

    // Remove trailing separators
    while (elements.length > 0 && elements[elements.length - 1]?.type === 'separator') {
        elements.pop();
    }

    // When width detection fails, flex separators fall back to their own ' | '
    // boundary. Drop any spacing-only separator stranded directly beside one so
    // that fallback does not render a duplicate space. With a known width, keep
    // the separator: a fully occupied line can leave the flex gap at zero columns,
    // making this space the only boundary between the surrounding content.
    if (!terminalWidth) {
        for (let i = elements.length - 1; i >= 0; i--) {
            if (elements[i]?.type !== 'separator'
                || !isSpacingSeparator(elements[i]?.widget, settings.defaultSeparator)) {
                continue;
            }
            if (elements[i - 1]?.type === 'flex-separator' || elements[i + 1]?.type === 'flex-separator') {
                elements.splice(i, 1);
            }
        }
    }

    // Apply default padding and separators
    const finalElements: string[] = [];
    const padding = settings.defaultPadding ?? '';
    const { leading: sideLeadingPadding, trailing: sideTrailingPadding } = resolvePaddingSides(padding, settings.defaultPaddingSide);
    const defaultSep = settings.defaultSeparator ? formatSeparator(settings.defaultSeparator) : '';

    elements.forEach((elem, index) => {
        // Add default separator between any two items (but not before first item, and not around flex separators)
        const prevElem = index > 0 ? elements[index - 1] : null;
        const shouldAddSeparator = defaultSep && index > 0
            && elem.type !== 'flex-separator'
            && prevElem?.type !== 'flex-separator'
            && !prevElem?.mergesWithNext; // Don't add separator if previous widget is merged with this one

        if (shouldAddSeparator) {
            // Check if we should inherit colors from the previous element
            if (settings.inheritSeparatorColors && index > 0) {
                const prevElem = elements[index - 1];
                if (prevElem?.widget) {
                    // Apply the previous element's colors to the separator (already handles override)
                    // Use the widget's color if set, otherwise get the default color for that widget type
                    let widgetColor = prevElem.widget.color;
                    if (!widgetColor && prevElem.widget.type !== 'separator' && prevElem.widget.type !== 'flex-separator') {
                        const widgetImpl = getWidget(prevElem.widget.type);
                        widgetColor = widgetImpl ? widgetImpl.getDefaultColor() : 'white';
                    }
                    const coloredSep = applyColorsWithOverride(defaultSep, widgetColor, prevElem.widget.backgroundColor, prevElem.widget.bold, prevElem.widget.dim);
                    finalElements.push(coloredSep);
                } else {
                    finalElements.push(defaultSep);
                }
            } else if ((settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none')
                || (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none')) {
                // Apply override colors even when not inheriting colors
                const coloredSep = applyColorsWithOverride(defaultSep, undefined, undefined);
                finalElements.push(coloredSep);
            } else {
                finalElements.push(defaultSep);
            }
        }

        // Add element with padding (separators don't get padding)
        if (elem.type === 'separator' || elem.type === 'flex-separator') {
            finalElements.push(elem.content);
        } else {
            // Check if padding should be omitted due to no-padding merge
            const nextElem = index < elements.length - 1 ? elements[index + 1] : null;
            const omitLeadingPadding = prevElem?.widget?.merge === 'no-padding' && Boolean(prevElem.mergesWithNext);
            const omitTrailingPadding = elem.widget?.merge === 'no-padding'
                && Boolean(elem.mergesWithNext)
                && nextElem
                && nextElem.type !== 'separator'
                && nextElem.type !== 'flex-separator';

            // Apply padding with colors (using overrides if set)
            const hasColorOverride = Boolean(settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none')
                || Boolean(settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none');

            if (padding && (elem.widget?.backgroundColor || hasColorOverride)) {
                // Apply colors to padding - applyColorsWithOverride will handle the overrides
                const leadingPadding = omitLeadingPadding || !sideLeadingPadding ? '' : applyColorsWithOverride(sideLeadingPadding, undefined, elem.widget?.backgroundColor);
                const trailingPadding = omitTrailingPadding || !sideTrailingPadding ? '' : applyColorsWithOverride(sideTrailingPadding, undefined, elem.widget?.backgroundColor);
                const paddedContent = leadingPadding + elem.content + trailingPadding;
                finalElements.push(paddedContent);
            } else if (padding) {
                // Wrap padding in ANSI reset codes to prevent trimming
                // This ensures leading spaces aren't trimmed by terminals
                const leadingPadding = omitLeadingPadding || !sideLeadingPadding ? '' : chalk.reset(sideLeadingPadding);
                const trailingPadding = omitTrailingPadding || !sideTrailingPadding ? '' : chalk.reset(sideTrailingPadding);
                finalElements.push(leadingPadding + elem.content + trailingPadding);
            } else {
                // No padding
                finalElements.push(elem.content);
            }
        }
    });

    // Build the final status line
    let statusLine: string;

    if (hasFlexSeparator && terminalWidth) {
        // Split elements by flex separators
        const parts: string[][] = [[]];
        let currentPart = 0;

        for (const elem of finalElements) {
            if (elem === 'FLEX') {
                currentPart++;
                parts[currentPart] = [];
            } else {
                parts[currentPart]?.push(elem);
            }
        }

        // Calculate total length of all non-flex content
        const partLengths = parts.map((part) => {
            const joined = part.join('');
            return getVisibleWidth(joined);
        });
        const totalContentLength = partLengths.reduce((sum, len) => sum + len, 0);

        // Calculate space to distribute among flex separators
        const flexCount = parts.length - 1; // Number of flex separators
        const totalSpace = Math.max(0, terminalWidth - totalContentLength);
        const spacePerFlex = flexCount > 0 ? Math.floor(totalSpace / flexCount) : 0;
        const extraSpace = flexCount > 0 ? totalSpace % flexCount : 0;

        // Build the status line with distributed spacing
        statusLine = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part) {
                statusLine += part.join('');
            }
            if (i < parts.length - 1) {
                // Add flex spacing
                const spaces = spacePerFlex + (i < extraSpace ? 1 : 0);
                statusLine += ' '.repeat(spaces);
            }
        }
    } else {
        // No flex separator OR no width detected
        if (hasFlexSeparator && !terminalWidth) {
            // Treat flex separators as normal separators when width detection fails
            statusLine = finalElements.map(e => e === 'FLEX' ? chalk.gray(' | ') : e).join('');
        } else {
            // Just join all elements normally
            statusLine = finalElements.join('');
        }
    }

    // Truncate if the line exceeds the terminal width
    // Use terminalWidth if available (already accounts for flex mode adjustments), otherwise use detectedWidth
    const maxWidth = terminalWidth ?? detectedWidth;
    if (maxWidth && maxWidth > 0) {
        // Remove ANSI escape codes to get actual length
        const plainLength = getVisibleWidth(statusLine);

        if (plainLength > maxWidth) {
            statusLine = truncateStyledText(statusLine, maxWidth, { ellipsis: true });
        }
    }

    // Apply a foreground gradient across the whole line if configured. This runs
    // AFTER truncation, not before: truncateStyledText cuts from the right and
    // appends a raw "..." with no trailing reset, so a gradient applied earlier
    // would have its closing \x1b[39m sliced off — leaking the last color past the
    // line. Gradient codes are zero-width (getVisibleWidth strips them), so the
    // truncation measurement above is unaffected by deferring the gradient, and
    // coloring the already-truncated line sweeps the ellipsis too and keeps the
    // reset at the true end.
    statusLine = maybeApplyForegroundGradient(statusLine, settings, colorLevel);

    return statusLine;
}
