import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DeviceController } from './device.controller';
import { DeviceService } from '../service/device.service';
import axios from 'axios';
import * as crypto from 'crypto';
import * as process from 'node:process';
import * as dotenv from 'dotenv';

dotenv.config();

function md5(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

// === Input values
const deviceUuid = process.env.BIB_DEVICE_UUID!;
const appname = process.env.ELEVATOR_APP_NAME!;
const deviceSecret = process.env.BIB_DEVICE_SECRET!;
const appSecret = process.env.ELEVATOR_APP_SECRET!;
const placeId = process.env.KONE_BUILDING_ID!;
const deviceMac = '112233445575';
const liftNos = [1];
const endpoint =
  process.env.ROBOT_API_BASE || 'http://localhost:3000/openapi/v5/lift/open';

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

jest.mock('../../common/verify-signature', () => ({
  validateSignedRequest: jest.fn(),
  isValidRegisterRequest: jest.fn().mockReturnValue(true),
}));

describe('DeviceController', () => {
  let app: INestApplication;

  const deviceService = {
    registerDevice: jest.fn(),
    bindDevice: jest.fn(),
    unbindDevice: jest.fn(),
  } as Record<string, any>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [{ provide: DeviceService, useValue: deviceService }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
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
    deviceService.registerDevice.mockReturnValue(res);

    const response = await request(app.getHttpServer())
      .post('/device/register')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(deviceService.registerDevice).toHaveBeenCalledWith(req);
  });

  it('binds a device', async () => {
    const ts = Date.now();
    const body = { deviceUuid, placeId, appname, ts, liftNos };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: 'bound' };
    deviceService.bindDevice.mockReturnValue(res);

    const response = await request(app.getHttpServer())
      .post('/device/binding')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(deviceService.bindDevice).toHaveBeenCalledWith(req);
  });

  it('unbinds a device', async () => {
    const ts = Date.now();
    const body = { deviceUuid, placeId, appname, ts, liftNos };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: 'unbound' };
    deviceService.unbindDevice.mockReturnValue(res);

    const response = await request(app.getHttpServer())
      .post('/device/unbinding')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(deviceService.unbindDevice).toHaveBeenCalledWith(req);
  });
});
