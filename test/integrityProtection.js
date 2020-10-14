const { expect } = require('chai');

const security = require('../src/security');

describe('Test suit based on 3GPP TS 33.401 v15040 Appendix C for EPS (Byte aligned)', () => {
  context('1285GIA2 Test 2 (Appendix C2 128-EIA2, Test set 2)', () => {
    it('Should return MAC value: b93787e6', () => {
      const options = {
        intAlg: '1285GIA2',
        keyNasInt: Buffer.from('d3c5d592327fb11c4035c6680af8c6d1', 'hex'),
        count: Buffer.from('398a59b4', 'hex'),
        bearer: 0x1a,
        dir: 0x01,
      };
      const message = Buffer.from('484583d5afe082ae', 'hex');
      expect(security.calculateMac(options, message)).to.deep.equal(Buffer.from('b93787e6', 'hex'));
    });
  });

  context('1285GIA2 Test 5 (Appendix C2 128-EIA2, Test set 5)', () => {
    it('Should return MAC value: e657e182', () => {
      const options = {
        intAlg: '1285GIA2',
        keyNasInt: Buffer.from('83fd23a244a74cf358da3019f1722635', 'hex'),
        count: Buffer.from('36af6144', 'hex'),
        bearer: 0x0f,
        dir: 0x1,
      };
      const message = Buffer.from('35c68716633c66fb750c266865d53c11ea05b1e9fa49c8398d48e1efa5909d3947902837f5ae96d5a05bc8d61ca8dbef1b13a4b4abfe4fb1006045b674bb54729304c382be53a5af05556176f6eaa2ef1d05e4b083181ee674cda5a485f74d7a', 'hex');
      expect(security.calculateMac(options, message)).to.deep.equal(Buffer.from('e657e182', 'hex'));
    });
  });
});
