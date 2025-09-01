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
import { LiftPositionDTO } from '../dtos/monitor/LiftPositionDTO';
import { LiftDoorDTO } from '../dtos/monitor/LiftDoorDTO';
import {
  fetchBuildingTopology,
  openWebSocketConnection,
  waitForResponse,
} from '../../common/koneapi';
import { plainToInstance } from 'class-transformer';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { DeviceService } from '../../device/service/device.service';
import {
  BUILDING_ID_PREFIX,
  BuildingTopology,
  WebSocketResponse,
} from '../../common/types';
import { logIncoming, logOutgoing } from '../../common/logger';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

/**
 * Update these two variables with your own credentials or set them up as environment variables.
 */

@Injectable()
export class ElevatorService {
  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly deviceService?: DeviceService,
  ) {}

  private getRequestId() {
    return Math.floor(Math.random() * 1000000000);
  }

  private buildingTopologyCache: Map<string, BuildingTopology> = new Map();

  // Cache of terminals per building/group: key -> Map(terminal_id -> type)
  private terminalsCache: Map<string, Map<number, string>> = new Map();

  private getTerminalMap(
    buildingId: string,
    groupId: string,
    topology?: any,
  ): Map<number, string> {
    const key = `${buildingId}|${groupId}`;
    let map = this.terminalsCache.get(key);
    if (!map) {
      map = new Map<number, string>();
      // Prefer terminals from config topology event
      const terminals = (topology as any)?.terminals || [];
      if (Array.isArray(terminals)) {
        for (const t of terminals) {
          const id = Number(t?.terminal_id);
          const type = String(t?.type || '').trim();
          if (!isNaN(id) && type) map.set(id, type);
        }
      }
      // Fallback: parse env JSON if provided
      if (map.size === 0) {
        const raw =
          process.env.KONE_TERMINALS || process.env.ELEVATOR_TERMINALS || '[]';
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            for (const t of arr) {
              const id = Number(t?.terminal_id);
              const type = String(t?.type || '').trim();
              if (!isNaN(id) && type) map.set(id, type);
            }
          }
        } catch {
          // ignore
        }
      }
      this.terminalsCache.set(key, map);
    }
    return map;
  }

  private pickTerminalId(
    buildingId: string,
    groupId: string,
    topology?: any,
    groupTerminals?: number[],
  ): number {
    const map = this.getTerminalMap(buildingId, groupId, topology);
    // Candidates with type 'virtual' (case-insensitive)
    const virtualIds = Array.from(map.entries())
      .filter(([, t]) => t.toLowerCase() === 'virtual')
      .map(([id]) => id);
    if (virtualIds.length === 0) {
      return Number(process.env.KONE_DEFAULT_TERMINAL_ID || 1001);
    }
    const groupTermList: number[] = Array.isArray(groupTerminals)
      ? groupTerminals
      : (topology as any)?.groups?.[0]?.terminals || [];
    if (Array.isArray(groupTermList) && groupTermList.length > 0) {
      const match = virtualIds.find((id) => groupTermList.includes(id));
      if (match) return match;
    }
    return virtualIds[0];
  }

  private formatBuildingId(id: string): string {
    return id.startsWith(BUILDING_ID_PREFIX) ? id : `${BUILDING_ID_PREFIX}${id}`;
  }

  // Parses robot request placeId into KONE buildingId and groupId
  // Accepts formats like:
  // - "building:123456" (no group -> defaults to '1')
  // - "building:123456:2" (explicit group)
  // - "123456" (no prefix; no group)
  // - "123456:2" (no prefix; explicit group)
  private parsePlaceId(placeId: string): { buildingId: string; groupId: string } {
    let buildingPart = placeId;
    let groupId = '1';
    const parts = String(placeId).split(':');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) {
        groupId = last;
        buildingPart = parts.slice(0, parts.length - 1).join(':');
      }
    }
    const buildingId = this.formatBuildingId(buildingPart);
    return { buildingId, groupId };
  }

  // Ensure elevator heartbeat before proceeding with any WebSocket action
  private async ensureHeartbeat(
    webSocketConnection: WebSocket,
    buildingId: string,
    groupId: string,
  ): Promise<void> {
    const maxWaitMs = Number(process.env.KONE_HEARTBEAT_TIMEOUT_MS || 30000);
    const intervalMs = Number(process.env.KONE_HEARTBEAT_INTERVAL_MS || 1000);
    const started = Date.now();

    while (true) {
      const elapsed = Date.now() - started;
      if (elapsed > maxWaitMs) {
        throw new Error('Heartbeat check timed out');
      }

      const requestId = this.getRequestId();
      const payload = {
        type: 'common-api',
        buildingId,
        callType: 'ping',
        payload: { request_id: requestId },
        groupId,
      } as const;

      try {
        logOutgoing('kone websocket ping', payload);
        webSocketConnection.send(JSON.stringify(payload));
        const res = await waitForResponse(
          webSocketConnection,
          String(requestId),
          5,
          true,
        );
        logIncoming('kone websocket ping', res);
        // Treat any 'ok' (typically 200/201) as healthy
        return;
      } catch (err: any) {
        const code = err?.statusCode ?? err?.code;
        // Keep pinging on end-to-end comms error (1005) or timeouts
        if (code === 1005 || /timeout/i.test(String(err?.message || ''))) {
          await new Promise((r) => setTimeout(r, intervalMs));
          continue;
        }
        // Other errors are considered fatal for heartbeat
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  private async getBuildingTopology(
    buildingId: string,
    groupId: string,
  ): Promise<BuildingTopology> {
    const cacheKey = `${buildingId}|${groupId}`;
    let topology = this.buildingTopologyCache.get(cacheKey);
    if (!topology) {
      const token = await this.accessTokenService.getAccessToken(
        buildingId,
        groupId,
      );
      topology = await fetchBuildingTopology(token, buildingId, groupId);
      this.buildingTopologyCache.set(cacheKey, topology);
    }
    return topology;
  }

  async listElevators(
    request: ListElevatorsRequestDTO,
  ): Promise<ListElevatorsResponseDTO> {
    const response = new ListElevatorsResponseDTO();

    const { buildingId, groupId } = this.parsePlaceId(request.placeId);
    const topology = await this.getBuildingTopology(buildingId, groupId);
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
            if (name) {
              const numeric = name.replace(/\D/g, '');
              if (numeric) floorNames.add(numeric);
            }
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
    const { buildingId, groupId } = this.parsePlaceId(request.placeId);
    const accessToken = await this.accessTokenService.getAccessToken(
      buildingId,
      groupId,
    );
    const response = new LiftStatusResponseDTO();

    try {
      const cacheKey = `${buildingId}|${groupId}`;
      let topology = this.buildingTopologyCache.get(cacheKey);
      if (!topology) {
        logOutgoing('kone fetchBuildingConfig', { buildingId, groupId });
        topology = await fetchBuildingTopology(accessToken, buildingId, groupId);
        logIncoming('kone fetchBuildingConfig', topology);
        this.buildingTopologyCache.set(cacheKey, topology);
      }
      const targetGroupId = groupId;

      const webSocketConnection = await openWebSocketConnection(accessToken);
      // Heartbeat gate: ensure connection is healthy before subscribing
      await this.ensureHeartbeat(webSocketConnection as unknown as WebSocket, buildingId, groupId);
      const requestId = uuidv4();
      const monitorPayload = {
        type: 'site-monitoring',
        requestId,
        buildingId,
        callType: 'monitor',
        groupId: targetGroupId,
        payload: {
          sub: `status-${Date.now()}`,
          duration: 30,
          subtopics: [
            `lift_${request.liftNo}/position`,
            `lift_${request.liftNo}/doors`,
            // Subscribe to lift status updates to receive lift_mode
            `lift_${request.liftNo}/status`,
          ],
        },
      };
      logOutgoing('kone websocket monitor', monitorPayload);
      webSocketConnection.send(JSON.stringify(monitorPayload));
      const ack = await waitForResponse(
        webSocketConnection,
        requestId,
        10,
        true,
      );
      logIncoming('kone websocket acknowledgement', ack);
      const doorMap: Record<string, number> = {
        OPENING: 1,
        OPENED: 1,
        CLOSING: 2,
        CLOSED: 2,
      };
      const cache: { position?: LiftPositionDTO } = {};
      let modeStr = 'UNKNOWN';
      let doorState = 0;
      let doorReceived = false;

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          webSocketConnection.close();
          resolve();
        }, 2000);

        const checkComplete = () => {
          if (cache.position && doorReceived) {
            setTimeout(() => {
              clearTimeout(timer);
              webSocketConnection.close();
              resolve();
            }, 200);
          }
        };
        webSocketConnection.on('message', (data: string) => {
          try {
            const msg = JSON.parse(data);
            logIncoming('kone websocket monitor', msg);
            if (msg.subtopic === `lift_${request.liftNo}/position`) {
              cache.position = plainToInstance(LiftPositionDTO, msg.data);
              // Some streams provide door state in position payload
              if (typeof (msg.data?.door) !== 'undefined') {
                doorState = msg.data.door ? 1 : 0;
                doorReceived = true;
              }
              checkComplete();
            } else if (msg.subtopic === `lift_${request.liftNo}/doors`) {
              const door = plainToInstance(LiftDoorDTO, msg.data);
              const mapped = doorMap[door.state] ?? 0;
              if (mapped === 1) {
                doorState = 1;
              } else if (doorState === 0) {
                doorState = mapped;
              }
              doorReceived = true;
              checkComplete();
            } else if (msg.subtopic === `lift_${request.liftNo}/status`) {
              // Lift mode is provided here for site-monitoring 'lift-status'
              if (msg.data?.lift_mode !== undefined && msg.data?.lift_mode !== null) {
                modeStr = String(msg.data.lift_mode);
              }
              checkComplete();
            } else if (msg.callType === 'monitor-lift-position') {
              cache.position = plainToInstance(LiftPositionDTO, msg.data);
              if (typeof (msg.data?.door) !== 'undefined') {
                doorState = msg.data.door ? 1 : 0;
                doorReceived = true;
              }
              checkComplete();
            } else if (msg.callType === 'monitor-lift-status') {
              if (msg.data?.lift_mode) {
                modeStr = String(msg.data.lift_mode);
              }
              checkComplete();
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
      const floor = cache.position?.cur ?? 0;
      const direction = directionMap[cache.position?.dir || ''] ?? 0;
      const moving = movingMap[cache.position?.moving_state || ''] ?? 0;

      response.result = [
        {
          liftNo: request.liftNo,
          floor,
          state: moving,
          prevDirection: direction,
          liftDoorStatus: doorState,
          mode: modeStr || cache.position?.drive_mode || 'UNKNOWN',
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
    const { buildingId: targetBuildingId, groupId } = this.parsePlaceId(
      request.placeId,
    );
    const cacheKey = `${targetBuildingId}|${groupId}`;
    let topology = this.buildingTopologyCache.get(cacheKey);
    if (!topology) {
      const buildingToken = await this.accessTokenService.getAccessToken(
        targetBuildingId,
        groupId,
      );
      logOutgoing('kone fetchBuildingConfig', {
        buildingId: targetBuildingId,
        groupId,
      });
      topology = await fetchBuildingTopology(
        buildingToken,
        targetBuildingId,
        groupId,
      );
      logIncoming('kone fetchBuildingConfig', topology);
      this.buildingTopologyCache.set(cacheKey, topology);
    }
    const accessToken = await this.accessTokenService.getAccessToken(
      targetBuildingId,
      groupId,
    );
    const targetGroupId = groupId;

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
      const floorNum = parseInt(String(area.shortName).replace(/\D/g, ''), 10);
      const areaIdNum = Number(area.areaId.split(':').pop());
      if (!isNaN(floorNum) && !isNaN(areaIdNum)) {
        areaMap.set(floorNum, areaIdNum);
      }
    });

    const fromArea = areaMap.get(request.fromFloor) ?? request.fromFloor * 1000;
    const toArea = areaMap.get(request.toFloor) ?? request.toFloor * 1000;

    // Determine allowed lifts (only those bound to the device)
    const groups = topology.groups || [];
    const groupObj =
      groups.find((g: any) =>
        String(g.groupId || '')
          .split(':')
          .pop()
          ?.toString() === String(targetGroupId),
      ) || groups[0];
    const groupLiftNumbers: number[] = (groupObj?.lifts || [])
      .map((l: any) => Number(String(l?.liftId || l?.lift_id).split(':').pop()))
      .filter((n: any) => !isNaN(n));
    const boundSet = new Set<number>(
      (this.deviceService?.getBoundLiftsForDevice?.(request.deviceUuid) || [])
        .map((n) => Number(n))
        .filter((n) => !isNaN(n)),
    );
    let allowedLifts: number[] = groupLiftNumbers.filter((n) => boundSet.has(n));
    if (allowedLifts.length === 0) {
      // fallback to request.liftNo if nothing intersects or bindings unknown
      if (
        (this.deviceService?.isDeviceBoundToLift?.(
          request.deviceUuid,
          request.liftNo,
        ) ?? true) || groupLiftNumbers.includes(request.liftNo)
      ) {
        allowedLifts = [request.liftNo];
      }
    }

    // Select terminal from config (common-api config) with type 'Virtual'
    const virtualTerminalId = this.pickTerminalId(
      targetBuildingId,
      targetGroupId,
      topology,
      (groupObj as any)?.terminals,
    );

    // Open the WebSocket connection
      const webSocketConnection = await openWebSocketConnection(accessToken);
      // Heartbeat gate: ensure connection is healthy before sending action
      await this.ensureHeartbeat(webSocketConnection as unknown as WebSocket, targetBuildingId, targetGroupId);
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
        terminal: virtualTerminalId,
        
        // terminal: 10011,
        call: {
          action: 2,
          //allowed_lifts: allowedLifts,
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
        waitForResponse(webSocketConnection, String(requestId), 10, true),
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
      const { buildingId, groupId } = this.parsePlaceId(request.placeId);
      const accessToken = await this.accessTokenService.getAccessToken(
        buildingId,
        groupId,
      );

      const cacheKey = `${buildingId}|${groupId}`;
      let topology = this.buildingTopologyCache.get(cacheKey);
      if (!topology) {
        logOutgoing('kone fetchBuildingConfig', { buildingId, groupId });
        topology = await fetchBuildingTopology(accessToken, buildingId, groupId);
        logIncoming('kone fetchBuildingConfig', topology);
        this.buildingTopologyCache.set(cacheKey, topology);
      }
      const group = topology.groups?.[0];
      const targetGroupId = groupId;
      const lift = group?.lifts.find(
        (l) => Number(l.liftId.split(':').pop()) === request.liftNo,
      );
      const deck = lift?.decks?.[0];
      const servedArea = deck?.areasServed?.[0] || 0;

      const webSocketConnection = await openWebSocketConnection(accessToken);
      // Heartbeat gate: ensure connection is healthy before sending hold_open
      await this.ensureHeartbeat(webSocketConnection as unknown as WebSocket, buildingId, targetGroupId);
      const holdOpenPayload = {
        type: 'lift-call-api-v2',
        buildingId,
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
      const { buildingId, groupId } = this.parsePlaceId(request.placeId);
      const accessToken = await this.accessTokenService.getAccessToken(
        buildingId,
        groupId,
      );

      const cacheKey = `${buildingId}|${groupId}`;
      let topology = this.buildingTopologyCache.get(cacheKey);
      if (!topology) {
        logOutgoing('kone fetchBuildingConfig', { buildingId, groupId });
        topology = await fetchBuildingTopology(accessToken, buildingId, groupId);
        logIncoming('kone fetchBuildingConfig', topology);
        this.buildingTopologyCache.set(cacheKey, topology);
      }
      const group = topology.groups?.[0];
      const targetGroupId = groupId;
      const lift = group?.lifts.find(
        (l) => Number(l.liftId.split(':').pop()) === request.liftNo,
      );
      const area = lift?.floors?.[0]?.areasServed?.[0] || 0;

      const webSocketConnection = await openWebSocketConnection(accessToken);
      // Heartbeat gate: ensure connection is healthy before sending action
      await this.ensureHeartbeat(webSocketConnection as unknown as WebSocket, buildingId, targetGroupId);
      const actionPayload = {
        type: 'lift-call-api-v2',
        buildingId,
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
