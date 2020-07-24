A project for parsing 5GS NAS stream payload to JSON and back

## Usage

```
  const payload = {
    "name": "authenticationRequest",
    "spareHalfOctet": {
      "spare": 0
    },
    "nasKeySetIdentifier": {
      "tsc": "nativeSecurityContextForKsiamf",
      "nasKeySetIdentifierValue": 1
    },
    "abba": {
      "abbaContent": "0x0000"
    },
    "authenticationParameterRand": {
      "rand": "0x19f4f9238f9416bb64d0c10c3abb242d"
    },
    "authenticationParameterAutn": {
      "sqnXorAk": "0xaa29499f6286",
      "amf": "0xe282",
      "mac": "0x215f57fd4f115f0b"
    }
  };

  const retVal = nasParser.encode(js0xn.decode(payload));
  console.log(js0xn.stringify(retVal.buf));
```
You just need to have your NAS PDU as JSON and then encode it using parser to a byte stream
which you would in turn embed in your NGAP PDU

Note: The js0xn is a library used for converting Hex strings starting with "0x" to Buffer and back
