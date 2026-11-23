import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// The favicon is a standalone brand asset; interface icons use Material Symbols Rounded.
const source = join(root, 'node_modules', 'lucide-static', 'icons', 'clipboard.svg');
const baseFavicon = await readFile(source, 'utf8');
const adaptiveFavicon = baseFavicon.replace(/(<svg\b[^>]*>)/, tag => tag +
  '<style>:root{color:#252525}@media (prefers-color-scheme:dark){:root{color:#f1f1f1}}</style>');
await writeFile(join(root, 'public', 'favicon.svg'), adaptiveFavicon);
console.log('Prepared clipboard favicon; interface icons use Material Symbols Rounded');
