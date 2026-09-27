/**
 * 最小 BSON 解析器 — 零依賴，只支援 mongodump 輸出會用到的型別。
 *
 * 為什麼自己寫：匯入 fixture 是一次性的離線工作，不值得為它在 package.json
 * 長期背一個 bson 依賴；而 BSON 的格式本身很單純（長度前綴 + type-tag 元素），
 * 用不到 100 行就能讀完 mongodump 的 .bson 檔。
 *
 * 給 C++ 開發者的類比：這就是手刻的二進位反序列化——讀 4-byte little-endian
 * 長度、逐個欄位讀 type tag 與 null-terminated 名稱，再依型別讀值。
 *
 * mongodump 的 .bson 檔是「多份文件直接串接」，沒有外層容器。
 */

/**
 * 逐份讀出 .bson 檔中的文件。
 * @param {Buffer} buf
 * @param {{onDoc: (doc: object, index: number) => void, maxDocs?: number}} options
 * @returns {number} 讀到的文件數
 */
export function readDocuments(buf, { onDoc, maxDocs = Infinity } = {}) {
  let offset = 0;
  let count = 0;

  while (offset < buf.length && count < maxDocs) {
    const length = buf.readInt32LE(offset);
    if (length <= 0 || offset + length > buf.length) break;

    onDoc(parseDocument(buf, offset), count);
    offset += length;
    count++;
  }

  return count;
}

function parseDocument(buf, start) {
  const length = buf.readInt32LE(start);
  const end = start + length - 1; // 最後一個 byte 是文件結尾的 0x00
  let cursor = start + 4;
  const doc = {};

  while (cursor < end) {
    const type = buf[cursor++];
    if (type === 0) break;

    // 欄位名稱是 null-terminated 字串
    let nameEnd = cursor;
    while (buf[nameEnd] !== 0) nameEnd++;
    const name = buf.toString("utf8", cursor, nameEnd);
    cursor = nameEnd + 1;

    const [value, next] = parseValue(buf, cursor, type);
    doc[name] = value;
    cursor = next;
  }

  return doc;
}

function parseValue(buf, p, type) {
  switch (type) {
    case 0x01: // double
      return [buf.readDoubleLE(p), p + 8];
    case 0x02: {
      // string：int32 長度（含結尾 null）+ 內容
      const size = buf.readInt32LE(p);
      return [buf.toString("utf8", p + 4, p + 4 + size - 1), p + 4 + size];
    }
    case 0x03: {
      // embedded document
      const size = buf.readInt32LE(p);
      return [parseDocument(buf, p), p + size];
    }
    case 0x04: {
      // array：本質是 key 為 "0","1",... 的文件
      const size = buf.readInt32LE(p);
      return [Object.values(parseDocument(buf, p)), p + size];
    }
    case 0x05: {
      // binary：int32 長度 + 1 byte subtype + 內容
      const size = buf.readInt32LE(p);
      return [buf.subarray(p + 5, p + 5 + size), p + 5 + size];
    }
    case 0x07: // ObjectId
      return [buf.toString("hex", p, p + 12), p + 12];
    case 0x08: // boolean
      return [buf[p] === 1, p + 1];
    case 0x09: // UTC datetime
      return [new Date(Number(buf.readBigInt64LE(p))), p + 8];
    case 0x0a: // null
      return [null, p];
    case 0x10: // int32
      return [buf.readInt32LE(p), p + 4];
    case 0x11: // timestamp
      return [buf.readBigUInt64LE(p), p + 8];
    case 0x12: // int64
      return [Number(buf.readBigInt64LE(p)), p + 8];
    default:
      throw new Error(
        `不支援的 BSON 型別 0x${type.toString(16)}（位移 ${p}）— 需要時再補上`,
      );
  }
}
