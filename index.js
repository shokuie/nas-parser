/* eslint-disable no-underscore-dangle */
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
  SPARE: (value, ie) => new BitStream(`uint:${ie.length}=${ie.value}`),
};

function decodeInfoElement(stream, ie) {
  if (ie['@type'] === 'IE') {
    const ieSet = {};
    const ieId = decoders.UINT(stream.readBits(ie.idLength || 8));

    if (!ieId) {
      throw new Error(`Unknown SM IE received: ${ie.name}`);
    }

    const optIeDef = elements[_5GSM].find((elem) => elem._name === ie._name);
    let len = 0;

    if (ie.length && ie.length !== -1) {
      len = ie.length;
    } else if (ie.nBitLength) {
      len = decoders.UINT(stream.readBits(ie.nBitLength)) * 8;
    } else {
      throw new Error(`Unknown length attribute: ${ie.name}`);
    }

    const ieStream = stream.slice(len);
    ieSet[ieId.toString(10).toUpperCase()] = decodeInfoElement(ieStream, optIeDef);

    return ieSet;
  }

  let itemCounter = 0;
  const multiIeSet = [];

  while (ie['@type'] === 'MULTI') {
    if (stream.bitPos >= stream.length() || (ie.contentLength && itemCounter <= decoders.UINT(stream.readBits(ie.contentLength)))) {
      return multiIeSet;
    }

    multiIeSet.push(decodeInfoElement(stream, { pdu: ie.pdu }));
    itemCounter += 1;
  }

  if (ie['@type'] === 'LIST') {
    const ieList = [];
    const noListItems = decoders.UINT(stream.readBits(ie.numberLength));
    let cnt = 0;

    while (cnt < noListItems) {
      cnt += 1;
      ieList.push(decodeInfoElement(stream, { pdu: ie.pdu }));
    }

    return ieList;
  }

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
  }

  if (ie['@type'] === 'MESSAGE') {
    return decode(value);
  }

  const decoder = decoders[ie.enum ? 'ENUM' : ie['@type']];

  return decoder ? decoder(value, ie) : value;
}

function decode5gsMessage(stream, messageName, type) {
  const ieSet = {};
  const msg = messages[type].find((elem) => elem._name === messageName);

  if (!msg) {
    throw new Error(`'${messageName}' is not a known MM message`);
  }

  ieSet[type === _5GMM ? 'mmMessageName' : 'messageName'] = msg._name;

  msg.mandatory.forEach((manIe) => {
    const manIeDef = elements[type].find((elem) => elem._name === manIe._type);

    let len = 0;

    if (manIe.length === -1) {
      throw new Error(`IE with -1 length encountered: ${manIe.type}`);
    }

    if (manIe.length && manIe.length !== -1) {
      len = manIe.length;
    } else if (manIe.nBitLength) {
      len = decoders.UINT(stream.readBits(manIe.nBitLength)) * 8;
    } else {
//      throw new Error(`Unknwon length IE: ${manIe.type}`);
      len = -1;
    }

    const ieStream = stream.slice(len);
//    ieSet[manIeDef._name] = decodeInfoElement(ieStream, manIeDef);
    ieSet[manIe._name] = decodeInfoElement(ieStream, manIeDef);
  });

  let optIeTag;

  // eslint-disable-next-line no-cond-assign
  while ((optIeTag = stream.readBits(4)).length) {
    //  while ((optIeTag = stream.readBits(8)).length) {
    let tag = decoders.UINT(optIeTag);
//    let optIe = msg.optional[tag.toString(16).toUpperCase()];
    let optIe = msg.optional.find((elem) => elem.iei === tag);

    if (!optIe) {
      // eslint-disable-next-line no-bitwise
      tag = (tag << 4) | decoders.UINT(stream.readBits(4));
//      optIe = msg.optional[tag.toString(16).toUpperCase()];
      optIe = msg.optional.find((elem) => elem.iei === tag);
    }

    if (!optIe) {
      throw new Error(`Unknown IE received: ${tag.toString(16).toUpperCase()}`);
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
    ieSet[optIe._name] = decodeInfoElement(ieStream, optIeDef);
  }

  return ieSet;
}

function decode(buffer) {
  let stream;
  const ieSet = {};

  if (buffer instanceof Buffer) {
    stream = new BitStream(buffer);
  } else {
    stream = buffer;
  }

  const extendedProtocolDiscriminator = decodeInfoElement(stream,
    cInfoElements.find((elem) => elem._name === 'extendedProtocolDiscriminator'));

  if (extendedProtocolDiscriminator.extendedProtocolDiscriminatorValue === _5GMM) {
    stream.move(4); // Bypass spare half octet

    const securityHeaderType = decodeInfoElement(stream,
      elements[_5GMM].find((elem) => elem._name === 'securityHeaderType'));

    if (securityHeaderType.securityHeaderTypeValue === 'plainNasMessageNotSecurityProtected') {
      ieSet.securityHeaderType = securityHeaderType;
      const msgName = decodeInfoElement(stream,
        cInfoElements.find((elem) => elem._name === 'messageType'));

      if (!msgName) {
        throw new Error('Unknown MM message');
      }

      return Object.assign(ieSet, decode5gsMessage(stream, msgName.messageTypeValue, _5GMM));
    }

    const messageAuthenticationCode = decodeInfoElement(stream,
      elements[_5GMM].find((elem) => elem._name === 'messageAuthenticationCode'));
    const sequenceNumber = decodeInfoElement(stream,
      elements[_5GMM].find((elem) => elem._name === 'sequenceNumber'));

    return Object.assign(ieSet, {
      securityProtectedNas: {
        securityHeaderType,
        messageAuthenticationCode,
        sequenceNumber,
      },
    }, decode(stream));
  }

  if (extendedProtocolDiscriminator.extendedProtocolDiscriminatorValue === _5GSM) {
    ieSet.pduSessionIdentity = decodeInfoElement(stream,
      elements[_5GSM].find((elem) => elem._name === 'pduSessionIdentity'));

    ieSet.procedureTransactionIdentity = decodeInfoElement(stream,
      elements[_5GSM].find((elem) => elem._name === 'procedureTransactionIdentity'));

    const msgName = decodeInfoElement(stream,
      cInfoElements.find((elem) => elem._name === 'messageType'));

    if (!msgName) {
      throw new Error('Unknown SM message');
    }

    return Object.assign(ieSet, decode5gsMessage(stream, msgName.messageTypeValue, _5GSM));
  }

  throw new Error('Invalid extended protocol discriminator');
}

function encodeInfoElement(payload, ieDef) {
  const stream = new BitStream();

  if (ieDef['@type'] === 'IE') {
    const elemIeDef = elements[_5GSM].find((elem) => elem._name === ieDef._name);

    if (!elemIeDef) {
      throw new Error(`Unknown IE: ${ieDef._name}`);
    }

    Object.keys(payload[ieDef._name]).reduce((prim, elem) => {
    // Encoding IEI
      stream.append(new BitStream(`uint:${ieDef.idLength || 8}=${parseInt(elem, 10)}`));

      const encodedElem = encodeInfoElement(payload[ieDef._name][elem], elemIeDef);
      // Encoding LI
      stream.append(new BitStream(`uint:${ieDef.nBitLength}=${Math.ceil(encodedElem.length() / 8)}`));
      stream.append(encodedElem);
    }, 0);

    return stream;
  }

  if (ieDef['@type'] === 'MULTI') {
    payload.forEach((elem) => {
      stream.append(encodeInfoElement(elem, { pdu: ieDef.pdu }));
    });

    return stream;
  }

  if (ieDef['@type'] === 'LIST') {
    stream.append(new BitStream(`uint:${ieDef.numberLength}=${payload[ieDef._name].length}`));

    payload[ieDef._name].forEach((elem) => {
      stream.append(encodeInfoElement(elem, { pdu: ieDef.pdu }));
    });

    return stream;
  }

  if (ieDef.pdu) {
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
    const choiceElement = Object.keys(payload)[0];
    let choiceElementDef;

    // eslint-disable-next-line no-restricted-syntax
    for (const option in ieDef.elements) {
      if (ieDef.elements[option]._name === choiceElement) {
        choiceElementDef = ieDef.elements[option];
        break;
      }
    }

    if (!choiceElementDef) {
      throw new Error('UNAVAILABLE CHOICE OPTION');
    }

    stream.append(new BitStream(`uint:${ieDef.length}=${choiceElementDef.tag}`));
    stream.append(encodeInfoElement(payload[choiceElement], choiceElementDef));

    return stream;
  }

  if (ieDef['@type'] === 'MESSAGE') {
    return _encode(payload);
  }

  const encoder = encoders[ieDef.enum ? 'ENUM' : ieDef['@type']];

  return encoder ? encoder(payload && payload[ieDef._name], ieDef) : new BitStream(payload[ieDef._name]);
}

function encode5gsMessage(payload, msgDef, type) {
  const stream = new BitStream();

  msgDef.mandatory.forEach((manIe) => {
    const manIeDef = elements[type].find((elem) => elem._name === manIe._type);

    if (!manIeDef) {
      throw new Error(`Unknown IE: ${manIe._type}`);
    }

    if (manIe.length === -1) {
      throw new Error(`Unknown length for ${manIeDef._name}`);
    }

//    const encIe = encodeInfoElement(payload[manIeDef._name], manIeDef);
    const encIe = encodeInfoElement(payload[manIe._name], manIeDef);

    if (manIe.nBitLength) {
      stream.append(new BitStream(`uint:${manIe.nBitLength}=${Math.ceil(encIe.length() / 8)}`));
    }

    stream.append(encIe);
  });

//  Object.keys(msgDef.optional).reduce((prev, optIeTag) => {
    msgDef.optional.forEach((optIe) => {
    if (!Object.keys(payload).find((payloadOptIe) => payloadOptIe === optIe._name)) {
      return;
    }

    const optIeDef = elements[type].find((elem) => elem._name === optIe._type);
//    const optIeDef = elements[type].find((elem) => elem._name === msgDef.optional[optIeTag]._name);

    if (!optIeDef) {
      throw new Error(`Unknown IE: ${optIe.type}`);
//      throw new Error(`Unknown IE: ${msgDef.optional[optIeTag].name}`);
    }

    if (optIe.length === -1) {
      throw new Error(`Unknown length for ${optIe.type}`);
//      throw new Error(`Unknown length for ${optIe.name}`);
    }

    // Encoding IEI
    if (optIe.length && optIe.length < 8) {
      stream.append(new BitStream(`uint:${optIe.length}=${optIe.iei}`));
    } else {
      stream.append(new BitStream(`byte=${optIe.iei}`));
    }
//    const encIe = encodeInfoElement(payload[optIe._type], optIeDef);
    const encIe = encodeInfoElement(payload[optIe._name], optIeDef);

    if (optIe.nBitLength) {
      // Encoding LI
      stream.append(new BitStream(`uint:${optIe.nBitLength}=${Math.ceil(encIe.length() / 8)}`));
    }

    // Adding IE Value part
    stream.append(encIe);
  }, 0);

  return stream;
}

function _encode(payload) {
  let messageName = { messageTypeValue: payload.mmMessageName };
  let messageType = { extendedProtocolDiscriminatorValue: _5GMM };

  if (payload.messageName) {
    messageName = { messageTypeValue: payload.messageName };
    messageType = { extendedProtocolDiscriminatorValue: _5GSM };
  }

  const stream = new BitStream();
  const messageCode = encodeInfoElement(messageName, cInfoElements.find((elem) => elem._name === 'messageType'));
  const message = messages[messageType.extendedProtocolDiscriminatorValue].find((msg) => msg._name === messageName.messageTypeValue);

  if (!message) {
    throw new Error('Uknown message name');
  }

  const epd = encodeInfoElement(messageType, cInfoElements.find((elem) => elem._name === 'extendedProtocolDiscriminator'));
  stream.append(epd); // EPD

  if (payload.securityProtectedNas) {
    stream.append(new BitStream('uint:4=0')); // Spare half octet
    stream.append(encodeInfoElement(payload.securityProtectedNas.securityHeaderType, elements[_5GMM].find((elem) => elem._name === 'securityHeaderType')));
    stream.append(encodeInfoElement(payload.securityProtectedNas.messageAuthenticationCode, elements[_5GMM].find((elem) => elem._name === 'messageAuthenticationCode')));
    stream.append(encodeInfoElement(payload.securityProtectedNas.sequenceNumber, elements[_5GMM].find((elem) => elem._name === 'sequenceNumber')));
    stream.append(epd); // EPD
  }

  if (messageType.extendedProtocolDiscriminatorValue === _5GMM) {
    stream.append(new BitStream('uint:4=0')); // Spare half octet
    stream.append(encodeInfoElement(payload.securityHeaderType, elements[_5GMM].find((elem) => elem._name === 'securityHeaderType')));
  } else {
    const pduSessionIdElem = elements[_5GSM].find((elem) => elem._name === 'pduSessionIdentity');
    stream.append(encodeInfoElement(payload.pduSessionIdentity, pduSessionIdElem));

    const procedureTransactionIdentity = elements[_5GSM].find((elem) => elem._name === 'procedureTransactionIdentity');
    stream.append(encodeInfoElement(payload.procedureTransactionIdentity, procedureTransactionIdentity));
  }

  stream.append(messageCode);
  stream.append(encode5gsMessage(payload, message, messageType.extendedProtocolDiscriminatorValue));

  return stream;
}

function encode(payload) {
  return _encode(payload).buf;
}

module.exports = Object.freeze({
  name: 'nas_parser',
  decode,
  encode,
});
