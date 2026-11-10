import { describe, expect, it } from 'vitest';
import { msToNextStep, totp } from '../../e2e/live/totp';

// RFC 6238 appendix B, secret "12345678901234567890" in base32.
const uri = (algo: string) =>
  `otpauth://totp/x:y?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=${algo}&digits=8&period=30`;

describe('totp', () => {
  it('matches the RFC 6238 vectors', async () => {
    expect(await totp(uri('SHA1'), 59_000)).toBe('94287082');
    expect(await totp(uri('SHA1'), 1111111109_000)).toBe('07081804');
  });
  it('counts down to the next step', () => {
    expect(msToNextStep(uri('SHA1'), 59_000)).toBe(1_000);
  });
});
