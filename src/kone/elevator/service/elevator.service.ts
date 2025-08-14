import { Injectable } from '@nestjs/common';
import { LiftStatusRequestDTO } from '../dtos/status/LiftStatusRequestDTO';
import { LiftStatusResponseDTO } from '../dtos/status/LiftStatusResponseDTO';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import { BaseResponseDTO } from '../../baseDtos/BaseResponseDTO';
import { DelayDoorRequestDTO } from '../dtos/delay/DelayDoorRequestDTO';
import { ReserveAndCancelRequestDTO } from '../dtos/reserve/ReserveAndCancelRequestDTO';
import { ListElevatorsRequestDTO } from '../dtos/list/ListElevatorsRequestDTO';
import { ListElevatorsResponseDTO } from '../dtos/list/ListElevatorsResponseDTO';
import { CallElevatorResponseDTO } from '../dtos/call/CallElevatorResponseDTO';
import {
  fetchBuildingTopology,
  openWebSocketConnection,
  waitForResponse,
} from '../../common/koneapi';
import { plainToInstance } from 'class-transformer';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import {
  BUILDING_ID_PREFIX,
  BuildingTopology,
  WebSocketResponse,
} from '../../common/types';
import { logIncoming, logOutgoing } from '../../common/logger';

/**
 * Update these two variables with your own credentials or set them up as environment variables.
 */

@Injectable()
export class ElevatorService {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  private getRequestId() {
    return Math.floor(Math.random() * 1000000000);
  }

  private buildingTopologyCache: Map<string, BuildingTopology> = new Map();

  private formatBuildingId(placeId: string): string {
    return placeId.startsWith(BUILDING_ID_PREFIX)
      ? placeId
      : `${BUILDING_ID_PREFIX}${placeId}`;
  }

  async listElevators(
    request: ListElevatorsRequestDTO,
  ): Promise<ListElevatorsResponseDTO> {
    const response = new ListElevatorsResponseDTO();

    const buildingId = this.formatBuildingId(request.placeId);
    const accessToken =
      await this.accessTokenService.getAccessToken(buildingId);

    let topology = this.buildingTopologyCache.get(buildingId);
    if (!topology) {
      logOutgoing('kone fetchBuildingTopology', { buildingId });
      topology = await fetchBuildingTopology(accessToken, buildingId);
      logIncoming('kone fetchBuildingTopology', topology);
      this.buildingTopologyCache.set(buildingId, topology);
    }

    const areaNameMap = new Map(
      topology.areas.map((area) => [area.areaId, area.shortName]),
    );

    response.result = topology.groups.flatMap((group) =>
      group.lifts.map((lift) => {
        const floorNames = new Set<string>();
        lift.floors.forEach((floor) => {
          floor.areasServed.forEach((areaId) => {
            const name = areaNameMap.get(areaId);
            if (name) floorNames.add(name);
          });
        });
        const liftNo = Number(lift.liftId.split(':').pop());
        return {
          liftNo,
          accessibleFloors: Array.from(floorNames).join(','),
          bindingStatus: '11',
        };
      }),
    );

    response.errcode = 0;
    response.errmsg = 'SUCCESS';

    return response;
  }

  // Fetch lift status via WebSocket API
  async getLiftStatus(
    request: LiftStatusRequestDTO,
  ): Promise<LiftStatusResponseDTO> {
    const accessToken = await this.accessTokenService.getAccessToken(
      request.placeId,
    );

    const response = new LiftStatusResponseDTO();

    try {
      const webSocketConnection = await openWebSocketConnection(accessToken);

      const liftStatusPayload = {
        type: 'lift-call-api-v2',
        buildingId: request.placeId,
        callType: 'status',
        payload: {
          lift: request.liftNo,
        },
      };
      logOutgoing('kone websocket status', liftStatusPayload);

      const mode = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          webSocketConnection.close();
          resolve('UNKNOWN');
        }, 2000);

        webSocketConnection.on('message', (data: string) => {
          try {
            const parsed = JSON.parse(data) as {
              callType?: string;
              data?: { lift_mode?: string };
            };
            logIncoming('kone websocket status', parsed);
            if (parsed.callType === 'status') {
              clearTimeout(timer);
              webSocketConnection.close();
              resolve(parsed.data?.lift_mode ?? 'UNKNOWN');
            }
          } catch (err) {
            clearTimeout(timer);
            webSocketConnection.close();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });

        webSocketConnection.send(JSON.stringify(liftStatusPayload));
      });

      response.result = [
        {
          liftNo: request.liftNo,
          floor: 0,
          state: 0,
          prevDirection: 0,
          liftDoorStatus: 0,
          mode,
        },
      ];
      response.errcode = 0;
      response.errmsg = 'SUCCESS';
    } catch (err) {
      console.error('Failed to fetch lift status', err);
      response.result = [
        {
          liftNo: request.liftNo,
          floor: 0,
          state: 0,
          prevDirection: 0,
          liftDoorStatus: 0,
          mode: 'UNKNOWN',
        },
      ];
      response.errcode = 1;
      response.errmsg = 'FAILED';
    }

    return response;
  }

  async callElevator(
    request: CallElevatorRequestDTO,
  ): Promise<CallElevatorResponseDTO> {
    const requestId = this.getRequestId();
    const accessToken = await this.accessTokenService.getAccessToken(
      request.placeId,
    );

    const targetBuildingId = request.placeId;
    let topology = this.buildingTopologyCache.get(targetBuildingId);
    if (!topology) {
      logOutgoing('kone fetchBuildingTopology', { placeId: targetBuildingId });
      topology = await fetchBuildingTopology(accessToken, targetBuildingId);
      logIncoming('kone fetchBuildingTopology', topology);
      this.buildingTopologyCache.set(targetBuildingId, topology);
    }
    const targetGroupId = topology.groups?.[0]?.groupId.split(':').pop() || '1';

    // Check lift operational mode before sending call
    const liftStatus = await this.getLiftStatus(
      request as unknown as LiftStatusRequestDTO,
    );
    const mode = liftStatus.result?.[0]?.mode;
    const NON_OPERATIONAL_MODES = ['FRD', 'OSS', 'ATS', 'PRC'];
    if (mode && NON_OPERATIONAL_MODES.includes(String(mode))) {
      const res = new CallElevatorResponseDTO();
      res.errcode = 1;
      res.errmsg = `Lift in ${mode} mode`;
      return res;
    }

    // Map human-readable floor numbers to KONE area identifiers
    const areaMap = new Map<number, number>();
    topology.areas?.forEach((area) => {
      const floorNum = Number(area.shortName);
      const areaIdNum = Number(area.areaId.split(':').pop());
      if (!isNaN(floorNum) && !isNaN(areaIdNum)) {
        areaMap.set(floorNum, areaIdNum);
      }
    });

    const fromArea = areaMap.get(request.fromFloor) ?? request.fromFloor * 1000;
    const toArea = areaMap.get(request.toFloor) ?? request.toFloor * 1000;

    // Open the WebSocket connection
    const webSocketConnection = await openWebSocketConnection(accessToken);
    logIncoming('kone websocket', { event: 'open' });

    type CallEvent = {
      callType: string;
      data?: { request_id: number; success: boolean; session_id: number };
    };

    // Promise for call event carrying session information
    const callEventPromise = new Promise<CallEvent>((resolve, reject) => {
      const onMessage = (data: string) => {
        try {
          const parsed = JSON.parse(data) as CallEvent;
          logIncoming('kone websocket action', parsed);
          if (
            parsed.callType === 'action' &&
            parsed.data?.request_id === requestId
          ) {
            webSocketConnection.off('message', onMessage);
            resolve(parsed);
          }
        } catch (err) {
          webSocketConnection.off('message', onMessage);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      webSocketConnection.on('message', onMessage);
    });

    // Build the call payload using the areas previously generated
    const destinationCallPayload = {
      type: 'lift-call-api-v2',
      buildingId: targetBuildingId,
      callType: 'action',
      groupId: targetGroupId,
      payload: {
        request_id: requestId,
        area: fromArea, //current floor
        time: new Date().toISOString(),
        terminal: 1,
        // terminal: 10011,
        call: {
          action: 3,
          destination: toArea,
        },
      },
    };
    logOutgoing('kone websocket action', destinationCallPayload);

    // Send the request
    webSocketConnection.send(JSON.stringify(destinationCallPayload));

    // Wait for both acknowledgement and call event
    const [wsResponse, callEvent]: [WebSocketResponse, CallEvent] =
      await Promise.all([
        waitForResponse(webSocketConnection, String(requestId)),
        callEventPromise,
      ]);
    logIncoming('kone websocket acknowledgement', wsResponse);

    const response = new CallElevatorResponseDTO();
    if (callEvent.data?.success) {
      response.errcode = 0;
      response.errmsg = 'SUCCESS';
      response.sessionId = callEvent.data?.session_id;
      response.destination = request.toFloor;
    } else {
      response.errcode = 1;
      response.errmsg = 'FAILURE';
    }
    response.connectionId = wsResponse.connectionId;
    response.requestId = Number(wsResponse.requestId);
    response.statusCode = wsResponse.statusCode;

    return plainToInstance(CallElevatorResponseDTO, response);
  }

  // Delay opening of elevator doors
  async delayElevatorDoors(
    request: DelayDoorRequestDTO,
  ): Promise<BaseResponseDTO> {
    const response = new BaseResponseDTO();
    try {
      const requestId = this.getRequestId();
      const accessToken = await this.accessTokenService.getAccessToken(
        request.placeId,
      );

      let topology = this.buildingTopologyCache.get(request.placeId);
      if (!topology) {
        logOutgoing('kone fetchBuildingTopology', { placeId: request.placeId });
        topology = await fetchBuildingTopology(accessToken, request.placeId);
        logIncoming('kone fetchBuildingTopology', topology);
        this.buildingTopologyCache.set(request.placeId, topology);
      }
      const group = topology.groups?.[0];
      const targetGroupId = group?.groupId.split(':').pop() || '1';
      const lift = group?.lifts.find(
        (l) => Number(l.liftId.split(':').pop()) === request.liftNo,
      );
      const deck = lift?.decks?.[0];
      const servedArea = deck?.areasServed?.[0] || 0;

      const webSocketConnection = await openWebSocketConnection(accessToken);
      const holdOpenPayload = {
        type: 'lift-call-api-v2',
        buildingId: request.placeId,
        groupId: targetGroupId,
        callType: 'hold_open',
        payload: {
          request_id: requestId,
          area: servedArea,
          time: new Date().toISOString(),
          terminal: 1,
          lift_deck: deck?.deckAreaId,
          served_area: servedArea,
          soft_time: request.seconds,
        },
      };
      logOutgoing('kone websocket hold_open', holdOpenPayload);
      webSocketConnection.send(JSON.stringify(holdOpenPayload));

      const wsResponse = await waitForResponse(
        webSocketConnection,
        String(requestId),
      );
      logIncoming('kone websocket acknowledgement', wsResponse);
      webSocketConnection.close();

      response.errcode = wsResponse.statusCode === 200 ? 0 : 1;
      response.errmsg = wsResponse.statusCode === 200 ? 'SUCCESS' : 'FAILURE';
    } catch (err) {
      console.error('Failed to delay elevator doors', err);
      response.errcode = 1;
      response.errmsg = 'FAILED';
    }
    return response;
  }

  // Reserve or Cancel call
  async reserveOrCancelCall(
    request: ReserveAndCancelRequestDTO,
  ): Promise<BaseResponseDTO> {
    const response = new BaseResponseDTO();
    try {
      const requestId = this.getRequestId();
      const accessToken = await this.accessTokenService.getAccessToken(
        request.placeId,
      );

      let topology = this.buildingTopologyCache.get(request.placeId);
      if (!topology) {
        logOutgoing('kone fetchBuildingTopology', { placeId: request.placeId });
        topology = await fetchBuildingTopology(accessToken, request.placeId);
        logIncoming('kone fetchBuildingTopology', topology);
        this.buildingTopologyCache.set(request.placeId, topology);
      }
      const group = topology.groups?.[0];
      const targetGroupId = group?.groupId.split(':').pop() || '1';
      const lift = group?.lifts.find(
        (l) => Number(l.liftId.split(':').pop()) === request.liftNo,
      );
      const area = lift?.floors?.[0]?.areasServed?.[0] || 0;

      const webSocketConnection = await openWebSocketConnection(accessToken);
      const actionPayload = {
        type: 'lift-call-api-v2',
        buildingId: request.placeId,
        groupId: targetGroupId,
        callType: 'action',
        payload: {
          request_id: requestId,
          area,
          time: new Date().toISOString(),
          terminal: 1,
          call: {
            action: request.locked ? 22 : 23,
          },
        },
      };
      logOutgoing('kone websocket action', actionPayload);
      webSocketConnection.send(JSON.stringify(actionPayload));

      const wsResponse = await waitForResponse(
        webSocketConnection,
        String(requestId),
      );
      logIncoming('kone websocket acknowledgement', wsResponse);
      webSocketConnection.close();

      response.errcode = wsResponse.statusCode === 200 ? 0 : 1;
      response.errmsg = wsResponse.statusCode === 200 ? 'SUCCESS' : 'FAILURE';
    } catch (err) {
      console.error('Failed to reserve or cancel call', err);
      response.errcode = 1;
      response.errmsg = 'FAILED';
    }
    return response;
  }
}
