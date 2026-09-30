import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'plugins/codex-ambient');
const manifest = JSON.parse(await fs.readFile(path.join(source, 'plugin.json'), 'utf8'));
const output = path.join(root, 'dist', `CodexAmbient-plugin-v${manifest.version}`);
const plugin = path.join(output, 'plugins/codex-ambient');
if (process.platform !== 'win32' || process.arch !== 'x64' || process.version !== 'v24.18.0') {
  throw new Error('Build with Windows x64 Node v24.18.0 to match the bundled Node license.');
}
await fs.mkdir(plugin, { recursive: true });
await fs.cp(source, plugin, { recursive: true });
await fs.mkdir(path.join(plugin, 'runtime'), { recursive: true });
await fs.copyFile(process.execPath, path.join(plugin, 'runtime/node.exe'));
await fs.copyFile(path.join(root, 'packaging/NODE-LICENSE.txt'), path.join(plugin, 'runtime/NODE-LICENSE.txt'));
await fs.mkdir(path.join(plugin, 'app'), { recursive: true });
for (const name of ['server.mjs', 'package.json', 'public', 'lib']) {
  await fs.cp(path.join(root, name), path.join(plugin, 'app', name), { recursive: true });
}
await fs.mkdir(path.join(plugin, 'assets'), { recursive: true });
await fs.copyFile(path.join(root, 'public/favicon.svg'), path.join(plugin, 'assets/icon.svg'));
// Compatibility with hosts that do not yet read portable manifests.
await fs.mkdir(path.join(plugin, '.codex-plugin'), { recursive: true });
const { $schema, extensions, ...identity } = manifest;
await fs.writeFile(path.join(plugin, '.codex-plugin/plugin.json'), JSON.stringify({ ...identity, ...extensions['com.openai'], mcpServers: './.mcp.json' }, null, 2));
const { $schema: mcpSchema, ...mcp } = JSON.parse(await fs.readFile(path.join(plugin, 'mcp.json'), 'utf8'));
for (const server of Object.values(mcp.mcpServers)) delete server.type;
await fs.writeFile(path.join(plugin, '.mcp.json'), JSON.stringify(mcp, null, 2));
// Codex 26.928 recognizes portable metadata but does not load its local MCP
// component. Ship the documented compatibility format until that is supported.
await fs.unlink(path.join(plugin, 'plugin.json'));
await fs.unlink(path.join(plugin, 'mcp.json'));
await fs.mkdir(path.join(output, '.agents/plugins'), { recursive: true });
await fs.writeFile(path.join(output, '.agents/plugins/marketplace.json'), JSON.stringify({
  name: 'codex-ambient-local', interface: { displayName: 'Codex Ambient · 本機外掛' },
  plugins: [{ name: 'codex-ambient', source: { source: 'local', path: './plugins/codex-ambient' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }]
}, null, 2));
await fs.copyFile(path.join(root, 'packaging/Install-Plugin.ps1'), path.join(output, 'Install-Plugin.ps1'));
await fs.copyFile(path.join(root, 'Start-Codex.ps1'), path.join(output, 'Start-Codex.ps1'));
await fs.copyFile(path.join(source, 'README.md'), path.join(output, 'README.md'));
const archive = output + '.zip';
// Quote literal PowerShell paths; JSON escaping is not shell quoting.
const literal = value => "'" + value.replaceAll("'", "''") + "'";
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; if (Test-Path -LiteralPath ${literal(archive)}) { [IO.File]::Delete(${literal(archive)}) }; [IO.Compression.ZipFile]::CreateFromDirectory(${literal(output)}, ${literal(archive)})`
], { stdio: 'inherit', windowsHide: true });
const hash = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
await fs.writeFile(archive + '.sha256', `${hash}  ${path.basename(archive)}\n`);
console.log(`Plugin marketplace: ${output}\nArchive: ${archive}\nSHA256: ${hash}`);
