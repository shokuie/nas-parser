const { aesCmac } = require('node-aes-cmac');

const security = exports;

security.calculateMac = (options, message) => {
  const { cipheringAlg, intAlg, keyNasInt, count, bearer, dir } = options;

  if (keyNasInt.length !== 16) {
    throw new Error('Expectin NAS Integrity key length of 128 bits');
  }

  if (count.length !== 4) {
    throw new Error('Expectin count length to be 4 bytes');
  }

  if (message.length === 0) {
    throw new Error('Empty NAS payload provided');
  }

  if (cipheringAlg && cipheringAlg !== '5gea0') {
    throw new Error(`Ciphering algorithm (${cipheringAlg}) not supported`);
  }

  let mac;

  switch (intAlg) {
    case '1285GIA2': {
      // eslint-disable-next-line no-bitwise
      const msg = Buffer.concat([count, Buffer.from([((bearer << 3) | (dir << 2)) & 0xff, 0, 0, 0]), message]);
      mac = aesCmac(keyNasInt, msg, {
        returnAsBuffer: true,
      }).slice(0, 4);
    }
      break;

    default:
      throw new Error(`Algorithm (${intAlg}) not supported`);
  }

  return mac;
};
