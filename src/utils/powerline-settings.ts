import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { getDefaultPowerlineTheme } from './colors';
import { isAnyLinePowerline } from './powerline-lines';

function resolveEnabledPowerlineTheme(theme: string | undefined): string {
    if (!theme || theme === 'custom') {
        return getDefaultPowerlineTheme();
    }

    return theme;
}

export function buildEnabledPowerlineSettings(settings: Settings): Settings {
    const powerlineConfig = settings.powerline;

    return {
        ...settings,
        powerline: {
            ...powerlineConfig,
            enabled: true,
            theme: resolveEnabledPowerlineTheme(powerlineConfig.theme),
            // Separators are initialized by schema defaults, preserve existing values.
            separators: powerlineConfig.separators,
            separatorInvertBackground: powerlineConfig.separatorInvertBackground
        },
        defaultPadding: ' '
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
