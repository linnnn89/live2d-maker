import { readFileSync, writeFileSync } from 'node:fs';
import { compile } from 'json-schema-to-typescript';

const source = new URL('../../schemas/studio/protocol.schema.json', import.meta.url);
const target = new URL('../src/protocol/generated.ts', import.meta.url);
const schema = JSON.parse(readFileSync(source, 'utf8'));
const types = await compile(schema, 'StudioProtocol', {
  bannerComment: '// Generated from schemas/studio/protocol.schema.json; run npm run protocol:generate.',
  unreachableDefinitions: true, additionalProperties: false, ignoreMinAndMaxItems: true,
});
const output = types + '\nexport const protocolSchema = ' + JSON.stringify(schema) + ' as const;\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== output.replaceAll('\r\n', '\n')) {
    throw new Error('Studio protocol output is stale; run npm run protocol:generate');
  }
} else writeFileSync(target, output);
