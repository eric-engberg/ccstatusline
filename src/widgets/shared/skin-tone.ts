import { createContext } from 'react';

import {
    SKIN_TONES,
    type SkinTone
} from '../../types/SkinTone';

// Unicode's skin tone modifiers, U+1F3FB to U+1F3FF
const MODIFIERS: Record<SkinTone, string> = {
    'light': '\u{1F3FB}',
    'medium-light': '\u{1F3FC}',
    'medium': '\u{1F3FD}',
    'medium-dark': '\u{1F3FE}',
    'dark': '\u{1F3FF}'
};
const ANY_MODIFIER = /[\u{1F3FB}-\u{1F3FF}]/gu;

/** The glyph picker's skin tone, kept in the settings; without a provider it stays in the picker. */
export interface SkinToneSetting {
    tone: SkinTone | undefined;
    setTone: (tone: SkinTone | undefined) => void;
}

export const SkinToneContext = createContext<SkinToneSetting>({ tone: undefined, setTone: () => undefined });

/** The next tone: the default, then each tone lightest first, then the default again. */
export function cycleSkinTone(tone: SkinTone | undefined): SkinTone | undefined {
    return tone === undefined ? SKIN_TONES[0] : SKIN_TONES[SKIN_TONES.indexOf(tone) + 1];
}

export function getSkinToneModifier(tone: SkinTone): string {
    return MODIFIERS[tone];
}

/** An emoji in a tone, from its light tone version (both people's, in a two-person emoji). */
export function applySkinTone(lightTone: string, tone: SkinTone): string {
    return lightTone.replaceAll(MODIFIERS.light, MODIFIERS[tone]);
}

export function stripSkinTone(glyph: string): string {
    return glyph.replaceAll(ANY_MODIFIER, '');
}

/** The tone an emoji is in (medium-dark for 👍🏾), or undefined for one without a tone. */
export function getSkinTone(glyph: string): SkinTone | undefined {
    return SKIN_TONES.find(tone => glyph.includes(MODIFIERS[tone]));
}

/** "thumbs up: medium skin tone", or "kiss: woman, man, dark skin tone" when the name has a colon already, as Unicode names them. */
export function formatSkinToneName(name: string, tone: SkinTone): string {
    return `${name}${name.includes(':') ? ',' : ':'} ${tone} skin tone`;
}
