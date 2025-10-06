import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DeviceController } from './device.controller';
import { DeviceService } from '../service/device.service';
import * as crypto from 'crypto';
import * as process from 'node:process';
import {
  validateSignedRequest,
  validateRegisterRequest,
} from '../../common/verify-signature';

jest.mock('../../common/verify-signature', () => ({
  validateSignedRequest: jest.fn(),
  validateRegisterRequest: jest.fn(),
}));

// Set required environment variables for tests
const deviceUuid = 'device-uuid';
const appname = 'testApp';
const deviceSecret = 'deviceSecret';
const appSecret = 'appSecret';
const placeId = 1;
process.env.ELEVATOR_APP_NAME = appname;
process.env.ELEVATOR_APP_SECRET = appSecret;

function md5(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

// === Input values
const deviceMac = '112233445575';
const liftNos = [1];

function generateCheck(
  deviceUuid: string,
  ts: number,
  deviceSecret: string,
): string {
  return md5(`${deviceUuid}|${ts}|${deviceSecret}`);
}

function generateSign(
  payload: Record<string, any>,
  appname: string,
  appSecret: string,
  ts: number,
): string {
  const keys = Object.keys(payload).filter(
    (key) => !['sign', 'ts', 'appname', 'secret', 'check'].includes(key),
  );

  const kvs = keys.sort().map((key) => `${key}:${payload[key]}`);
  kvs.push(`appname:${appname}`);
  kvs.push(`secret:${appSecret}`);
  kvs.push(`ts:${ts}`);

  return md5(kvs.join('|'));
}

describe('DeviceController', () => {
  let app: INestApplication;

  const deviceService = {
    registerDevice: jest.fn(),
    bindDevice: jest.fn(),
    unbindDevice: jest.fn(),
    getDeviceSecret: jest.fn().mockResolvedValue(deviceSecret),
  } as Record<string, any>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [{ provide: DeviceService, useValue: deviceService }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    deviceService.getDeviceSecret.mockResolvedValue(deviceSecret);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a device', async () => {
    const ts = Date.now();
    const body = { deviceUuid, appname, ts, deviceMac };
    const sign = generateSign(body, appname, appSecret, ts);
    //const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign };
    const res = { result: 'registered' };
    deviceService.registerDevice.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/device/register')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(deviceService.registerDevice).toHaveBeenCalledWith(req);
    expect(validateRegisterRequest).toHaveBeenCalledWith(req);
    expect(validateSignedRequest).not.toHaveBeenCalled();
  });

  it('binds a device', async () => {
    const ts = Date.now();
    const body = { deviceUuid, placeId, appname, ts, liftNos };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: 'bound' };
    deviceService.bindDevice.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/device/binding')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(deviceService.bindDevice).toHaveBeenCalledWith(req);
    expect(validateSignedRequest).toHaveBeenCalledWith(req, deviceSecret);
    expect(validateRegisterRequest).not.toHaveBeenCalled();
  });

  it('unbinds a device', async () => {
    const ts = Date.now();
    const body = { deviceUuid, placeId, appname, ts, liftNos };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: 'unbound' };
    deviceService.unbindDevice.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/device/unbinding')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(deviceService.unbindDevice).toHaveBeenCalledWith(req);
    expect(validateSignedRequest).toHaveBeenCalledWith(req, deviceSecret);
    expect(validateRegisterRequest).not.toHaveBeenCalled();
  });
});
