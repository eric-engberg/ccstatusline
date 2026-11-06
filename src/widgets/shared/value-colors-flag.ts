import type { WidgetItem } from '../../types/Widget';

import { setMetadataValue } from './metadata';

// Whether value colors are on, kept apart from value-coloring.ts, which builds
// on the bar gradients, so a bar gradient can step aside for them
const VALUE_COLORS_KEY = 'valueColors';

export function isValueColorsEnabled(item: WidgetItem): boolean {
    return item.metadata?.[VALUE_COLORS_KEY] === 'true';
}

export function setValueColorsFlag(item: WidgetItem, enabled: boolean): WidgetItem {
    return setMetadataValue(item, VALUE_COLORS_KEY, enabled ? 'true' : null);
}
