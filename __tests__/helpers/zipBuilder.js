import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Builds a real zip file in memory, so the zip/xlsx readers are tested against the actual format.
 * @param {Record<string, string|Buffer>} files file name -> contents
 * @param {{ stored?: boolean }} [options] `stored: true` writes without compression
 */
export function createZip(files, { stored = false } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const compressed = stored ? data : deflateRawSync(data);
    const nameBuffer = Buffer.from(name, 'utf8');
    const checksum = crc32(data);
    const method = stored ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    parts.push(local, nameBuffer, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  });

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, centralBuffer, end]);
}
