import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Netlify redirect rules', () => {
  it('routes unknown one-segment Collabs URLs to the discount redirect before the app fallback', () => {
    const config = readFileSync(resolve(process.cwd(), 'public/_redirects'), 'utf8');
    const collabsRule = config.indexOf('/:discount_code /discount/index.html 200');
    const appFallback = config.indexOf('/* /index.html 200');

    expect(collabsRule).toBeGreaterThan(-1);
    expect(appFallback).toBeGreaterThan(-1);
    expect(collabsRule).toBeLessThan(appFallback);
  });
});
