import { processImport, type ImportJob } from './importTasks';
import { errorDetail } from '../protocol';

self.onmessage = async (event: MessageEvent<ImportJob>) => {
  try {
    const value = await processImport(event.data);
    self.postMessage({ ok: true, value }, value instanceof Uint8Array ? { transfer: [value.buffer as ArrayBuffer] } : {});
  } catch (error) {
    self.postMessage({ ok: false, error: errorDetail(error, 'ASSET_FORMAT', 'import') });
  }
};
