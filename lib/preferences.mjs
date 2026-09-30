import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { defaults, validateConfig } from './config.mjs';

export function preferences(directory) {
  const file = path.join(directory, 'settings.json');
  async function load() {
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      return { config: validateConfig({ ...defaults, ...saved }), resumeEnabled: saved.resumeEnabled !== false };
    } catch (error) {
      // A missing file is a first run. Corrupt settings must not auto-apply a surprise effect.
      return { config: { ...defaults }, resumeEnabled: error.code === 'ENOENT' };
    }
  }
  async function save(config, resumeEnabled = true) {
    const validated = validateConfig(config);
    await mkdir(directory, { recursive: true });
    await writeFile(file + '.tmp', JSON.stringify({ ...validated, resumeEnabled }, null, 2));
    await rename(file + '.tmp', file);
    return validated;
  }
  return { load, save };
}
