// IWSDK 1.0.1 asks PowerShell for a process start time with a 1.5 s timeout.
// PowerShell often takes ~2 s to start on Windows laptops, which makes the dev
// server fail with "Cannot establish this process birth identity". This raises
// that one timeout. Runs automatically after `npm install`.
import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'node_modules/@iwsdk/cli/dist/cli.js',
  'node_modules/@iwsdk/cli/dist/index.js',
  'node_modules/@iwsdk/cli/dist/runtime-files.js',
  'node_modules/@iwsdk/cli/dist/runtime-owner.js',
  'node_modules/@iwsdk/vite-plugin-dev/dist/index.js',
];
// The timeout sits a few lines after the PowerShell StartTime query.
const pattern = /(ToUniversalTime\(\)\.Ticks`,[\s\S]{0,200}?timeout: )1500,/g;

for (const file of files) {
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const patched = source.replace(pattern, '$110000,');
  if (patched !== source) {
    writeFileSync(file, patched);
    console.log(`patched PowerShell timeout in ${file}`);
  }
}
