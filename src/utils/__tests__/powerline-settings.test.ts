import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    buildDisabledPowerlineSettings,
    buildEnabledPowerlineSettings,
    buildLinesUpdateSettings
} from '../powerline-settings';

describe('powerline settings helpers', () => {
    it('enables powerline with default theme and default padding', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: undefined
            }
        };

        const updated = buildEnabledPowerlineSettings(settings);

        expect(updated.powerline.enabled).toBe(true);
        expect(updated.powerline.theme).toBe('nord-aurora');
        expect(updated.defaultPadding).toBe(' ');
    });

    it('preserves non-custom theme when enabling powerline', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: 'catppuccin'
            }
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.powerline.theme).toBe('catppuccin');
    });

    // Custom is only ever picked on purpose, and the widget colors draw only under it
    it('keeps a chosen Custom theme when enabling powerline', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: 'custom'
            }
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.powerline.theme).toBe('custom');
    });

    it.each([
        ['unset', undefined, ''],
        ['none', '', ''],
        ['two spaces', '  ', '  ']
    ])('remembers the default padding it replaces (%s) when enabling powerline', (_name, padding, remembered) => {
        const settings = {
            ...DEFAULT_SETTINGS,
            defaultPadding: padding
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.defaultPadding).toBe(' ');
        expect(updated.powerline.paddingToRestore).toBe(remembered);
    });

    it('keeps manual separators alongside flex separators when enabling', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'context-length' },
            { id: '4', type: 'flex-separator' }
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            lines: [line]
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length', 'flex-separator']);
    });

    it('does not delete a manual separator across an enable then disable round trip', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'context-length' }
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false
            },
            lines: [line]
        };

        const enabled = buildEnabledPowerlineSettings(settings);
        const disabled = {
            ...enabled,
            powerline: {
                ...enabled.powerline,
                enabled: false
            }
        };

        expect(disabled.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
    });

    it('keeps manual separators, a Custom theme and the default padding when turned on, off and on again', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'context-length' }
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            defaultPadding: '  ',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: 'custom'
            },
            lines: [line]
        };

        const enabled = buildEnabledPowerlineSettings(settings);
        const disabled = buildDisabledPowerlineSettings(enabled);
        const enabledAgain = buildEnabledPowerlineSettings(disabled);

        expect(disabled.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
        expect(disabled.defaultPadding).toBe('  ');
        expect(disabled.powerline.theme).toBe('custom');
        expect(enabledAgain.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
        expect(enabledAgain.powerline.theme).toBe('custom');
    });
});

// A line switched to Powerline with (p) in Edit Lines, before any line was
// Powerline, gets the theme and padding turning Powerline on sets
describe('buildLinesUpdateSettings', () => {
    const lines: WidgetItem[][] = [[{ id: '1', type: 'model' }], [{ id: '2', type: 'git-branch' }]];

    function withTheme(theme: string | undefined, lineEnabled?: (boolean | null)[]): Settings {
        return { ...DEFAULT_SETTINGS, lines, powerline: { ...DEFAULT_SETTINGS.powerline, enabled: false, theme, lineEnabled } };
    }

    it('stores the lines and their Powerline modes', () => {
        const moved = [lines[1] ?? [], lines[0] ?? []];
        const updated = buildLinesUpdateSettings(withTheme('catppuccin'), moved, [null, true]);

        expect(updated.lines).toBe(moved);
        expect(updated.powerline).toEqual({ ...withTheme('catppuccin').powerline, lineEnabled: [null, true] });
    });

    it('picks the default theme when the first line turns Powerline and none was picked', () => {
        expect(buildLinesUpdateSettings(withTheme(undefined), lines, [true]).powerline.theme).toBe('nord-aurora');
    });

    it('keeps a theme the user picked, Custom included', () => {
        expect(buildLinesUpdateSettings(withTheme('catppuccin'), lines, [true]).powerline.theme).toBe('catppuccin');
        expect(buildLinesUpdateSettings(withTheme('custom'), lines, [true]).powerline.theme).toBe('custom');
    });

    it('sets the padding turning Powerline on sets when the first line turns Powerline', () => {
        expect(buildLinesUpdateSettings(withTheme(undefined), lines, [true]).defaultPadding).toBe(' ');
        expect(buildLinesUpdateSettings({ ...withTheme('catppuccin'), defaultPadding: '' }, lines, [true]).defaultPadding).toBe(' ');
    });

    it('leaves the theme and padding alone unless Powerline comes into use', () => {
        const unchanged = buildLinesUpdateSettings(withTheme(undefined), lines, undefined);
        const alreadyInUse = buildLinesUpdateSettings({ ...withTheme(undefined, [true]), defaultPadding: '' }, lines, [true, true]);

        expect(unchanged.powerline.theme).toBeUndefined();
        expect(unchanged.defaultPadding).toBeUndefined();
        expect(alreadyInUse.powerline.theme).toBeUndefined();
        expect(alreadyInUse.defaultPadding).toBe('');
    });
});
