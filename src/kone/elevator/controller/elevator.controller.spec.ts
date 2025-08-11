import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ElevatorController } from './elevator.controller';
import { ElevatorService } from '../service/elevator.service';
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
const liftNo = 1;
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
}));

describe('ElevatorController', () => {
  let app: INestApplication;

  const elevatorService = {
    listElevators: jest.fn(),
    getLiftStatus: jest.fn(),
    callElevator: jest.fn(),
    delayElevatorDoors: jest.fn(),
    reserveOrCancelCall: jest.fn(),
  } as Record<string, any>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElevatorController],
      providers: [{ provide: ElevatorService, useValue: elevatorService }],
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

  it('lists elevators', async () => {
    const ts = Date.now();
    const body = { deviceUuid, placeId, appname, ts };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: ['list'] };
    elevatorService.listElevators.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/lift/list')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(elevatorService.listElevators).toHaveBeenCalledWith(req);
  });

  it('gets lift status', async () => {
    const ts = Date.now();
    const body = { deviceUuid, placeId, appname, ts, liftNo };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: ['status'] };
    elevatorService.getLiftStatus.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/lift/status')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(elevatorService.getLiftStatus).toHaveBeenCalledWith(req);
  });

  it('calls an elevator', async () => {
    const ts = Date.now();
    const body = {
      deviceUuid,
      placeId,
      appname,
      ts,
      liftNo,
      fromFloor: 2000,
      toFloor: 3000,
    };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: 'called' };
    elevatorService.callElevator.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/lift/call')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(elevatorService.callElevator).toHaveBeenCalledWith(req);
  });

  it('delays elevator doors', async () => {
    const ts = Date.now();
    const body = {
      deviceUuid,
      placeId,
      appname,
      ts,
      liftNo,
      seconds: 2,
    };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: 'delayed' };
    elevatorService.delayElevatorDoors.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/lift/open')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(elevatorService.delayElevatorDoors).toHaveBeenCalledWith(req);
  });

  it('reserves or cancels elevator', async () => {
    const ts = Date.now();
    const body = {
      deviceUuid,
      placeId,
      appname,
      ts,
      liftNo,
      locked: 0,
    };
    const sign = generateSign(body, appname, appSecret, ts);
    const check = generateCheck(deviceUuid, ts, deviceSecret);
    const req = { ...body, sign, check };
    const res = { result: 'locked' };
    elevatorService.reserveOrCancelCall.mockResolvedValue(res);

    const response = await request(app.getHttpServer())
      .post('/lift/lock')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(elevatorService.reserveOrCancelCall).toHaveBeenCalledWith(req);
  });
});
