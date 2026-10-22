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

// The padding remembered when Powerline came into use, while the padding is
// still the one Powerline set. A padding changed since is the user's own
function getRememberedPadding(settings: Settings): string | undefined {
    return settings.defaultPadding === POWERLINE_PADDING ? settings.powerline.paddingToRestore : undefined;
}

// The padding to put back once no line is Powerline: one remembered already,
// or else the current one. Unset and empty padding render the same
function getPaddingToRestore(settings: Settings): string {
    return getRememberedPadding(settings) ?? settings.defaultPadding ?? '';
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
            // A line already set to Powerline with (p) may have remembered one
            paddingToRestore: getPaddingToRestore(settings)
        },
        defaultPadding: POWERLINE_PADDING,
        lines
    };
}

/**
 * Once no line is Powerline, the Default Padding that bringing Powerline into
 * use replaced comes back, unless the padding was changed since: that change
 * is the user's own.
 */
function withPaddingRestored(settings: Settings): Settings {
    const { paddingToRestore, ...powerlineConfig } = settings.powerline;

    return {
        ...settings,
        powerline: powerlineConfig,
        defaultPadding: getRememberedPadding(settings) ?? settings.defaultPadding
    };
}

/**
 * Turns Powerline off. The padding comes back as above, but not while a line
 * set to Powerline with (p) stays Powerline.
 */
export function buildDisabledPowerlineSettings(settings: Settings): Settings {
    const disabled = { ...settings, powerline: { ...settings.powerline, enabled: false } };
    return isAnyLinePowerline(disabled) ? disabled : withPaddingRestored(disabled);
}

/**
 * The settings with new lines and per-line Powerline modes from Edit Lines.
 * When a line there brings Powerline into use, it gets the padding turning
 * Powerline on sets, and the default theme if none was picked: without them a
 * Powerline line's text runs into its arrows, and its segments and arrows have
 * no colors. A Custom theme stays. The padding is global, so plain lines get it
 * too, as they do after turning Powerline on. The padding it replaces is
 * remembered, and comes back when no line is Powerline any more, as it does
 * after turning Powerline off.
 */
export function buildLinesUpdateSettings(
    settings: Settings,
    lines: WidgetItem[][],
    lineEnabled: (boolean | null)[] | undefined
): Settings {
    const updated = { ...settings, lines, powerline: { ...settings.powerline, lineEnabled } };
    const wasInUse = isAnyLinePowerline(settings);
    const inUse = isAnyLinePowerline(updated);
    if (wasInUse && !inUse) {
        return withPaddingRestored(updated);
    }
    if (wasInUse || !inUse) {
        return updated;
    }
    const padded = {
        ...updated,
        powerline: { ...updated.powerline, paddingToRestore: getPaddingToRestore(settings) },
        defaultPadding: POWERLINE_PADDING
    };
    if (settings.powerline.theme) {
        return padded;
    }
    return { ...padded, powerline: { ...padded.powerline, theme: getDefaultPowerlineTheme() } };
}
