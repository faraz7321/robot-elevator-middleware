import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DeviceController } from './device.controller';
import { DeviceService } from '../service/device.service';

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
    const req = {
      deviceUuid: 'uuid',
      deviceMac: 'mac',
      appname: 'app',
      sign: 'sign',
      ts: 1,
    };
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
    const req = {
      deviceUuid: 'uuid',
      liftNos: [1],
      appname: 'app',
      sign: 'sign',
      ts: 1,
    };
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
    const req = {
      deviceUuid: 'uuid',
      liftNos: [1],
      appname: 'app',
      sign: 'sign',
      ts: 1,
    };
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
