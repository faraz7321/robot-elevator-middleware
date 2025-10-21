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
  fetchLimitedAccessToken: jest.fn().mockResolvedValue('limited-token'),
}));

describe('ElevatorService callElevator', () => {
  let service: ElevatorService;
  const accessTokenService = {
    getAccessToken: jest.fn().mockResolvedValue('token'),
  } as unknown as AccessTokenService;
  let getLiftStatusMock: jest.Mock;
  const defaultDeviceUuid = '123456789012345678901234';
  const primeLock = (
    placeId: string,
    liftNo: number,
    fromFloor: number,
    toFloor: number,
    deviceUuid = defaultDeviceUuid,
  ) => {
    (service as any).lockFloorCache.set(
      `${deviceUuid}|${placeId}|${liftNo}`,
      { fromFloor, toFloor, updatedAt: Date.now() },
    );
  };

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
        prependListener: (event: string, cb: (data: string) => void) => void;
        off: (event: string, cb: (data: string) => void) => void;
        send: jest.Mock;
        close: jest.Mock;
      } = {
        handler: undefined,
        on: (event, cb) => {
          if (event === 'message') ws.handler = cb;
        },
        prependListener: (event, cb) => {
          // For tests, treat prependListener same as on
          if (event === 'message') ws.handler = cb;
        },
        off: (event, cb) => {
          if (event === 'message' && ws.handler === cb) {
            ws.handler = undefined;
          }
        },
        send: jest.fn((payload) => {
          try {
            const parsed = JSON.parse(payload as string);
            if (parsed?.callType === 'ping') {
              const res = {
                callType: 'ping',
                data: { request_id: parsed?.payload?.request_id },
              };
              setTimeout(() => ws.handler?.(JSON.stringify(res)), 0);
            }
            if (parsed?.callType === 'monitor') {
              const status = {
                callType: 'monitor-lift-status',
                data: { lift_mode: 0 },
              };
              setTimeout(() => ws.handler?.(JSON.stringify(status)), 0);
            }
            if (parsed?.callType === 'action') {
              const res = {
                callType: 'action',
                data: { request_id: 123, success: true, session_id: 99 },
              };
              ws.handler?.(JSON.stringify(res));
            }
          } catch {
            // no-op
          }
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
    req.deviceUuid = defaultDeviceUuid;
    req.toFloor = 5;

    primeLock(req.placeId, req.liftNo, 1, 5, req.deviceUuid);

    const res = await service.callElevator(req);

    expect(res.errcode).toBe(0);
    expect(res.sessionId).toBe(99);
    expect(res.destination).toBe(5);
    expect(res.connectionId).toBe('conn-123');
    expect(res.requestId).toBe(123);
    const sendCalls = (openWebSocketConnection as jest.Mock).mock.results[0]
      .value.send.mock.calls.map((c) => JSON.parse(c[0]));
    const actionPayload = sendCalls.find((p: any) => p?.callType === 'action');
    expect(actionPayload).toBeDefined();
    expect(actionPayload?.payload?.area).toBe(1000);
    expect(actionPayload?.payload?.call?.destination).toBe(5000);
  });

  it('uses floor-specific terminal mapping when available', async () => {
    (fetchBuildingTopology as jest.Mock).mockResolvedValueOnce({
      groups: [
        {
          groupId: 'gid:1',
          terminals: [10011, 10012],
          lifts: [
            {
              liftId: 'lift:1',
              decks: [
                {
                  deck: 0,
                  area_id: 1001010,
                },
              ],
            },
          ],
        },
      ],
      destinations: [
        {
          area_id: 1010,
          short_name: '1R',
          group_floor_id: 1,
          group_side: 2,
          terminals: [10012],
        },
        {
          area_id: 6010,
          short_name: '5R',
          group_floor_id: 6,
          group_side: 2,
          terminals: [10012],
        },
      ],
      terminals: [
        { terminal_id: 10011, type: 'LCS' },
        { terminal_id: 10012, type: 'Virtual' },
      ],
    });

    const req = new CallElevatorRequestDTO();
    req.placeId = 'b1';
    req.liftNo = 1;
    req.deviceUuid = defaultDeviceUuid;
    req.toFloor = 6;

    primeLock(req.placeId, req.liftNo, 1, 6, req.deviceUuid);

    const res = await service.callElevator(req);
    expect(res.errcode).toBe(0);

    const wsMock = openWebSocketConnection as jest.Mock;
    const ws = wsMock.mock.results[wsMock.mock.results.length - 1].value;
    const payloads = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
    const actionPayload = payloads.find((p: any) => p.callType === 'action');
    expect(actionPayload?.payload?.terminal).toBe(10012);
    expect(actionPayload?.payload?.area).toBe(1010);
    expect(actionPayload?.payload?.call?.destination).toBe(6010);
  });

  it('does not depend on operational mode check in call flow', async () => {
    // Even if a separate status endpoint might report non-operational,
    // callElevator only pings and proceeds with the call on its own WS.
    getLiftStatusMock.mockResolvedValue({ result: [{ mode: 'FRD' }] });

    const req = new CallElevatorRequestDTO();
    req.placeId = 'b1';
    req.liftNo = 1;
    req.deviceUuid = defaultDeviceUuid;
    req.toFloor = 5;

    primeLock(req.placeId, req.liftNo, 1, 5, req.deviceUuid);

    const res = await service.callElevator(req);

    expect(res.errcode).toBe(0);
    // Ensure callElevator did not invoke getLiftStatus internally
    expect(getLiftStatusMock).not.toHaveBeenCalled();
  });

  it('places a single action call to the correct group suffix', async () => {
    // Topology with two groups; target group suffix is 2
    (fetchBuildingTopology as jest.Mock).mockResolvedValueOnce({
      groups: [
        { groupId: 'gid:1', lifts: [] },
        { groupId: 'gid:2', lifts: [], terminals: [1111] },
      ],
      areas: [],
    });

    const req = new CallElevatorRequestDTO();
    req.placeId = 'b1:2'; // group suffix 2
    req.liftNo = 1;
    req.deviceUuid = defaultDeviceUuid;
    req.toFloor = 6;

    primeLock(req.placeId, req.liftNo, 3, 6, req.deviceUuid);

    const res = await service.callElevator(req);

    expect(res.errcode).toBe(0);

    const wsMock = openWebSocketConnection as jest.Mock;
    const ws = wsMock.mock.results[wsMock.mock.results.length - 1].value;
    const payloads = ws.send.mock.calls.map((c) => JSON.parse(c[0]));
    const actionPayloads = payloads.filter((p) => p.callType === 'action');

    // Only one action for the journey and to the correct group
    expect(actionPayloads).toHaveLength(1);
    expect(actionPayloads[0].groupId).toBe('2');
    expect(actionPayloads[0].buildingId).toBe('building:b1');
  });

  it('returns cached response and avoids duplicate action for same journey quickly repeated', async () => {
    // Configure permissive rate limit to not interfere with idempotency
    const prevWindow = process.env.KONE_CALL_RATE_WINDOW_MS;
    const prevMax = process.env.KONE_CALL_RATE_MAX_REQUESTS;
    const prevTtl = process.env.KONE_CALL_IDEMPOTENCY_TTL_MS;
    process.env.KONE_CALL_RATE_WINDOW_MS = '1000';
    process.env.KONE_CALL_RATE_MAX_REQUESTS = '10';
    process.env.KONE_CALL_IDEMPOTENCY_TTL_MS = '5000';

    try {
      (fetchBuildingTopology as jest.Mock).mockResolvedValueOnce({
        groups: [{ groupId: 'gid:1', lifts: [] }],
        areas: [],
      });

      const req = new CallElevatorRequestDTO();
      req.placeId = 'b1:1';
      req.liftNo = 1;
      req.toFloor = 8;
      req.deviceUuid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
      req.appname = 'app';
      req.sign = 's';
      req.check = 'c';
      req.ts = Date.now();

      primeLock(req.placeId, req.liftNo, 4, 8, req.deviceUuid);

      const first = await service.callElevator(req);
      expect(first.errcode).toBe(0);

      const wsMock = openWebSocketConnection as jest.Mock;
      const ws = wsMock.mock.results[wsMock.mock.results.length - 1].value;
      const sendsAfterFirst = ws.send.mock.calls.length;

      const second = await service.callElevator(req);
      expect(second.errcode).toBe(0);
      // No additional sends should occur for duplicate within TTL
      expect(ws.send.mock.calls.length).toBe(sendsAfterFirst);
    } finally {
      if (typeof prevWindow !== 'undefined')
        process.env.KONE_CALL_RATE_WINDOW_MS = prevWindow;
      else delete process.env.KONE_CALL_RATE_WINDOW_MS;
      if (typeof prevMax !== 'undefined')
        process.env.KONE_CALL_RATE_MAX_REQUESTS = prevMax;
      else delete process.env.KONE_CALL_RATE_MAX_REQUESTS;
      if (typeof prevTtl !== 'undefined')
        process.env.KONE_CALL_IDEMPOTENCY_TTL_MS = prevTtl;
      else delete process.env.KONE_CALL_IDEMPOTENCY_TTL_MS;
    }
  });

  it('rate limits distinct journeys from same device within window', async () => {
    const prevWindow = process.env.KONE_CALL_RATE_WINDOW_MS;
    const prevMax = process.env.KONE_CALL_RATE_MAX_REQUESTS;
    process.env.KONE_CALL_RATE_WINDOW_MS = '10000';
    process.env.KONE_CALL_RATE_MAX_REQUESTS = '1';

    try {
      (fetchBuildingTopology as jest.Mock).mockResolvedValue({
        groups: [{ groupId: 'gid:1', lifts: [] }],
        areas: [],
      });

      const base = new CallElevatorRequestDTO();
      base.placeId = 'b1:1';
      base.liftNo = 1;
      base.deviceUuid = 'bbbbbbbbbbbbbbbbbbbbbbbb';
      base.appname = 'app';
      base.sign = 's';
      base.check = 'c';
      base.ts = Date.now();

      const req1 = Object.assign(new CallElevatorRequestDTO(), base, {
        toFloor: 2,
      });
      const req2 = Object.assign(new CallElevatorRequestDTO(), base, {
        toFloor: 3,
      });

      primeLock(req1.placeId, req1.liftNo, 1, req1.toFloor, req1.deviceUuid);
      const res1 = await service.callElevator(req1);
      expect(res1.errcode).toBe(0);

      primeLock(req2.placeId, req2.liftNo, 1, req2.toFloor, req2.deviceUuid);
      const res2 = await service.callElevator(req2);
      expect(res2.errcode).toBe(1);
      expect(res2.errmsg).toBe('RATE_LIMITED');
    } finally {
      if (typeof prevWindow !== 'undefined')
        process.env.KONE_CALL_RATE_WINDOW_MS = prevWindow;
      else delete process.env.KONE_CALL_RATE_WINDOW_MS;
      if (typeof prevMax !== 'undefined')
        process.env.KONE_CALL_RATE_MAX_REQUESTS = prevMax;
      else delete process.env.KONE_CALL_RATE_MAX_REQUESTS;
    }
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
        prependListener: (event: string, cb: (data: string) => void) => void;
        off: (event: string, cb: (data: string) => void) => void;
        send: jest.Mock;
        close: jest.Mock;
      } = {
        handler: undefined,
        on: (event, cb) => {
          if (event === 'message') ws.handler = cb;
        },
        prependListener: (event, cb) => {
          if (event === 'message') ws.handler = cb;
        },
        off: (event, cb) => {
          if (event === 'message' && ws.handler === cb) {
            ws.handler = undefined;
          }
        },
        send: jest.fn((payload) => {
          try {
            const parsed = JSON.parse(payload as string);
            if (parsed?.callType === 'ping') {
              const res = {
                callType: 'ping',
                data: { request_id: parsed?.payload?.request_id },
              };
              setTimeout(() => ws.handler?.(JSON.stringify(res)), 0);
            }
            if (parsed?.callType === 'monitor') {
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
            }
          } catch {
            // no-op
          }
          return payload;
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

  it('derives floor numbers from area ids and excludes missing destinations', async () => {
    (fetchBuildingTopology as jest.Mock).mockResolvedValueOnce({
      groups: [
        {
          groupId: 'gid:2',
          lifts: [
            {
              lift_id: 1,
              floors: [
                { group_floor_id: 1 },
                { group_floor_id: 2 },
                { group_floor_id: 3 },
                { group_floor_id: 4 },
                { group_floor_id: 5 },
                { group_floor_id: 6 },
                { group_floor_id: 7 },
              ],
            },
          ],
        },
      ],
      destinations: [
        { group_floor_id: 1, area_id: 1010, short_name: '0R' },
        { group_floor_id: 3, area_id: 3010, short_name: '2R' },
        { group_floor_id: 4, area_id: 4010, short_name: '3R' },
        { group_floor_id: 5, area_id: 5000, short_name: '4' },
        { group_floor_id: 6, area_id: 6010, short_name: '5R' },
        { group_floor_id: 7, area_id: 7000, short_name: '6' },
      ],
    });

    const req = { placeId: 'b2:2' } as any;

    const res = await service.listElevators(req);

    expect(res.result[0]).toEqual({
      liftNo: 1,
      accessibleFloors: '1,3,4,5,6,7',
      bindingStatus: '11',
    });
  });
});
