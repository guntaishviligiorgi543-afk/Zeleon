import { describe, expect, it } from 'vitest';
import { validateAvatar } from './profile-avatar';

describe('profile avatar file validation', () => {
  const file = (type: string, size: number) =>
    new File([new Uint8Array(size)], 'avatar', { type });

  it('accepts JPG, PNG and WebP through the 5 MB boundary', () => {
    expect(validateAvatar(file('image/jpeg', 12))).toBe('jpg');
    expect(validateAvatar(file('image/png', 12))).toBe('png');
    expect(validateAvatar(file('image/webp', 12))).toBe('webp');
    expect(validateAvatar(file('image/webp', 5 * 1024 * 1024))).toBe('webp');
  });

  it('rejects empty, oversized and unsupported content types', () => {
    expect(() => validateAvatar(file('image/png', 0))).toThrow();
    expect(() => validateAvatar(file('image/jpeg', 5 * 1024 * 1024 + 1))).toThrow();
    expect(() => validateAvatar(file('image/svg+xml', 12))).toThrow();
    expect(() => validateAvatar(file('text/html', 12))).toThrow();
  });
});
