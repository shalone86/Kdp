import { describe, expect, it } from 'vitest';
import { albumToken, isICloudAssetUrl, partitionHost } from '../server/icloud';

describe('iCloud shared album helpers', () => {
  it('extracts the token from a share link', () => {
    expect(albumToken('https://www.icloud.com/sharedalbum/#B0aGWZuqDGxxxx')).toBe('B0aGWZuqDGxxxx');
    expect(albumToken('B0aGWZuqDGxxxx')).toBe('B0aGWZuqDGxxxx');
    expect(() => albumToken('https://example.com')).toThrow();
  });
  it('derives the partition host', () => {
    // 'A' tokens use one base-62 digit, others use two.
    expect(partitionHost('A5abcdefghijk')).toBe('p05-sharedstreams.icloud.com');
    expect(partitionHost('B0aGWZuqDGxxxx')).toBe('p36-sharedstreams.icloud.com');
  });
  it('only proxies iCloud media hosts', () => {
    expect(isICloudAssetUrl('https://cvws.icloud-content.com/B/abc')).toBe(true);
    expect(isICloudAssetUrl('https://evil.example.com/x')).toBe(false);
    expect(isICloudAssetUrl('http://cvws.icloud-content.com/x')).toBe(false);
  });
});
