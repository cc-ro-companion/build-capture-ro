import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { appVersion } from './version';

describe('appVersion', () => {
  it('matches the package version', () => {
    expect(appVersion).toBe(packageJson.version);
  });
});
