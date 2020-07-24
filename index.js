/* eslint-disable no-underscore-dangle */
const js0xn = require('js0xn');
const { BitStream } = require('./src/bitstream');

const mmMessages = require('./schema/5gs-mmmessages-compiled.json');
const mmInfoElements = require('./schema/5gs-mminformationelements-compiled.json');
const smMessages = require('./schema/5gs-smmessages-compiled.json');
const smInfoElements = require('./schema/5gs-sminformationelements-compiled.json');
const cMessages = require('./schema/5gs-commonmessages-compiled.json');
const cInfoElements = require('./schema/5gs-commoninformationelements-compiled.json');

const _5GSM = 0x2E;
const _5GMM = 0x7E;
const PLAIN_5GS_NAS = 0;
const INTEGRITY_PROTECTED = 1;
const INTEGRITY_PROTECTED_CIPHERED = 2;
const NEW_5G_NAS_CONTEXT = 3;
const CIPHERED_NEW_5G_NAS_CONTEXT = 4;

const decoders = {
  INTEGER: (value) => value.readIntBE(0, value.length),
  NULL: () => true,
  ENUM: (value, ie) => {
    const itemValue = value.readIntBE(0, value.length);
    const item = ie.enum[itemValue.toString()];
    return item || itemValue;
  },
};

const encoders = {
  INTEGER: (value, ie) => new BitStream(`int:${ie.length}=${value}`),
  NULL: () => true,
  ENUM: (value, ie) => {
    const choice = parseInt(Object.keys(ie.enum).find((key) => ie.enum[key] === value), 10);
    return new BitStream(`uint:${ie.length}=${choice}`);
  },
};

function decodeInfoElement(stream, ie) {
  if (ie.pdu) {
    const ieSet = {};

    try {
      ie.pdu.forEach((elem) => {
        if (!elem._name) {
          throw new Error(`No _name found for element ${elem.name}`);
        }

        ieSet[elem._name] = decodeInfoElement(stream, elem);
      });
    } catch (Err) {
      return ieSet;
    }

    return ieSet;
  }

  let len = 0;

  if (ie.length && ie.length !== -1) {
    len = ie.length;
  } else if (ie.nBitLength) {
    len = decoders.INTEGER(stream.readBits(ie.nBitLength)) * 8;
  } else {
    len = -1;
  }

  const value = stream.readBits(len);

  if (!value.length) {
    throw new Error('STREAM_END_REACHED');
  }

  if (ie['@type'] === 'CHOICE') {
    const ieSet = {};
    const choice = value.readIntBE(0, value.length);
    const choiceElement = ie.elements.find((elem) => elem.tag === choice);

    if (!choiceElement) {
      throw new Error('UNAVAILABLE CHOICE VALUE');
    }

    ieSet[choiceElement._name] = decodeInfoElement(stream, choiceElement);

    return ieSet;
  }

  const decoder = decoders[ie.enum ? 'ENUM' : ie['@type']];

  return decoder ? decoder(value, ie) : value;
}

function decode5gsMessage(stream, messageType) {
  const msg = mmMessages.find((elem) => elem.code === messageType);
  const ieSet = {
    name: msg._name,
  };

  msg.mandatory.forEach((manIe) => {
    const manIeDef = mmInfoElements.find((elem) => elem._name === manIe._type);

    let len = 0;

    if (manIe.length && manIe.length !== -1) {
      len = manIe.length;
    } else if (manIe.nBitLength) {
      len = decoders.INTEGER(stream.readBits(manIe.nBitLength)) * 8;
    } else {
//      throw new Error(`Unknwon length IE: ${manIe.type}`);
      len = -1;
    }

    const ieStream = stream.slice(len);
    ieSet[manIeDef._name] = decodeInfoElement(ieStream, manIeDef);
  });

  let optIeTag;

  // eslint-disable-next-line no-cond-assign
  while ((optIeTag = stream.readBits(8)).length) {
    const optIe = msg.optional[decoders.INTEGER(optIeTag).toString(16).toUpperCase()];
    const optIeDef = mmInfoElements.find((elem) => elem._name === optIe._type);
    let len = 0;

    if (optIe.length) {
      len = optIe.length;
    } else if (optIe.nBitLength) {
      len = decoders.INTEGER(stream.readBits(optIe.nBitLength)) * 8;
    } else {
      throw new Error(`Unknown length attribute: ${optIe.type}`);
//      len = decoders.INTEGER(stream.readBits(8)) * 8;
    }

//    const ieStream = new BitStream(Buffer.from(stream.readBits(len)));
    const ieStream = stream.slice(len);
    ieSet[optIeDef._name] = decodeInfoElement(ieStream, optIeDef);
  }

  return ieSet;
}

function decode(buffer) {
  const stream = new BitStream(buffer);
  const extProtoDesc = stream.readBits(8)[0];

  if (extProtoDesc === _5GMM) {
    stream.move(4);
    const secHeader = stream.readBits(4)[0];

    if (secHeader === PLAIN_5GS_NAS) {
      const messageType = stream.readBits(8)[0];

      return decode5gsMessage(stream, messageType);
    }
  } else if (extProtoDesc === _5GSM) {
    throw new Error('5GSM messages not supported');
  }
}

function encodeInfoElement(payload, ieDef) {
  if (ieDef.pdu) {
    const stream = new BitStream();

    try {
      ieDef.pdu.forEach((elem) => {
        stream.append(encodeInfoElement(payload, elem));
      });
    } catch (Err) {
      return stream;
    }

    return stream;
  }

  if (ieDef['@type'] === 'CHOICE') {
    throw new Error('CHOICE Encoding not supported');
  }

  const encoder = encoders[ieDef.enum ? 'ENUM' : ieDef['@type']];

  return encoder ? encoder(payload[ieDef._name], ieDef) : new BitStream(payload[ieDef._name]);
}

function encode5gsMessage(payload, msgDef) {
  const stream = new BitStream();

  msgDef.mandatory.forEach((manIe) => {
    const manIeDef = mmInfoElements.find((elem) => elem._name === manIe._type);

    if (!manIeDef) {
      throw new Error(`Unknown IE: ${manIe._type}`);
    }

    if (manIe.length === -1) {
      throw new Error(`Unknown length for ${manIeDef._name}`);
    }

    const encIe = encodeInfoElement(payload[manIeDef._name], manIeDef);

    if (manIe.nBitLength) {
      stream.append(new BitStream(`uint:${manIe.nBitLength}=${Math.ceil(encIe.length() / 8)}`));
    }

    stream.append(encIe);
  });

  Object.keys(msgDef.optional).reduce((prev, optIeTag) => {
    if (!Object.keys(payload).find((payloadOptIe) => payloadOptIe === msgDef.optional[optIeTag]._type)) {
      return;
    }

    const optIeDef = mmInfoElements.find((elem) => elem._name === msgDef.optional[optIeTag]._type);

    if (!optIeDef) {
      throw new Error(`Unknown IE: ${msgDef.optional[optIeTag].type}`);
    }

    if (msgDef.optional[optIeTag].length === -1) {
      throw new Error(`Unknown length for ${msgDef.optional[optIeTag].type}`);
    }

    // Encoding IEI
    stream.append(new BitStream(`byte=${parseInt(optIeTag, 16)}`));
    const encIe = encodeInfoElement(payload[msgDef.optional[optIeTag]._type], optIeDef);

    if (msgDef.optional[optIeTag].nBitLength) {
      // Encoding LI
      stream.append(new BitStream(`uint:${msgDef.optional[optIeTag].nBitLength}=${Math.ceil(encIe.length() / 8)}`));
    }

    // Adding IE Value part
    stream.append(encIe);
  }, 0);

  return stream;
}

function encode(payload) {
  const message = mmMessages.find((msg) => msg._name === payload.name);

  if (!message) {
    throw new Error('Uknown message type');
  }

  const messageType = _5GMM;
  const stream = new BitStream(`byte=${messageType}`); // EPD

  if (payload.securityContext) {
    throw new Error('Integrity protection not supported');
  } else {
    stream.append(new BitStream(`byte=${PLAIN_5GS_NAS}`));
  }

  if (messageType === _5GMM) {
    stream.append(new BitStream(`byte=${message.code}`));
  } else {
    throw new Error('5GS Session Menagement messages not supported');
  }

  stream.append(encode5gsMessage(payload, message));

  return stream;
}

module.exports = Object.freeze({
  name: 'nas_parser',
  decode,
  encode,
});
