import { z } from 'zod';

// Emoji skin tones, lightest first: Unicode's five skin tone modifiers. No tone
// means the default (yellow) emoji.
export const SKIN_TONES = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'] as const;
export const SkinToneSchema = z.enum(SKIN_TONES);
export type SkinTone = z.infer<typeof SkinToneSchema>;
