import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { getDefaultPowerlineTheme } from './colors';
import { isAnyLinePowerline } from './powerline-lines';

// The Default Padding turning Powerline on sets, so segment text doesn't touch the arrows
const POWERLINE_PADDING = ' ';

// Only a theme never picked gets the default. Custom is picked on purpose, and
// the widgets' own colors draw only under it
function resolveEnabledPowerlineTheme(theme: string | undefined): string {
    if (!theme) {
        return getDefaultPowerlineTheme();
    }

    return theme;
}

export function buildEnabledPowerlineSettings(settings: Settings, removeManualSeparators: boolean): Settings {
    const powerlineConfig = settings.powerline;
    // A line set to plain keeps its separators
    const lines = removeManualSeparators
        ? settings.lines.map((line, index) => (
            powerlineConfig.lineEnabled?.[index] === false ? line : line.filter(item => item.type !== 'separator')
        ))
        : settings.lines;

    return {
        ...settings,
        powerline: {
            ...powerlineConfig,
            enabled: true,
            theme: resolveEnabledPowerlineTheme(powerlineConfig.theme),
            // Separators are initialized by schema defaults, preserve existing values.
            separators: powerlineConfig.separators,
            separatorInvertBackground: powerlineConfig.separatorInvertBackground,
            // Unset and empty padding render the same
            paddingToRestore: settings.defaultPadding ?? ''
        },
        defaultPadding: POWERLINE_PADDING,
        lines
    };
}

/**
 * Turns Powerline off. The Default Padding that turning it on replaced comes
 * back, unless the padding was changed since: that change is the user's own.
 */
export function buildDisabledPowerlineSettings(settings: Settings): Settings {
    const { paddingToRestore, ...powerlineConfig } = settings.powerline;
    const restoresPadding = paddingToRestore !== undefined && settings.defaultPadding === POWERLINE_PADDING;

    return {
        ...settings,
        powerline: {
            ...powerlineConfig,
            enabled: false
        },
        defaultPadding: restoresPadding ? paddingToRestore : settings.defaultPadding
    };
}

/**
 * The settings with new lines and per-line Powerline modes from Edit Lines.
 * When a line there brings Powerline into use, it gets the padding turning
 * Powerline on sets, and the default theme if none was picked: without them a
 * Powerline line's text runs into its arrows, and its segments and arrows have
 * no colors. A Custom theme stays. The padding is global, so plain lines get it
 * too, as they do after turning Powerline on.
 */
export function buildLinesUpdateSettings(
    settings: Settings,
    lines: WidgetItem[][],
    lineEnabled: (boolean | null)[] | undefined
): Settings {
    const updated = { ...settings, lines, powerline: { ...settings.powerline, lineEnabled } };
    const comesIntoUse = !isAnyLinePowerline(settings) && isAnyLinePowerline(updated);
    if (!comesIntoUse) {
        return updated;
    }
    const padded = { ...updated, defaultPadding: ' ' };
    if (settings.powerline.theme) {
        return padded;
    }
    return { ...padded, powerline: { ...padded.powerline, theme: getDefaultPowerlineTheme() } };
}
