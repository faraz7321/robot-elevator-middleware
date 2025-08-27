import { ElevatorService } from './elevator.service';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import { LiftStatusRequestDTO } from '../dtos/status/LiftStatusRequestDTO';
import {
  fetchBuildingTopology,
  openWebSocketConnection,
  waitForResponse,
} from '../../common/koneapi';

jest.mock('../../common/koneapi', () => ({
  fetchBuildingTopology: jest.fn(),
  openWebSocketConnection: jest.fn(),
  waitForResponse: jest.fn(),
}));

describe('ElevatorService callElevator', () => {
  let service: ElevatorService;
  const accessTokenService = {
    getAccessToken: jest.fn().mockResolvedValue('token'),
  } as unknown as AccessTokenService;
  let getLiftStatusMock: jest.Mock;

  beforeEach(() => {
    service = new ElevatorService(accessTokenService);
    jest.spyOn(service as any, 'getRequestId').mockReturnValue(123);
    getLiftStatusMock = jest
      .fn()
      .mockResolvedValue({ result: [{ mode: 'NOR' }] });
    Object.assign(service, { getLiftStatus: getLiftStatusMock });
    (fetchBuildingTopology as jest.Mock).mockResolvedValue({
      groups: [{ groupId: 'gid:1', lifts: [] }],
      areas: [],
    });
    (waitForResponse as jest.Mock).mockResolvedValue({
      connectionId: 'conn-123',
      requestId: '123',
      statusCode: 201,
      type: 'ok',
      data: { time: '2025-07-28T05:11:19.893Z' },
    });
    (openWebSocketConnection as jest.Mock).mockImplementation(() => {
      const ws: {
        handler?: (data: string) => void;
        on: (event: string, cb: (data: string) => void) => void;
        off: (event: string, cb: (data: string) => void) => void;
        send: jest.Mock;
        close: jest.Mock;
      } = {
        handler: undefined,
        on: (event, cb) => {
          if (event === 'message') ws.handler = cb;
        },
        off: (event, cb) => {
          if (event === 'message' && ws.handler === cb) {
            ws.handler = undefined;
          }
        },
        send: jest.fn((payload) => {
          const res = {
            callType: 'action',
            data: { request_id: 123, success: true, session_id: 99 },
          };
          ws.handler?.(JSON.stringify(res));
          return payload;
        }),
        close: jest.fn(),
      };
      return ws;
    });
  });

  it('returns session id and destination when operational', async () => {
    const req = new CallElevatorRequestDTO();
    req.placeId = 'b1';
    req.liftNo = 1;
    req.fromFloor = 1;
    req.toFloor = 5;

    const res = await service.callElevator(req);

    expect(res.errcode).toBe(0);
    expect(res.sessionId).toBe(99);
    expect(res.destination).toBe(5);
    expect(res.connectionId).toBe('conn-123');
    expect(res.requestId).toBe(123);
    const sendArg = (openWebSocketConnection as jest.Mock).mock.results[0].value
      .send.mock.calls[0][0];
    const sent = JSON.parse(sendArg);
    expect(sent.payload.area).toBe(1000);
    expect(sent.payload.call.destination).toBe(5000);
  });

  it('rejects call when in non-operational mode', async () => {
    getLiftStatusMock.mockResolvedValue({
      result: [{ mode: 'FRD' }],
    });
    const req = new CallElevatorRequestDTO();
    req.placeId = 'b1';
    req.liftNo = 1;
    req.fromFloor = 1;
    req.toFloor = 5;

    const res = await service.callElevator(req);

    expect(res.errcode).toBe(1);
    expect(res.errmsg).toContain('FRD');
  });
});

describe('ElevatorService getLiftStatus', () => {
  let service: ElevatorService;
  const accessTokenService = {
    getAccessToken: jest.fn().mockResolvedValue('token'),
  } as unknown as AccessTokenService;

  beforeEach(() => {
    service = new ElevatorService(accessTokenService);
    (fetchBuildingTopology as jest.Mock).mockResolvedValue({
      groups: [{ groupId: 'gid:1', lifts: [{ liftId: 'lift:b1:1:1' }] }],
      areas: [],
    });
    (waitForResponse as jest.Mock).mockResolvedValue({});
    (openWebSocketConnection as jest.Mock).mockImplementation(() => {
      const ws: {
        handler?: (data: string) => void;
        on: (event: string, cb: (data: string) => void) => void;
        off: (event: string, cb: (data: string) => void) => void;
        send: jest.Mock;
        close: jest.Mock;
      } = {
        handler: undefined,
        on: (event, cb) => {
          if (event === 'message') ws.handler = cb;
        },
        off: (event, cb) => {
          if (event === 'message' && ws.handler === cb) {
            ws.handler = undefined;
          }
        },
        send: jest.fn(() => {
          setTimeout(() => {
            ws.handler?.(
              JSON.stringify({
                callType: 'monitor-lift-status',
                data: { lift_mode: 'NOR' },
              }),
            );
            ws.handler?.(
              JSON.stringify({
                callType: 'monitor-lift-position',
                data: {
                  cur: 5,
                  dir: 'UP',
                  moving_state: 'MOVING',
                  door: true,
                },
              }),
            );
          }, 0);
        }),
        close: jest.fn(),
      };
      return ws;
    });
  });

  it('maps site monitoring events to lift status response', async () => {
    const req = new LiftStatusRequestDTO();
    req.placeId = 'b1';
    req.liftNo = 1;

    const res = await service.getLiftStatus(req);

    expect(res.result[0]).toEqual({
      liftNo: 1,
      floor: 5,
      state: 1,
      prevDirection: 1,
      liftDoorStatus: 1,
      mode: 'NOR',
    });
  });
});

describe('ElevatorService listElevators', () => {
  let service: ElevatorService;
  const accessTokenService = {
    getAccessToken: jest.fn().mockResolvedValue('token'),
  } as unknown as AccessTokenService;

  beforeEach(() => {
    service = new ElevatorService(accessTokenService);
    (fetchBuildingTopology as jest.Mock).mockReset();
  });

  it('normalizes floor names to numbers', async () => {
    (fetchBuildingTopology as jest.Mock).mockResolvedValueOnce({
      groups: [
        {
          lifts: [
            {
              lift_id: 7,
              floors: [{ group_floor_id: 1 }, { group_floor_id: 8 }],
            },
          ],
        },
      ],
      destinations: [
        { group_floor_id: 1, short_name: '1R' },
        { group_floor_id: 8, short_name: '8R' },
      ],
    });

    const req = { placeId: 'b1' } as any;

    const res = await service.listElevators(req);

    expect(res.result[0]).toEqual({
      liftNo: 7,
      accessibleFloors: '1,8',
      bindingStatus: '11',
    });
  });
});
