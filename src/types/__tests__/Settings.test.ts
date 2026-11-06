import {
    describe,
    expect,
    it
} from 'vitest';

import { SettingsSchema } from '../Settings';

describe('SettingsSchema', () => {
    it('keeps an emoji skin tone, and leaves it out by default', () => {
        expect(SettingsSchema.parse({ emojiSkinTone: 'medium-dark' }).emojiSkinTone).toBe('medium-dark');
        expect(SettingsSchema.parse({}).emojiSkinTone).toBeUndefined();
    });

    // A bad tone shouldn't cost the rest of the settings
    it('drops an unknown skin tone and keeps everything else', () => {
        const settings = SettingsSchema.parse({ emojiSkinTone: 'purple', colorLevel: 3 });

        expect(settings.emojiSkinTone).toBeUndefined();
        expect(settings.colorLevel).toBe(3);
    });
});
