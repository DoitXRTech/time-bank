import { inflateRawSync } from 'node:zlib';

// An .xlsx is a zip. These limits keep a hostile or corrupt file from exhausting memory.
const MAX_ENTRIES = 500;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

function findEndOfCentralDirectory(buffer) {
  // The record is 22 bytes plus an optional comment (up to 65535 bytes) at the very end
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let position = buffer.length - 22; position >= earliest; position -= 1) {
    if (buffer.readUInt32LE(position) === END_OF_CENTRAL_DIRECTORY) return position;
  }
  throw new Error('Not a zip file (end of central directory not found)');
}

/**
 * Minimal zip reader: stored and deflated entries only (what spreadsheet exports use).
 * @param {Buffer} buffer the whole file
 * @returns {Map<string, Buffer>} file name -> contents
 */
export function readZip(buffer) {
  const endRecord = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endRecord + 10);
  if (entryCount > MAX_ENTRIES) throw new Error('Zip has too many entries');

  const files = new Map();
  let totalBytes = 0;
  let position = buffer.readUInt32LE(endRecord + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(position) !== CENTRAL_DIRECTORY_ENTRY) throw new Error('Corrupt zip (central directory)');

    const method = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localHeaderOffset = buffer.readUInt32LE(position + 42);
    const name = buffer.toString('utf8', position + 46, position + 46 + nameLength);
    position += 46 + nameLength + extraLength + commentLength;

    totalBytes += uncompressedSize;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error('Zip is too large when uncompressed');
    if (name.endsWith('/')) continue;

    if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER) throw new Error('Corrupt zip (local header)');
    const dataStart = localHeaderOffset + 30 + buffer.readUInt16LE(localHeaderOffset + 26) + buffer.readUInt16LE(localHeaderOffset + 28);
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === METHOD_STORED) files.set(name, Buffer.from(data));
    else if (method === METHOD_DEFLATE) files.set(name, inflateRawSync(data, { maxOutputLength: MAX_TOTAL_UNCOMPRESSED_BYTES }));
    else throw new Error(`Unsupported zip compression method ${method}`);
  }
  return files;
}
