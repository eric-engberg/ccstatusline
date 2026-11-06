import {
    describe,
    expect,
    it
} from 'vitest';

import { getUsageErrorMessage } from '../usage-windows';

describe('getUsageErrorMessage', () => {
    it('returns the rate-limited label', () => {
        expect(getUsageErrorMessage('rate-limited')).toBe('[Rate limited]');
    });

    it('returns the login-expired label', () => {
        expect(getUsageErrorMessage('login-expired')).toBe('[Login expired]');
    });
});
