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

  private async getBuildingTopology(
    buildingId: string,
  ): Promise<BuildingTopology> {
    let topology = this.buildingTopologyCache.get(buildingId);
    if (!topology) {
      const token = await this.accessTokenService.getAccessToken(buildingId);
      topology = await fetchBuildingTopology(token, buildingId);
      this.buildingTopologyCache.set(buildingId, topology);
    }
    return topology;
  }

  async listElevators(
    request: ListElevatorsRequestDTO,
  ): Promise<ListElevatorsResponseDTO> {
    const response = new ListElevatorsResponseDTO();

    const buildingId = this.formatBuildingId(request.placeId);
    const topology = await this.getBuildingTopology(buildingId);
    const destinationNameMap = new Map<number, string>(
      (topology as any).destinations?.map((dest: any) => [
        dest.group_floor_id,
        dest.short_name,
      ]) || [],
    );

    response.result =
      (topology as any).groups?.flatMap((group: any) =>
        (group.lifts || []).map((lift: any) => {
          const floorNames = new Set<string>();
          (lift.floors || []).forEach((floor: any) => {
            const name = destinationNameMap.get(floor.group_floor_id);
            if (name) floorNames.add(name);
          });
          const liftNo =
            typeof lift.lift_id !== 'undefined'
              ? Number(lift.lift_id)
              : Number(String(lift.liftId).split(':').pop());
          return {
            liftNo,
            accessibleFloors: Array.from(floorNames).join(','),
            bindingStatus: '11',
          };
        }),
      ) || [];

    response.errcode = 0;
    response.errmsg = 'SUCCESS';

    return response;
  }

  // Fetch lift status via WebSocket API
  async getLiftStatus(
    request: LiftStatusRequestDTO,
  ): Promise<LiftStatusResponseDTO> {
    const buildingId = this.formatBuildingId(request.placeId);
    const accessToken =
      await this.accessTokenService.getAccessToken(buildingId);
    const response = new LiftStatusResponseDTO();

    try {
      let topology = this.buildingTopologyCache.get(buildingId);
      if (!topology) {
        logOutgoing('kone fetchBuildingConfig', { buildingId });
        topology = await fetchBuildingTopology(accessToken, buildingId);
        logIncoming('kone fetchBuildingConfig', topology);
        this.buildingTopologyCache.set(buildingId, topology);
      }
      const group = topology.groups?.[0];
      const targetGroupId = group?.groupId.split(':').pop() || '1';

      const webSocketConnection = await openWebSocketConnection(accessToken);

      const monitorPayload = {
        type: 'site-monitoring',
        buildingId,
        callType: 'monitor',
        groupId: targetGroupId,
        payload: {
          sub: `status-${Date.now()}`,
          duration: 30,
          subtopics: [
            `lift_status/${request.liftNo}`,
            `lift_position/${request.liftNo}`,
          ],
        },
      };
      logOutgoing('kone websocket monitor', monitorPayload);
      webSocketConnection.send(JSON.stringify(monitorPayload));

      const status: {
        mode?: string;
        floor?: number;
        dir?: string;
        moving_state?: string;
        door?: boolean;
      } = {};

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          webSocketConnection.close();
          resolve();
        }, 2000);

        webSocketConnection.on('message', (data: string) => {
          try {
            const msg = JSON.parse(data);
            logIncoming('kone websocket monitor', msg);
            if (
              msg.callType === 'monitor-lift-status' ||
              msg.topic?.startsWith('lift_status')
            ) {
              status.mode = msg.data?.lift_mode ?? msg.payload?.lift_mode;
            }
            if (
              msg.callType === 'monitor-lift-position' ||
              msg.callType === 'monitor-deck-position' ||
              msg.topic?.startsWith('lift_position') ||
              msg.topic?.startsWith('deck_position')
            ) {
              const d = msg.data || msg.payload || {};
              status.floor = d.cur ?? status.floor;
              status.dir = d.dir ?? status.dir;
              status.moving_state = d.moving_state ?? status.moving_state;
              status.door = typeof d.door === 'boolean' ? d.door : status.door;
            }
            if (
              status.mode !== undefined &&
              status.floor !== undefined &&
              status.dir !== undefined &&
              status.moving_state !== undefined &&
              status.door !== undefined
            ) {
              clearTimeout(timer);
              webSocketConnection.close();
              resolve();
            }
          } catch {
            // ignore
          }
        });
      });

      const directionMap: Record<string, number> = { UP: 1, DOWN: 2 };
      const movingMap: Record<string, number> = {
        MOVING: 1,
        STARTING: 1,
        DECELERATING: 1,
        STOPPED: 0,
        STANDING: 0,
      };

      response.result = [
        {
          liftNo: request.liftNo,
          floor: status.floor ?? 0,
          state: movingMap[status.moving_state || ''] ?? 0,
          prevDirection: directionMap[status.dir || ''] ?? 0,
          liftDoorStatus: status.door ? 1 : 0,
          mode: status.mode ?? 'UNKNOWN',
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
    const targetBuildingId = this.formatBuildingId(request.placeId);
    let topology = this.buildingTopologyCache.get(targetBuildingId);
    if (!topology) {
      const buildingToken =
        await this.accessTokenService.getAccessToken(targetBuildingId);
      logOutgoing('kone fetchBuildingConfig', { placeId: targetBuildingId });
      topology = await fetchBuildingTopology(buildingToken, targetBuildingId);
      logIncoming('kone fetchBuildingConfig', topology);
      this.buildingTopologyCache.set(targetBuildingId, topology);
    }
    const accessToken = await this.accessTokenService.getAccessToken(
      request.placeId,
    );
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
        logOutgoing('kone fetchBuildingConfig', { placeId: request.placeId });
        topology = await fetchBuildingTopology(accessToken, request.placeId);
        logIncoming('kone fetchBuildingConfig', topology);
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
        logOutgoing('kone fetchBuildingConfig', { placeId: request.placeId });
        topology = await fetchBuildingTopology(accessToken, request.placeId);
        logIncoming('kone fetchBuildingConfig', topology);
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
