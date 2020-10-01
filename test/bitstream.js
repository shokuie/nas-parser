const { expect } = require('chai');

const { BitStream } = require('../src/bitstream');

describe('#sum()', () => {
  const st = new BitStream(Buffer.from('7e84ff71ff5798ff', 'hex'));

  context('reading single byte', () => {
    it('should return 0x7e', () => {
      expect(st.readBits(8)).to.deep.equal(Buffer.from('7e', 'hex'));
    });
  });

  context('reading high nibble', () => {
    it('should return 0x08', () => {
      expect(st.readBits(4)).to.deep.equal(Buffer.from('08', 'hex'));
    });
  });

  context('reading low nibble', () => {
    it('should return 0x04', () => {
      expect(st.readBits(4)).to.deep.equal(Buffer.from('04', 'hex'));
    });
  });

  context('reading 2 bits from pos:0 ', () => {
    it('should return 0x03', () => {
      expect(st.readBits(2)).to.deep.equal(Buffer.from('03', 'hex'));
    });
  });

  context('reading 3 bits from pos:2 ', () => {
    it('should return 0x07', () => {
      expect(st.readBits(3)).to.deep.equal(Buffer.from('07', 'hex'));
    });
  });

  context('reading 3 bits from pos:5 ', () => {
    it('should return 0x07', () => {
      expect(st.readBits(3)).to.deep.equal(Buffer.from('07', 'hex'));
    });
  });

  context('reading two bytes ', () => {
    it('should return 0x71ff', () => {
      expect(st.readBits(16)).to.deep.equal(Buffer.from('71ff', 'hex'));
    });
  });

  context('reading 17 bits from pos:2 ', () => {
    it('should return 0x00BCC7', () => {
      st.move(2);
      expect(st.readBits(17)).to.deep.equal(Buffer.from('00BCC7', 'hex'));
    });
  });

  context('Constructing 1 byte', () => {
    it('should return 30', () => {
      const testStream = new BitStream('byte=30');
      expect(testStream.readBits(8)).to.deep.equal(Buffer.from([30]));
    });
  });

  context('Appending 1 byte', () => {
    it('should return 195', () => {
      const testStream = new BitStream('uint:2=3');
      testStream.append(new BitStream('byte=15'));
      expect(testStream.readBits(8)).to.deep.equal(Buffer.from([195]));
    });
  });

  context('Appending hex string', () => {
    it('should return 0x3ff', () => {
      const testStream = new BitStream('uint:10=1023');
      expect(testStream.readBits(10)).to.deep.equal(Buffer.from('03ff', 'hex'));
    });
  });

  context('Appending hex string', () => {
    it('should return 0xeffe', () => {
      const testStream = new BitStream('uint:4=14');
      testStream.append(new BitStream('hex=ffeeddccbbaa01ff'));
      expect(testStream.readBits(16)).to.deep.equal(Buffer.from('effe', 'hex'));
    });
  });

  context('Appending uint string', () => {
    it('should return ffffffff with length of 32 bits', () => {
      const testStream = new BitStream('uint:4=15');
      testStream.append(new BitStream('uint:28=268435455'));
      expect(testStream.length()).to.equal(32);
      expect(testStream.buf.length * 8).to.equal(testStream.length());
      expect(testStream.readBits(32)).to.deep.equal(Buffer.from('ffffffff', 'hex'));
    });
  });

  context('Appending uint string', () => {
    it('should return fffffff8 with length of 29 bits', () => {
      const testStream = new BitStream('uint:1=1');
      testStream.append(new BitStream('uint:28=268435455'));
      expect(testStream.length()).to.equal(29);
      expect(testStream.buf.length).to.equal(4);
      expect(testStream.readBits(32)).to.deep.equal(Buffer.from('fffffff8', 'hex'));
    });
  });

  context('Appending uint string', () => {
    it('should return f0f with length of 12 bits', () => {
      const testStream = new BitStream('uint:4=15');
      testStream.append(new BitStream('byte=15'));
      expect(testStream.length()).to.equal(12);
      expect(testStream.buf.length).to.equal(2);
      expect(testStream.readBits(12)).to.deep.equal(Buffer.from('0f0f', 'hex'));
    });
  });

  context('Appending uint', () => {
    it('should return 226', () => {
      const testStream = new BitStream('uint:6=56');
      testStream.append(new BitStream('uint=2684420094'));
      expect(testStream.readBits(8)).to.deep.equal(Buffer.from([226]));
    });
  });

  context('Appending 3 bits', () => {
    it('should return 0x25', () => {
      const testStream = new BitStream();
      testStream.append(new BitStream('uint:3=4'));
      testStream.append(new BitStream('uint:3=5'));
      expect(testStream.length()).to.equal(6);
      expect(testStream.readBits(6)).to.deep.equal(Buffer.from([0x25]));
    });
  });

  context('Appending 10 bits', () => {
    it('should return 0x25', () => {
      const testStream = new BitStream();
      testStream.append(new BitStream('uint:3=7'));
      testStream.append(new BitStream('uint:10=1023'));
      expect(testStream.readBits(8)).to.deep.equal(Buffer.from([0xff]));
    });
  });
});
