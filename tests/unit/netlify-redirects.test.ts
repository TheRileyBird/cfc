import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Netlify redirect rules', () => {
  it('routes unknown one-segment Collabs URLs to the discount redirect before the app fallback', () => {
    const config = readFileSync(resolve(process.cwd(), 'netlify.toml'), 'utf8');
    const collabsRule = config.indexOf('from = "/:discount_code"');
    const appFallback = config.indexOf('from = "/*"');

    expect(collabsRule).toBeGreaterThan(-1);
    expect(appFallback).toBeGreaterThan(-1);
    expect(collabsRule).toBeLessThan(appFallback);
  });
});
