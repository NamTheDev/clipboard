import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'node_modules', 'lucide-static', 'icons');
const dest = join(root, 'public', 'icons');
await mkdir(dest,{recursive:true});
const names = ["clipboard","file-text","settings","plus","log-in","pencil","clipboard-paste","copy","refresh-cw","folder-open","folder","notebook-pen","info","x"];
await Promise.all(names.map(name=>copyFile(join(source,name+'.svg'),join(dest,name+'.svg'))));
const baseFavicon=await readFile(join(source,'clipboard.svg'),'utf8');
const adaptiveFavicon=baseFavicon.replace(/(<svg\b[^>]*>)/, tag=>tag+
  '<style>:root{color:#252525}@media (prefers-color-scheme:dark){:root{color:#f1f1f1}}</style>');
await writeFile(join(root,'public','favicon.svg'),adaptiveFavicon);
console.log('Installed '+names.length+' Lucide monochrome SVG icons for clipboard');
