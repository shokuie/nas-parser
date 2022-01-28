const { aesCmac } = require('node-aes-cmac');

const security = exports;

const IA2_128 = (keyNasInt, count, bearer, dir, message) => {
  // eslint-disable-next-line no-bitwise
  const msg = Buffer.concat([count, Buffer.from([((bearer << 3) | ((dir & 0x01) << 2)) & 0xfc, 0, 0, 0]), message]);

  console.log(`msg: ${msg.toString('hex')}`);
  console.log(`keyNasInt: ${keyNasInt.toString('hex')}`);
  console.log(`count: ${count.toString('hex')}`);
  console.log(`bearer: ${bearer.toString('hex')}`);
  console.log(`dir: ${dir.toString('hex')}`);
  const ret = aesCmac(keyNasInt, msg, {
    returnAsBuffer: true,
  });

  console.log(`AES-CMAC: ${ret.toString('hex')}`);

  return ret.slice(0, 4);
};

security.calculateMac = (options, message) => {
  const { cipheringAlg, intAlg, count, bearer, dir } = options;
  let { keyNasInt } = options;

  if (keyNasInt.length > 16) {
    keyNasInt = keyNasInt.slice(-16);
  }

  if (count.length !== 4) {
    throw new Error('Expectin count length to be 4 bytes');
  }

  if (message.length === 0) {
    throw new Error('Empty NAS payload provided');
  }

/*  if (cipheringAlg && cipheringAlg !== '5gea0') {
    throw new Error(`Ciphering algorithm (${cipheringAlg}) not supported`);
  }
*/
  let mac;

  switch (intAlg.toUpperCase()) {
    case '5GIA0':
      mac = Buffer.from('00000000', 'hex');
      break;

    case '1285GIA2':
      mac = IA2_128(keyNasInt, count, bearer, dir, message);
      break;

    default:
      throw new Error(`Algorithm (${intAlg}) not supported`);
  }

  return mac;
};
