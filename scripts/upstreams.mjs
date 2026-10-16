import fs from 'node:fs';
const registry = JSON.parse(fs.readFileSync(new URL('../registry/upstreams.json',import.meta.url),'utf8'));
for (const item of registry.repositories) console.log(`${item.upstream}\t${item.fork || 'sem fork verificado'}\t${item.integration}`);
