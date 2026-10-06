import {
    describe,
    expect,
    it
} from 'vitest';

import {
    applySkinTone,
    cycleSkinTone,
    formatSkinToneName,
    stripSkinTone
} from '../skin-tone';

describe('skin tone', () => {
    it('cycles from the default through each tone, lightest first, and back', () => {
        const seen: (string | undefined)[] = [];
        let tone = cycleSkinTone(undefined);
        while (tone !== undefined) {
            seen.push(tone);
            tone = cycleSkinTone(tone);
        }

        expect(seen).toEqual(['light', 'medium-light', 'medium', 'medium-dark', 'dark']);
    });

    // The light tone version stands in for every tone
    it('turns an emoji\'s light tone version into another tone', () => {
        expect(applySkinTone('👍🏻', 'light')).toBe('👍🏻');
        expect(applySkinTone('👍🏻', 'dark')).toBe('👍🏿');
        expect(applySkinTone('👩🏻‍💻', 'medium')).toBe('👩🏽‍💻');
        // Both people in a two-person emoji
        expect(applySkinTone('🧑🏻‍🤝‍🧑🏻', 'medium-dark')).toBe('🧑🏾‍🤝‍🧑🏾');
    });

    it('takes the tone off an emoji', () => {
        expect(stripSkinTone('👍🏾')).toBe('👍');
        expect(stripSkinTone('🧑🏿‍🤝‍🧑🏿')).toBe('🧑‍🤝‍🧑');
        expect(stripSkinTone('🤡')).toBe('🤡');
    });

    // Unicode's own names for the toned versions
    it('names a toned emoji the way Unicode does', () => {
        expect(formatSkinToneName('thumbs up', 'medium')).toBe('thumbs up: medium skin tone');
        expect(formatSkinToneName('kiss: woman, man', 'dark')).toBe('kiss: woman, man, dark skin tone');
    });
});
