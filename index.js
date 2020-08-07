/* eslint-disable no-underscore-dangle */
const js0xn = require('js0xn');
const { BitStream } = require('./src/bitstream');

const _5GMM = '5gsMobilityManagementMessages';
const _5GSM = '5gsSessionManagementMessages';
const messages = {};
const elements = {};

messages[_5GMM] = require('./schema/5gs-mmmessages-compiled.json');
elements[_5GMM] = require('./schema/5gs-mminformationelements-compiled.json');
messages[_5GSM] = require('./schema/5gs-smmessages-compiled.json');
elements[_5GSM] = require('./schema/5gs-sminformationelements-compiled.json');
const cMessages = require('./schema/5gs-commonmessages-compiled.json');
const cInfoElements = require('./schema/5gs-commoninformationelements-compiled.json');

const PLAIN_5GS_NAS = 0;
const INTEGRITY_PROTECTED = 1;
const INTEGRITY_PROTECTED_CIPHERED = 2;
const NEW_5G_NAS_CONTEXT = 3;
const CIPHERED_NEW_5G_NAS_CONTEXT = 4;

const decoders = {
  INTEGER: (value) => value.readIntBE(0, value.length),
  UINT: (value) => value.readUIntBE(0, value.length),
  NULL: () => true,
  ENUM: (value, ie) => {
    const itemValue = value.readUIntBE(0, value.length);
    const item = ie.enum[itemValue.toString()];
    return item || itemValue;
  },
};

const encoders = {
  INTEGER: (value, ie) => new BitStream(`int:${ie.length}=${value}`),
  UINT: (value, ie) => new BitStream(`uint:${ie.length}=${value}`),
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
    len = decoders.UINT(stream.readBits(ie.nBitLength)) * 8;
  } else {
    len = -1;
  }

  const value = stream.readBits(len);

  if (!value.length) {
    throw new Error('STREAM_END_REACHED');
  }

  if (ie['@type'] === 'CHOICE') {
    const ieSet = {};
    const choice = value.readUIntBE(0, value.length);
    const choiceElement = ie.elements.find((elem) => elem.tag === choice);

    if (!choiceElement) {
      throw new Error('UNAVAILABLE CHOICE VALUE');
    }

    ieSet[choiceElement._name] = decodeInfoElement(stream, choiceElement);

    return ieSet;
  } else if (ie['@type'] === 'MESSAGE') {
    return decode(value);
  }

  const decoder = decoders[ie.enum ? 'ENUM' : ie['@type']];

  return decoder ? decoder(value, ie) : value;
}

function decode5gsMessage(stream, messageName, type) {
  const msg = messages[type].find((elem) => elem._name === messageName);

  if (!msg) {
    throw new Error(`'${messageName}' is not a known MM message`);
  }

  const ieSet = {
    messageName: msg._name,
  };

  msg.mandatory.forEach((manIe) => {
    const manIeDef = elements[type].find((elem) => elem._name === manIe._type);

    let len = 0;

    if (manIe.length && manIe.length !== -1) {
      len = manIe.length;
    } else if (manIe.nBitLength) {
      len = decoders.UINT(stream.readBits(manIe.nBitLength)) * 8;
    } else {
//      throw new Error(`Unknwon length IE: ${manIe.type}`);
      len = -1;
    }

    const ieStream = stream.slice(len);
    ieSet[manIeDef._name] = decodeInfoElement(ieStream, manIeDef);
  });

  let optIeTag;

  // eslint-disable-next-line no-cond-assign
  while ((optIeTag = stream.readBits(4)).length) {
    //  while ((optIeTag = stream.readBits(8)).length) {
    let tag = decoders.UINT(optIeTag);
    let optIe = msg.optional[tag.toString(16).toUpperCase()];

    if (!optIe) {
      // eslint-disable-next-line no-bitwise
      tag = (tag << 4) | decoders.UINT(stream.readBits(4));
      optIe = msg.optional[tag.toString(16).toUpperCase()];
    }

    if (!optIe) {
      throw new Error(`Unknwon IE received: ${tag.toString(16).toUpperCase()}`);
    }

    const optIeDef = elements[type].find((elem) => elem._name === optIe._type);
    let len = 0;

    if (optIe.length && optIe.length !== -1) {
      len = optIe.length;
    } else if (optIe.nBitLength) {
      len = decoders.UINT(stream.readBits(optIe.nBitLength)) * 8;
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
  let stream;

  if (buffer instanceof Buffer) {
    stream = new BitStream(buffer);
  } else {
    stream = buffer;
  }

  const ieSet = {};

  ieSet.extendedProtocolDiscriminator = decodeInfoElement(stream,
    cInfoElements.find((elem) => elem._name === 'extendedProtocolDiscriminator'));

  if (ieSet.extendedProtocolDiscriminator.extendedProtocolDiscriminatorValue === _5GMM) {
    stream.move(4); // Bypass spare half octet

    ieSet.securityHeaderType = decodeInfoElement(stream,
      elements[_5GMM].find((elem) => elem._name === 'securityHeaderType'));

    if (ieSet.securityHeaderType.securityHeaderTypeValue === 'plainNasMessageNotSecurityProtected') {
      ieSet.messageName = decodeInfoElement(stream,
        cInfoElements.find((elem) => elem._name === 'messageType'));

      if (!ieSet.messageName) {
        throw new Error('Unknown MM message');
      }

      return Object.assign(ieSet, decode5gsMessage(stream, ieSet.messageName.messageTypeValue, _5GMM));
    }

    ieSet.messageAuthenticationCode = decodeInfoElement(stream,
      elements[_5GMM].find((elem) => elem._name === 'messageAuthenticationCode'));
    ieSet.sequenceNumber = decodeInfoElement(stream,
      elements[_5GMM].find((elem) => elem._name === 'sequenceNumber'));

    return Object.assign(ieSet, decode(stream));
  }

  if (ieSet.extendedProtocolDiscriminator.extendedProtocolDiscriminatorValue === _5GSM) {
    ieSet.pduSessionIdentity = decodeInfoElement(stream,
      elements[_5GSM].find((elem) => elem._name === 'pduSessionIdentity'));

    ieSet.procedureTransactionIdentity = decodeInfoElement(stream,
      elements[_5GSM].find((elem) => elem._name === 'procedureTransactionIdentity'));

    ieSet.messageName = decodeInfoElement(stream,
      cInfoElements.find((elem) => elem._name === 'messageType'));

    if (!ieSet.messageName) {
      throw new Error('Unknown SM message');
    }

    return Object.assign(ieSet, decode5gsMessage(stream, ieSet.messageName.messageTypeValue, _5GSM));
  }

  throw new Error('Invalid extended protocol discriminator');
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
  const message = mmMessages.find((msg) => msg._name === payload.messageName);

  if (!message) {
    throw new Error('Uknown message type');
  }

  const messageType = _5GMM;
  const stream = new BitStream(`byte=${messageType}`); // EPD

  if (payload.securityHeaderType) {
    stream.append(new BitStream(`byte=${payload.securityHeaderType & 0x0f}`));
  } else {
    stream.append(new BitStream(`byte=${PLAIN_5GS_NAS}`));
  }

  if (messageType === _5GMM) {
    stream.append(new BitStream(`byte=${message.code}`));
  } else {
    throw new Error('5GS Session Menagement messages not supported');
  }

  stream.append(encode5gsMessage(payload, message));

  return stream.buf;
}

module.exports = Object.freeze({
  name: 'nas_parser',
  decode,
  encode,
});
