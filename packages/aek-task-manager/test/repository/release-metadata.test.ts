import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve('.');

describe('release metadata', () => {
  it('keeps package and asset manifest versions aligned', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { version: string };
    const assetsManifest = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'assets', 'manifest.json'), 'utf8'),
    ) as { version: string };

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(assetsManifest.version).toBe(packageJson.version);
  });
});
