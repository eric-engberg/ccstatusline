import type { Settings } from '../types/Settings';

import { getDefaultPowerlineTheme } from './colors';

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
    const lines = removeManualSeparators
        ? settings.lines.map(line => line.filter(item => item.type !== 'separator'))
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
