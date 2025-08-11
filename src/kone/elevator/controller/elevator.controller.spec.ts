import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ElevatorController } from './elevator.controller';
import { ElevatorService } from '../service/elevator.service';

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
    const req = { placeId: '1', sign: 's', ts: 1, appname: 'app', check: 'c', deviceUuid: 'd' };
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
    const req = { placeId: '1', liftNo: 1, sign: 's', ts: 1, appname: 'app', check: 'c', deviceUuid: 'd' };
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
    const req = { placeId: '1', liftNo: 1, destFloor: 2, sign: 's', ts: 1, appname: 'app', check: 'c', deviceUuid: 'd' };
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
    const req = { placeId: '1', liftNo: 1, delayTime: 5, sign: 's', ts: 1, appname: 'app', check: 'c', deviceUuid: 'd' };
    const res = { result: 'delayed' };
    elevatorService.delayElevatorDoors.mockReturnValue(res);

    const response = await request(app.getHttpServer())
      .post('/lift/open')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(elevatorService.delayElevatorDoors).toHaveBeenCalledWith(req);
  });

  it('reserves or cancels elevator', async () => {
    const req = { placeId: '1', liftNo: 1, sign: 's', ts: 1, appname: 'app', check: 'c', deviceUuid: 'd' };
    const res = { result: 'locked' };
    elevatorService.reserveOrCancelCall.mockReturnValue(res);

    const response = await request(app.getHttpServer())
      .post('/lift/lock')
      .send(req)
      .expect(201);

    expect(response.body).toEqual(res);
    expect(elevatorService.reserveOrCancelCall).toHaveBeenCalledWith(req);
  });
});
