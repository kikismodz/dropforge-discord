import fs from 'node:fs';
import { initialState } from '../server/data.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../server/drop-catalog.json', import.meta.url), 'utf8'));
const ids = initialState.cases.flatMap((caseDef) => caseDef.items || []).map((drop) => String(drop.id));
const missing = ids.filter((id) => !catalog[id]);
const generic = ids.filter((id) => !/^https?:\/\//i.test(String(catalog[id]?.image || '')));
const invalid = ids.filter((id) => !catalog[id]?.catalogId || !catalog[id]?.weapon || !catalog[id]?.name);

console.log(`[Skinova validate] ${ids.length - missing.length}/${ids.length} entrées présentes.`);
console.log(`[Skinova validate] ${ids.length - generic.length}/${ids.length} images canoniques.`);
console.log(`[Skinova validate] ${ids.length - invalid.length}/${ids.length} objets catalogués.`);
if (missing.length) console.log('IDs manquants:', missing.join(', '));
if (generic.length) console.log('Images non canoniques:', generic.join(', '));
if (invalid.length) console.log('Métadonnées incomplètes:', invalid.join(', '));
process.exit(missing.length || generic.length || invalid.length ? 1 : 0);
