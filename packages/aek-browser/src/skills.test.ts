import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ArgumentError } from './errors.js';
import { listAekbSkills, readAekbSkill } from './skills.js';

function makePackageRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aekb-skills-'));
  fs.mkdirSync(path.join(root, 'skills', 'aekb-browser', 'references'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'aekb-autofix'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'smart-search'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"@cheezmil/aek-browser"}\n');
  fs.writeFileSync(path.join(root, 'skills', 'aekb-browser', 'SKILL.md'), [
    '---',
    'name: aekb-browser',
    'description: Browser control skill',
    'version: 1.2.3',
    '---',
    '',
    '# Browser',
    '',
    'Body.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'skills', 'aekb-browser', 'references', 'targets.md'), '# Targets\n');
  fs.writeFileSync(path.join(root, 'skills', 'aekb-autofix', 'SKILL.md'), [
    '---',
    'name: aekb-autofix',
    'description: Fix adapters: keep scope narrow',
    '---',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'skills', 'smart-search', 'SKILL.md'), [
    '---',
    'name: smart-search',
    'description: Search skill',
    '---',
    '',
  ].join('\n'));
  return root;
}

describe('aekb skills content', () => {
  it('lists only aekb-prefixed skills', () => {
    const root = makePackageRoot();

    expect(listAekbSkills(root).map((skill) => skill.name)).toEqual([
      'aekb-autofix',
      'aekb-browser',
    ]);
    expect(listAekbSkills(root).find((skill) => skill.name === 'aekb-autofix')?.description)
      .toBe('Fix adapters: keep scope narrow');
  });

  it('reads a skill SKILL.md and reference file', () => {
    const root = makePackageRoot();

    expect(readAekbSkill('aekb-browser', '', root)).toMatchObject({
      skill: 'aekb-browser',
      path: 'SKILL.md',
    });
    expect(readAekbSkill('aekb-browser/references/targets.md', '', root)).toMatchObject({
      skill: 'aekb-browser',
      path: 'references/targets.md',
      content: '# Targets\n',
    });
    expect(readAekbSkill('aekb-browser', 'references/targets.md', root).content).toBe('# Targets\n');
  });

  it('rejects non-aekb skills and path traversal', () => {
    const root = makePackageRoot();

    expect(() => readAekbSkill('smart-search', '', root)).toThrow(ArgumentError);
    expect(() => readAekbSkill('aekb-browser/../smart-search/SKILL.md', '', root)).toThrow(ArgumentError);
    expect(() => readAekbSkill('aekb-browser', '../../package.json', root)).toThrow(ArgumentError);
  });
});
