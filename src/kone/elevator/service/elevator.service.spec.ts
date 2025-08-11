import { ElevatorService } from './elevator.service';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import {
  fetchBuildingTopology,
  openWebSocketConnection,
} from '../../common/koneapi';

jest.mock('../../common/koneapi', () => ({
  fetchBuildingTopology: jest.fn(),
  openWebSocketConnection: jest.fn(),
}));

describe('ElevatorService callElevator', () => {
  let service: ElevatorService;
  const accessTokenService = {
    getAccessToken: jest.fn().mockResolvedValue('token'),
  } as unknown as AccessTokenService;

  beforeEach(() => {
    service = new ElevatorService(accessTokenService);
    jest.spyOn<any, any>(service, 'getRequestId').mockReturnValue(123);
    (service as any).getLiftStatus = jest
      .fn()
      .mockResolvedValue({ result: [{ mode: 'NOR' }] });
    (fetchBuildingTopology as jest.Mock).mockResolvedValue({
      groups: [{ groupId: 'gid:1', lifts: [] }],
      areas: [],
    });
    (openWebSocketConnection as jest.Mock).mockImplementation(() => {
      const ws: any = {
        handler: null,
        on: function (event: string, cb: any) {
          if (event === 'message') this.handler = cb;
        },
        send: function () {
          const res = {
            callType: 'action',
            data: { request_id: 123, success: true, session_id: 99 },
          };
          this.handler(JSON.stringify(res));
        },
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
  });

  it('rejects call when in non-operational mode', async () => {
    (service as any).getLiftStatus.mockResolvedValue({
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
