/* eslint-disable no-bitwise */
class BitStream {
  constructor(value, length) {
    const adjustBuff = (arg, len) => {
      const shift = 8 - (len % 8 || 8);
      const argArray = [...arg].slice(-1 * Math.ceil(len / 8));

      if (shift) {
        const spareBits = (2 ** 8) - (2 ** (8 - shift));
        let carry = 0;

        argArray.reduceRight((prev, cur, idx) => {
          const tmp = cur & spareBits;
          cur <<= shift;
          cur &= 0xff;
          argArray[idx] = cur | (carry >> (8 - shift));
          carry = tmp;
        }, 0);
      }

      if (argArray.length > 0) {
        this.buf = Buffer.from(argArray);
      }

      this.len += len;
    };

    this.bitPos = 0;
    this.len = 0;

    if (!value) {
      this.buf = Buffer.from([]);

      return;
    }

    if (value instanceof Buffer) {
      this.buf = value;
      this.len = length || this.buf.length * 8;

      return;
    }

    const regex = /^([\w]+)(?::([\d]+))?=([\w]+)$/g;
    const match = regex.exec(value);

    switch (match[1]) {
      case 'hex': {
        if (match[2]) {
          throw new Error('hex type can\'t have bit length');
        }

        adjustBuff(Buffer.from(match[3], 'hex'), match[3].length * 4); // Every two character represent a byte in hexadecimal

        break;
      }
      case 'byte': {
        if (match[2]) {
          throw new Error('byte type is always 8 bits');
        }

        const tempBuff = Buffer.allocUnsafe(1);
        tempBuff.writeUInt8(parseInt(match[3], 10));
        adjustBuff(tempBuff, 8);

        break;
      }
      case 'int': {
        const tempBuff = Buffer.allocUnsafe(4);
        tempBuff.writeInt32BE(parseInt(match[3], 10));
        adjustBuff(tempBuff, parseInt(match[2], 10) || 32);

        break;
      }
      case 'uint': {
        const tempBuff = Buffer.allocUnsafe(4);
        tempBuff.writeUInt32BE(parseInt(match[3], 10));
        adjustBuff(tempBuff, parseInt(match[2], 10) || 32);

        break;
      }

      default:
        throw new TypeError('Type not supported');
    }
  }

  length() {
    // returns length in bits
    return this.len;
  }

  move(len) {
    this.bitPos += len;

    if (this.bitPos < 0 || this.bitPos > this.len) {
      this.bitPos -= len;
      throw new Error('OUT_OF_RANGE');
    }
  }

  // Will read the Buffer and return a Uint8Array which is right alligned
  readBits(bitLen) {
    if (bitLen === -1) {
      // eslint-disable-next-line no-param-reassign
      bitLen = this.buf.length * 8 - this.bitPos;
    }

    const startByte = Math.floor(this.bitPos / 8);
    const startOffset = this.bitPos % 8;
    const byteLen = Math.ceil((startOffset + bitLen) / 8);

    const readBuf = Uint8Array.prototype.slice.call(this.buf, startByte, startByte + byteLen);

    if (!readBuf.length) {
      return readBuf;
    }

    if (startOffset) {
      readBuf[0] &= 2 ** (8 - startOffset) - 1;
    }

    let endPos = 0;
    // eslint-disable-next-line no-cond-assign
    if (endPos = (startOffset + bitLen) % 8) {
      let carry = 0;
      let tmp = 0;
      const spareBits = 2 ** (8 - endPos);

      readBuf[readBuf.length - 1] &= 2 ** 8 - spareBits;
      // Shifting the whole array to right so it starts from octet boundary
      readBuf.reduce((prev, cur, idx) => {
        tmp = cur & spareBits - 1;
        cur >>= (8 - endPos);
        readBuf[idx] = cur | (carry << endPos);
        carry = tmp;
      }, 0);
    }

    this.bitPos += bitLen;

    return readBuf.slice(-1 * Math.ceil(bitLen / 8));
  }

  // Will read buffer and return a BitStream which is left alligned
  slice(bitLen) {
    const startByte = Math.floor(this.bitPos / 8);
    const startOffset = this.bitPos % 8;
    const byteLen = Math.ceil((this.bitPos + bitLen) / 8);

    const readBuf = Uint8Array.prototype.slice.call(this.buf, startByte, byteLen);

    if (!readBuf.length) {
      return new BitStream();
    }

    if (!startOffset) {
      this.bitPos += bitLen;
      return new BitStream(Buffer.from(readBuf), bitLen);
    }

    const spareBits = 2 ** 8 - 2 ** (8 - startOffset);
    let carry = 0;

    readBuf.reduceRight((prev, cur, idx) => {
      const tmp = cur & spareBits;
      cur <<= startOffset;
      readBuf[idx] = cur | (carry >> (8 - startOffset));
      carry = tmp;
    }, 0);

    this.bitPos += bitLen;
    return new BitStream(Buffer.from(readBuf), bitLen);
  }

  append(stream) {
    const adjustBuff = (arg, len) => {
      const shift = this.len % 8;
      const argArray = [...arg].slice(0, Math.ceil(len / 8));
      let carry = 0;
      let tmp = 0;

      if (shift > 0) {
        // shift right
        const spareBits = 2 ** shift;
        argArray.reduce((prev, cur, idx) => {
          tmp = cur & spareBits - 1;
          cur >>= shift;
          argArray[idx] = cur | (carry << 8 - shift);
          carry = tmp;
        }, 0);

//        if (shift + len > 8) {
        const lenOverflow = len % 8;

        if (8 - lenOverflow < shift || !lenOverflow) {
          argArray.push(carry << 8 - shift);
        }
      }

      let appendOffset = 0;

      if (shift) {
        this.buf[this.buf.length - 1] |= argArray[0];
        appendOffset = 1;
      }

      if (argArray.length > appendOffset) {
        const temp = argArray.slice(appendOffset);
        this.buf = Buffer.concat([this.buf, Buffer.from(temp)]);
      }

      this.len += len;
    };

    adjustBuff(stream.buf, stream.length());
  }
}

module.exports = Object.freeze({
  BitStream,
});
