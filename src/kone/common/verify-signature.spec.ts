// Set up environment variables before requiring module
const originalEnv = {
  ELEVATOR_APP_NAME: process.env.ELEVATOR_APP_NAME,
  ELEVATOR_APP_SECRET: process.env.ELEVATOR_APP_SECRET,
  BIB_DEVICE_SECRET: process.env.BIB_DEVICE_SECRET,
};
process.env.ELEVATOR_APP_NAME = 'testApp';
process.env.ELEVATOR_APP_SECRET = 'appSecret';
process.env.BIB_DEVICE_SECRET = 'deviceSecret';

const {
  generateSign,
  generateCheck,
  isValidRequest,
} = require('./verify-signature');

describe('verify-signature', () => {
  const appname = process.env.ELEVATOR_APP_NAME;
  const appSecret = process.env.ELEVATOR_APP_SECRET;
  const deviceSecret = process.env.BIB_DEVICE_SECRET;
  const deviceUuid = 'device-123';

  it('validates register request without check', () => {
    const ts = 1000;
    const payload = { deviceUuid, deviceMac: 'aa', appname, ts };
    const sign = generateSign(payload, appname, appSecret, ts);
    const req = { ...payload, sign };
    expect(isValidRequest(req, appSecret)).toBe(true);
  });

  it('rejects register request with invalid sign', () => {
    const ts = 1000;
    const payload = { deviceUuid, deviceMac: 'aa', appname, ts };
    const sign = 'bad';
    const req = { ...payload, sign };
    expect(isValidRequest(req, appSecret)).toBe(false);
  });

  it('validates request with check when deviceSecret provided', () => {
    const ts = 2000;
    const payload = { deviceUuid, appname, ts, placeId: 1 };
    const sign = generateSign(payload, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...payload, sign, check };
    expect(isValidRequest(req, appSecret, deviceSecret)).toBe(true);
  });

  it('rejects request with wrong check', () => {
    const ts = 2000;
    const payload = { deviceUuid, appname, ts, placeId: 1 };
    const sign = generateSign(payload, appname, appSecret, ts);
    const check = 'wrong';
    const req = { ...payload, sign, check };
    expect(isValidRequest(req, appSecret, deviceSecret)).toBe(false);
  });
});

afterAll(() => {
  process.env.ELEVATOR_APP_NAME = originalEnv.ELEVATOR_APP_NAME;
  process.env.ELEVATOR_APP_SECRET = originalEnv.ELEVATOR_APP_SECRET;
  process.env.BIB_DEVICE_SECRET = originalEnv.BIB_DEVICE_SECRET;
});
