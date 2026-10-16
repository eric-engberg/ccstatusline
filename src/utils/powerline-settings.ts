import type { Settings } from '../types/Settings';

import { getDefaultPowerlineTheme } from './colors';

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
            separatorInvertBackground: powerlineConfig.separatorInvertBackground
        },
        defaultPadding: ' ',
        lines
    };
}
