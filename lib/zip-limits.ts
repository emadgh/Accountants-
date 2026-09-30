export type ZipInspection =
  | { ok: true; expandedBytes: number }
  | { ok: false; reason: 'invalid' | 'too-many-entries' | 'too-large' };

function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/** Inspect ZIP central-directory sizes before an inflater allocates expanded entries. */
export function inspectZipArchive(bytes: Uint8Array, maxExpandedBytes: number, maxEntries = 10_000): ZipInspection {
  const minEndRecordOffset = Math.max(0, bytes.length - 22 - 65_535);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minEndRecordOffset; offset -= 1) {
    if (u32(bytes, offset) === 0x06054b50 && offset + 22 + u16(bytes, offset + 20) === bytes.length) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) return { ok: false, reason: 'invalid' };

  const diskNumber = u16(bytes, endOffset + 4);
  const centralDisk = u16(bytes, endOffset + 6);
  const entriesOnDisk = u16(bytes, endOffset + 8);
  const entryCount = u16(bytes, endOffset + 10);
  const directorySize = u32(bytes, endOffset + 12);
  const directoryOffset = u32(bytes, endOffset + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    return { ok: false, reason: 'invalid' };
  }
  if (entryCount > maxEntries) return { ok: false, reason: 'too-many-entries' };
  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd !== endOffset || directoryEnd > bytes.length) return { ok: false, reason: 'invalid' };

  let cursor = directoryOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > directoryEnd || u32(bytes, cursor) !== 0x02014b50) return { ok: false, reason: 'invalid' };
    const uncompressedSize = u32(bytes, cursor + 24);
    const filenameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const startDisk = u16(bytes, cursor + 34);
    if (uncompressedSize === 0xffffffff || startDisk !== 0) return { ok: false, reason: 'invalid' };
    cursor += 46 + filenameLength + extraLength + commentLength;
    if (cursor > directoryEnd) return { ok: false, reason: 'invalid' };
    expandedBytes += uncompressedSize;
    if (expandedBytes > maxExpandedBytes) return { ok: false, reason: 'too-large' };
  }
  if (cursor !== directoryEnd) return { ok: false, reason: 'invalid' };
  return { ok: true, expandedBytes };
}
