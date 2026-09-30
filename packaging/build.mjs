import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const stage = path.join(root, 'build', 'package-' + randomUUID());
const dist = path.join(root, 'dist');
await fs.mkdir(stage, { recursive: true }); await fs.mkdir(dist, { recursive: true });
if (process.platform !== 'win32' || process.arch !== 'x64' || Number(process.versions.node.split('.')[0]) < 22) throw new Error('Build using Windows x64 Node.js 22 or newer.');

// Standard ZIP records, avoiding a build-time npm dependency.
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) { let crc = -1; for (const byte of data) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]; return (crc ^ -1) >>> 0; }
const files = [];
async function add(relative) {
  const absolute = path.join(root, relative);
  if ((await fs.stat(absolute)).isDirectory()) {
    for (const child of (await fs.readdir(absolute)).sort()) await add(relative + '/' + child);
  } else files.push({ name: relative, data: await fs.readFile(absolute) });
}
for (const item of ['server.mjs', 'package.json', 'lib', 'public']) await add(item);
files.push({ name: 'node.exe', data: await fs.readFile(process.execPath) });
// Vendored verbatim from https://raw.githubusercontent.com/nodejs/node/v24.18.0/LICENSE.
if (process.version !== 'v24.18.0') throw new Error('Update the bundled Node license when changing the runtime version.');
files.push({ name: 'NODE-LICENSE.txt', data: await fs.readFile(path.join(here, 'NODE-LICENSE.txt')) });
const chunks = [], directory = []; let offset = 0;
for (const { name, data } of files) {
  const filename = Buffer.from(name), compressed = deflateRawSync(data, { level: 9 }), crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10);
  central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
  chunks.push(local, filename, compressed); directory.push(central, filename); offset += local.length + filename.length + compressed.length;
}
const center = Buffer.concat(directory), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(center.length, 12); end.writeUInt32LE(offset, 16);
const archive = path.join(stage, 'payload.zip'); await fs.writeFile(archive, Buffer.concat([...chunks, center, end]));

// An original geometric ICO with a 32-bit DIB (the mark is drawn from circles).
const size = 256, pixels = Buffer.alloc(size * size * 4), mask = Buffer.alloc(size * size / 8), dib = Buffer.alloc(40);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const radius = Math.hypot(x - 127.5, y - 127.5), coverage = Math.max(0, Math.min(1, 119 - radius));
  const light = radius < 84 && (y >= 127 || radius >= 78), c = light ? [226, 235, 208] : [47, 76, 59];
  const i = ((size - 1 - y) * size + x) * 4;
  pixels[i] = c[2]; pixels[i + 1] = c[1]; pixels[i + 2] = c[0]; pixels[i + 3] = Math.round(coverage * 255);
}
dib.writeUInt32LE(40, 0); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8); dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(pixels.length + mask.length, 20);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(dib.length + pixels.length + mask.length, 14); ico.writeUInt32LE(22, 18);
const iconPath = path.join(stage, 'ambient.ico'); await fs.writeFile(iconPath, Buffer.concat([ico, dib, pixels, mask]));
const compiler = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const executable = path.join(dist, 'CodexAmbient.exe');
execFileSync(compiler, [
  '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/out:' + executable,
  '/win32icon:' + iconPath, '/win32manifest:' + path.join(here, 'app.manifest'), '/resource:' + archive + ',ambient.payload.zip',
  ...['System', 'System.Core', 'System.Drawing', 'System.Windows.Forms', 'System.Web.Extensions', 'System.IO.Compression'].map(a => '/reference:' + a + '.dll'),
  path.join(here, 'AmbientLauncher.cs')
], { stdio: 'inherit', windowsHide: true });
const exe = await fs.readFile(executable), hash = createHash('sha256').update(exe).digest('hex');
await fs.writeFile(path.join(dist, 'CodexAmbient.exe.sha256'), `${hash}  CodexAmbient.exe\n`);
console.log(`Built: ${executable}\nBundled Node: ${process.version}\nSize: ${(exe.length / 1048576).toFixed(1)} MB`);
