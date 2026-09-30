import 'server-only';

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATABASE_DIRECTORY } from './server-database';

export interface AttachmentFileStore {
  has(key: string): boolean;
  read(key: string): Buffer | null;
  writeNew(key: string, bytes: Uint8Array): void;
  remove(key: string): void;
}

const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}(?:-thumb)?\.(?:webp|pdf)$/;

class NodeAttachmentFileStore implements AttachmentFileStore {
  private readonly directory = join(DATABASE_DIRECTORY, 'attachments');

  private path(key: string) {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error('شناسه فایل پیوست معتبر نیست.');
    return join(this.directory, key);
  }

  has(key: string) {
    return existsSync(this.path(key));
  }

  read(key: string) {
    const path = this.path(key);
    return existsSync(path) ? readFileSync(path) : null;
  }

  writeNew(key: string, bytes: Uint8Array) {
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path(key), bytes, { flag: 'wx' });
  }

  remove(key: string) {
    const path = this.path(key);
    if (existsSync(path)) unlinkSync(path);
  }
}

export const attachmentFileStore: AttachmentFileStore = new NodeAttachmentFileStore();
