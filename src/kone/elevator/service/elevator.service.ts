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

  // Cache floor/area mappings per building/group
  private floorAreaCache: Map<
    string,
    {
      byFloor: Map<
        number,
        Array<{
          areaId: number;
          shortName: string;
          groupSide?: number;
          terminals: number[];
        }>
      >;
      byArea: Map<
        number,
        {
          floor: number;
          shortName: string;
          groupSide?: number;
          terminals: number[];
        }
      >;
      groupTerminals: number[];
    }
  > = new Map();

  // In-memory rate limiting per deviceUuid for callElevator
  private callRateLimit: Map<string, { count: number; windowStart: number }> =
    new Map();

  // Idempotency cache for callElevator per device+journey key
  private callIdempotencyCache: Map<
    string,
    { expiresAt: number; response: CallElevatorResponseDTO }
  > = new Map();

  // Persist last successful call context per device+place+lift
  private lastDoorHoldContext: Map<
    string,
    {
      buildingId: string;
      groupId: string;
      liftNo: number;
      servedArea: number; // source area used when calling the lift
      liftDeck: number; // deck identifier matching the number used in allowed_lifts
      terminalId?: number;
      updatedAt: number;
    }
  > = new Map();

  private getDoorCtxKey(
    deviceUuid: string,
    buildingId: string,
    groupId: string,
    liftNo: number,
  ) {
    return `${deviceUuid}|${buildingId}|${groupId}|${liftNo}`;
  }

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
    preferredType?: string | string[],
  ): number {
    const map = this.getTerminalMap(buildingId, groupId, topology);

    // Normalize preferences. Default to 'virtual' if not provided.
    const prefs: string[] = (
      Array.isArray(preferredType)
        ? preferredType
        : preferredType
          ? [preferredType]
          : ['virtual']
    )
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());

    // Helper: canonicalize terminal type names and check match by substring
    const typeMatches = (termType: string, wanted: string) => {
      const t = String(termType || '').toLowerCase();
      const w = String(wanted || '').toLowerCase();
      if (w === '*' || w === 'any') return true;
      // common aliases/contains matching
      const canonicalWanted = w;
      const canonicalType = t.includes('virtual')
        ? 'virtual'
        : t.includes('dop')
          ? 'vcs'
          : t.includes('lcs')
            ? 'lcs'
            : t;
      return (
        canonicalType === canonicalWanted || t.includes(w) // fallback contains check
      );
    };

    // Build candidates for each preferred type in order
    const entries = Array.from(map.entries()); // [id, type]
    const groupTermList: number[] = Array.isArray(groupTerminals)
      ? groupTerminals
      : (topology as any)?.groups?.[0]?.terminals || [];

    for (const pref of prefs) {
      const idsForType = entries
        .filter(([, t]) => typeMatches(t, pref))
        .map(([id]) => id);
      if (idsForType.length === 0) continue;

      // Prefer a terminal that's part of the group's terminals, if available
      if (Array.isArray(groupTermList) && groupTermList.length > 0) {
        const match = idsForType.find((id) => groupTermList.includes(id));
        if (typeof match === 'number') return match;
      }
      return idsForType[0];
    }

    // If no preferred type found, try any terminal within the group
    if (Array.isArray(groupTermList) && groupTermList.length > 0) {
      const anyInGroup = entries
        .map(([id]) => id)
        .find((id) => groupTermList.includes(id));
      if (typeof anyInGroup === 'number') return anyInGroup;
    }

    // Fallback to env default or a deterministic first entry
    if (entries.length === 0) {
      return Number(process.env.KONE_DEFAULT_TERMINAL_ID || 1001);
    }
    return entries[0][0];
  }

  private formatBuildingId(id: string): string {
    return id.startsWith(BUILDING_ID_PREFIX)
      ? id
      : `${BUILDING_ID_PREFIX}${id}`;
  }

  private buildFloorAreaMappings(
    buildingId: string,
    groupId: string,
    topology: any,
  ) {
    const key = `${buildingId}|${groupId}`;
    let entry = this.floorAreaCache.get(key);
    if (entry) return entry;

    const byFloor = new Map<
      number,
      Array<{
        areaId: number;
        shortName: string;
        groupSide?: number;
        terminals: number[];
      }>
    >();
    const byArea = new Map<
      number,
      {
        floor: number;
        shortName: string;
        groupSide?: number;
        terminals: number[];
      }
    >();

    const parseFloorNum = (name: any): number => {
      const m = String(name ?? '').match(/-?\d+/);
      return m ? parseInt(m[0], 10) : NaN;
    };

    const group =
      (topology?.groups || []).find(
        (g: any) =>
          String(g?.groupId || g?.group_id || '')
            .split(':')
            .pop()
            ?.toString() === String(groupId),
      ) || topology?.groups?.[0];
    const groupTerminals: number[] = Array.isArray(group?.terminals)
      ? group.terminals.map((n: any) => Number(n)).filter((n: any) => !isNaN(n))
      : [];

    const pushEntry = (
      floor: number,
      areaId: number,
      shortName: string,
      groupSide?: number,
      terminals: number[] = [],
    ) => {
      if (isNaN(floor) || isNaN(areaId)) return;
      const arr = byFloor.get(floor) || [];
      const e = { areaId, shortName, groupSide, terminals };
      arr.push(e);
      byFloor.set(floor, arr);
      byArea.set(areaId, { floor, shortName, groupSide, terminals });
    };

    if (Array.isArray(topology?.destinations) && topology.destinations.length) {
      for (const d of topology.destinations) {
        const floor = parseFloorNum(d?.short_name);
        const areaId = Number(
          typeof d?.area_id === 'number'
            ? d.area_id
            : String(d?.area_id || '')
                .split(':')
                .pop(),
        );
        const side =
          typeof d?.group_side === 'number' ? Number(d.group_side) : undefined;
        const terms: number[] = Array.isArray(d?.terminals)
          ? d.terminals.map((t: any) => Number(t)).filter((n: any) => !isNaN(n))
          : [];
        pushEntry(floor, areaId, String(d?.short_name ?? ''), side, terms);
      }
    }

    if (!byFloor.size && Array.isArray(topology?.areas)) {
      for (const a of topology.areas) {
        const floor = parseFloorNum(a?.shortName);
        const areaId = Number(
          String(a?.areaId || '')
            .split(':')
            .pop(),
        );
        pushEntry(floor, areaId, String(a?.shortName ?? ''));
      }
    }

    entry = { byFloor, byArea, groupTerminals };
    this.floorAreaCache.set(key, entry);
    return entry;
  }

  private mapFloorToAreaByRule(floor: number, groupId: string): number {
    const gid = Number(String(groupId).split(':').pop());
    if (!isFinite(floor) || isNaN(floor)) return 0;
    if (gid === 2) return floor * 1000 + 20; // group 2 -> XX020
    // default/group 1 -> XX000
    return floor * 1000;
  }

  private areaIdLooksLikeFloor(areaId: number, floor: number): boolean {
    if (typeof areaId !== 'number' || isNaN(areaId)) return false;
    const thousands = Math.floor(areaId / 1000);
    return thousands === floor;
  }

  private resolveAreaIdForFloor(
    buildingId: string,
    groupId: string,
    topology: any,
    floor: number,
    preferredTerminalId?: number,
  ): number {
    const mapping = this.buildFloorAreaMappings(buildingId, groupId, topology);
    const candidates = mapping.byFloor.get(floor);
    // Try topology candidates first, but validate that thousands part matches the floor
    if (Array.isArray(candidates) && candidates.length) {
      if (preferredTerminalId) {
        const match = candidates.find(
          (c) =>
            Array.isArray(c.terminals) &&
            c.terminals.includes(preferredTerminalId),
        );
        if (match && this.areaIdLooksLikeFloor(match.areaId, floor)) {
          return match.areaId;
        }
      }
      const first = candidates.find((c) =>
        this.areaIdLooksLikeFloor(c.areaId, floor),
      );
      if (first) return first.areaId;
      // If candidates exist but do not numerically match the requested floor, use rule-based mapping
      return this.mapFloorToAreaByRule(floor, groupId);
    }
    // No candidates — use rule-based mapping
    return this.mapFloorToAreaByRule(floor, groupId);
  }

  private getLiftNumber(lift: any): number {
    if (lift == null) return NaN;
    const direct = lift.lift_id ?? lift.liftNo ?? lift.id;
    if (typeof direct !== 'undefined') {
      const n = Number(direct);
      if (!isNaN(n)) return n;
    }
    const raw = lift.liftId ?? lift.lift_id_str ?? lift.identifier;
    if (raw != null) {
      const tail = String(raw).split(':').pop();
      const n = Number(tail);
      if (!isNaN(n)) return n;
    }
    return NaN;
  }

  // Parses robot request placeId into KONE buildingId and groupId
  // Accepts formats like:
  // - "building:123456" (no group -> defaults to '1')
  // - "building:123456:2" (explicit group)
  // - "123456" (no prefix; no group)
  // - "123456:2" (no prefix; explicit group)
  private parsePlaceId(placeId: string): {
    buildingId: string;
    groupId: string;
  } {
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
    const pingEventTimeoutMs = Number(
      process.env.KONE_HEARTBEAT_PING_EVENT_TIMEOUT_MS || 5000,
    );
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
        // Prepare listener for the ping event before sending
        const pingEventPromise: Promise<void> = new Promise(
          (resolve, reject) => {
            const timer = setTimeout(() => {
              webSocketConnection.off('message', onMessage);
              reject(new Error('Ping event timeout'));
            }, pingEventTimeoutMs);

            const onMessage = (data: string) => {
              try {
                const msg = JSON.parse(data);
                if (
                  msg?.callType === 'ping' &&
                  String(msg?.data?.request_id) === String(requestId)
                ) {
                  clearTimeout(timer);
                  webSocketConnection.off('message', onMessage);
                  logIncoming('kone websocket ping', msg);
                  resolve();
                }
              } catch {
                // ignore non-JSON
              }
            };
            // Ensure we see the event even if other listeners are added later
            webSocketConnection.prependListener('message', onMessage);
          },
        );

        logOutgoing('kone websocket ping', payload);
        webSocketConnection.send(JSON.stringify(payload));

        const res = await waitForResponse(
          webSocketConnection,
          String(requestId),
          5,
          true,
        );
        logIncoming('kone websocket acknowledgement', res);
        // Wait for the ping event to arrive before proceeding
        await pingEventPromise;
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
  // Optionally reuse an existing WebSocket connection (do not close it)
  async getLiftStatus(
    request: LiftStatusRequestDTO,
    existingConnection?: WebSocket,
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
        topology = await fetchBuildingTopology(
          accessToken,
          buildingId,
          groupId,
        );
        logIncoming('kone fetchBuildingConfig', topology);
        this.buildingTopologyCache.set(cacheKey, topology);
      }
      const targetGroupId = groupId;
      const webSocketConnection =
        existingConnection || (await openWebSocketConnection(accessToken));
      // Heartbeat gate: ensure connection is healthy before subscribing
      await this.ensureHeartbeat(
        webSocketConnection as unknown as WebSocket,
        buildingId,
        groupId,
      );
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
        const shouldClose = !existingConnection;
        const timer = setTimeout(() => {
          if (shouldClose) webSocketConnection.close();
          webSocketConnection.off('message', onMessage);
          resolve();
        }, 2000);

        const checkComplete = () => {
          if (cache.position && doorReceived) {
            setTimeout(() => {
              clearTimeout(timer);
              if (shouldClose) webSocketConnection.close();
              webSocketConnection.off('message', onMessage);
              resolve();
            }, 200);
          }
        };
        const onMessage = (data: string) => {
          try {
            const msg = JSON.parse(data);
            if (msg?.callType === 'ping') {
              // Ignore ping events here to avoid mislabeling as monitor
              return;
            }
            logIncoming('kone websocket monitor', msg);
            if (msg.subtopic === `lift_${request.liftNo}/position`) {
              cache.position = plainToInstance(LiftPositionDTO, msg.data);
              // Some streams provide door state in position payload
              if (typeof msg.data?.door !== 'undefined') {
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
              if (
                msg.data?.lift_mode !== undefined &&
                msg.data?.lift_mode !== null
              ) {
                modeStr = String(msg.data.lift_mode);
              }
              checkComplete();
            } else if (msg.callType === 'monitor-lift-position') {
              cache.position = plainToInstance(LiftPositionDTO, msg.data);
              if (typeof msg.data?.door !== 'undefined') {
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
        };
        webSocketConnection.on('message', onMessage);
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

    // Idempotency check: if same device + journey within TTL, return cached response
    const idempTtlMs = Number(
      process.env.KONE_CALL_IDEMPOTENCY_TTL_MS || 10_000,
    );
    const journeyKey = `${request.deviceUuid}|${targetBuildingId}|${groupId}|${request.fromFloor}|${request.toFloor}`;
    const cached = this.callIdempotencyCache.get(journeyKey);
    if (cached && Date.now() < cached.expiresAt) {
      return plainToInstance(CallElevatorResponseDTO, cached.response);
    }

    // Rate limiting per deviceUuid
    const windowMs = Number(process.env.KONE_CALL_RATE_WINDOW_MS || 10_000);
    const maxReq = Number(process.env.KONE_CALL_RATE_MAX_REQUESTS || 5);
    const rl = this.callRateLimit.get(request.deviceUuid) || {
      count: 0,
      windowStart: Date.now(),
    };
    const now = Date.now();
    if (now - rl.windowStart > windowMs) {
      rl.windowStart = now;
      rl.count = 0;
    }
    if (rl.count >= maxReq) {
      const limited = new CallElevatorResponseDTO();
      limited.errcode = 1;
      limited.errmsg = 'RATE_LIMITED';
      return limited;
    }
    rl.count += 1;
    this.callRateLimit.set(request.deviceUuid, rl);
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

    // Open a WebSocket for this endpoint, ping using the same connection
    const webSocketConnection = await openWebSocketConnection(accessToken);
    try {
      await this.ensureHeartbeat(
        webSocketConnection as unknown as WebSocket,
        targetBuildingId,
        targetGroupId,
      );

      // Resolve target group and its topology
      const groups = topology.groups || [];
      const groupObj =
        groups.find(
          (g: any) =>
            String(g.groupId || '')
              .split(':')
              .pop()
              ?.toString() === String(targetGroupId),
        ) || groups[0];

      // Map lift numbers -> deck area ids (prefer deck index 0)
      const liftDeckAreas = new Map<number, number[]>();
      try {
        for (const l of ((groupObj as any)?.lifts || []) as any[]) {
          const liftNo = Number(
            String((l as any)?.liftId || (l as any)?.lift_id)
              .split(':')
              .pop(),
          );
          if (isNaN(liftNo)) continue;
          const decks = Array.isArray((l as any)?.decks)
            ? (l as any).decks
            : [];
          const areas: number[] = [];
          for (const d of decks as any[]) {
            // area id may be available either as numeric area_id or prefixed deckAreaId
            const raw =
              typeof (d as any)?.area_id !== 'undefined'
                ? (d as any).area_id
                : (d as any)?.deckAreaId;
            const areaNum = Number(
              String(raw ?? '')
                .split(':')
                .pop(),
            );
            // prefer deck 0; include other decks only if deck is undefined
            const deckIndex =
              typeof (d as any)?.deck === 'number'
                ? Number((d as any).deck)
                : typeof (d as any)?.deckIndex === 'number'
                  ? Number((d as any).deckIndex)
                  : undefined;
            if (!isNaN(areaNum)) {
              if (deckIndex === 0) areas.push(areaNum);
              else if (deckIndex === undefined) areas.push(areaNum);
            }
          }
          if (areas.length) liftDeckAreas.set(liftNo, areas);
        }
      } catch {
        // noop — fall back below
      }

      // Select terminal from config; hardcode preferred type order
      // Prefer Virtual, then LCS, then VCS
      const preferredTypes = [
        'virtual',
        //, 'lcs'
        //, 'vcs'
      ];
      const virtualTerminalId = this.pickTerminalId(
        targetBuildingId,
        targetGroupId,
        topology,
        (groupObj as any)?.terminals,
        preferredTypes.length ? preferredTypes : undefined,
      );

      // Resolve areas using robust per-group mapping
      const fromArea = this.resolveAreaIdForFloor(
        targetBuildingId,
        targetGroupId,
        topology,
        request.fromFloor,
        virtualTerminalId,
      );
      const toArea = this.resolveAreaIdForFloor(
        targetBuildingId,
        targetGroupId,
        topology,
        request.toFloor,
        virtualTerminalId,
      );

      // Build allowed_lifts strictly from the requested liftNo
      let allowedLiftAreaIds: number[] = [];
      {
        const areas = liftDeckAreas.get(request.liftNo);
        if (areas?.length) allowedLiftAreaIds.push(...areas);
      }
      // De-duplicate and keep numeric ids only
      allowedLiftAreaIds = Array.from(
        new Set(
          allowedLiftAreaIds.filter((n) => typeof n === 'number' && !isNaN(n)),
        ),
      );

      const usedFromArea = fromArea;
      const usedToArea = toArea;
      logOutgoing('kone floor->area mapping', {
        buildingId: targetBuildingId,
        groupId: targetGroupId,
        fromFloor: request.fromFloor,
        toFloor: request.toFloor,
        fromArea: usedFromArea,
        toArea: usedToArea,
        terminal: virtualTerminalId,
        allowed_lifts: allowedLiftAreaIds,
        mappingRule: 'validated-destinations-or-rule-fallback',
      });

      // Use the same WebSocket connection for the action
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
            const callType = (parsed as any)?.callType;
            const msgType = (parsed as any)?.type;
            // Only log known callType events; ignore pure response (ok/error) here
            if (callType === 'ping') {
              logIncoming('kone websocket ping', parsed);
            } else if (callType === 'action') {
              logIncoming('kone websocket action', parsed);
            } else if (msgType === 'ok' || msgType === 'error') {
              // ack is logged elsewhere; skip duplicate logging here
            }
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
          area: usedFromArea, // current floor
          time: new Date().toISOString(),
          terminal: virtualTerminalId,

          // terminal: 10011,
          call: {
            action: 3,
            // Use deck area_ids from building config as allowed_lifts
            ...(allowedLiftAreaIds.length
              ? { allowed_lifts: allowedLiftAreaIds }
              : {}),
            destination: usedToArea,
          },
        },
      };
      logOutgoing('kone websocket action', destinationCallPayload);

      // Send the request
      webSocketConnection.send(JSON.stringify(destinationCallPayload));

      // Wait for ack and call event concurrently, but log ack immediately when it arrives
      const ackPromise = waitForResponse(
        webSocketConnection,
        String(requestId),
        10,
        true,
      ).then((ack) => {
        logIncoming('kone websocket acknowledgement', ack);
        return ack;
      });
      const callEvent = await callEventPromise;
      const wsResponse = await ackPromise;

      const response = new CallElevatorResponseDTO();
      if (callEvent.data?.success) {
        response.errcode = 0;
        response.errmsg = 'SUCCESS';
        response.sessionId = callEvent.data?.session_id;
        response.destination = request.toFloor;
        // Save context for future hold_open calls from the same client
        const liftDeck = Array.isArray(allowedLiftAreaIds)
          ? Number(allowedLiftAreaIds[0])
          : NaN;
        this.lastDoorHoldContext.set(
          this.getDoorCtxKey(
            request.deviceUuid,
            targetBuildingId,
            targetGroupId,
            request.liftNo,
          ),
          {
            buildingId: targetBuildingId,
            groupId: targetGroupId,
            liftNo: request.liftNo,
            servedArea: usedFromArea,
            liftDeck: isNaN(liftDeck) ? 0 : liftDeck,
            terminalId: virtualTerminalId,
            updatedAt: Date.now(),
          },
        );
      } else {
        response.errcode = 1;
        response.errmsg = 'FAILURE';
      }
      response.connectionId = wsResponse.connectionId;
      response.requestId = Number(wsResponse.requestId);
      response.statusCode = wsResponse.statusCode;
      // Cache successful journey result for idempotency window
      if (response.errcode === 0) {
        this.callIdempotencyCache.set(journeyKey, {
          expiresAt: Date.now() + idempTtlMs,
          response: plainToInstance(CallElevatorResponseDTO, response),
        });
      }
      return plainToInstance(CallElevatorResponseDTO, response);
    } finally {
      try {
        webSocketConnection.close();
      } catch {}
    }
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
        topology = await fetchBuildingTopology(
          accessToken,
          buildingId,
          groupId,
        );
        logIncoming('kone fetchBuildingConfig', topology);
        this.buildingTopologyCache.set(cacheKey, topology);
      }

      const targetGroupId = groupId;

      // Fetch previously saved context; fall back to deriving if missing
      const ctxKey = this.getDoorCtxKey(
        request.deviceUuid,
        buildingId,
        targetGroupId,
        request.liftNo,
      );
      let servedArea = 0;
      let liftDeck = 0;
      let terminalId: number | undefined;
      const saved = this.lastDoorHoldContext.get(ctxKey);
      if (saved) {
        servedArea = saved.servedArea || 0;
        liftDeck = saved.liftDeck || 0;
        terminalId = saved.terminalId;
      }
      if (!servedArea || !liftDeck) {
        // Derive from topology if not found (best-effort)
        try {
          // Hardcode preferred terminal type order for door-hold as well
          const preferredTypes = ['virtual', 'lcs', 'vcs'];
          const virtualTerminalId = this.pickTerminalId(
            buildingId,
            targetGroupId,
            topology,
            (topology as any)?.groups?.[0]?.terminals,
            preferredTypes.length ? preferredTypes : undefined,
          );
          terminalId = terminalId || virtualTerminalId;
          // Source floor is unknown at this point; try to resolve by current floor 0 mapping as last resort
          // Prefer mapping rule for a plausible area
          servedArea =
            servedArea || this.mapFloorToAreaByRule(0, targetGroupId);
          // For lift deck, pick first deck's area id number if available
          const lift = (topology as any)?.groups?.[0]?.lifts?.find(
            (l: any) => this.getLiftNumber(l) === request.liftNo,
          );
          const d0 = lift?.decks?.[0];
          const deckAreaNum = Number(
            String(d0?.deckAreaId ?? d0?.area_id ?? '')
              .split(':')
              .pop(),
          );
          if (!isNaN(deckAreaNum)) liftDeck = deckAreaNum;
        } catch {}
      }

      const webSocketConnection = await openWebSocketConnection(accessToken);
      // Heartbeat gate: ensure connection is healthy before sending hold_open
      await this.ensureHeartbeat(
        webSocketConnection as unknown as WebSocket,
        buildingId,
        targetGroupId,
      );
      const nowIso = Number(request.ts)
        ? new Date(Number(request.ts)).toISOString()
        : new Date().toISOString();
      const softTime = Number(request.seconds) || 0;
      const hardTime = softTime; // mirror soft_time for explicit control
      const holdOpenPayload = {
        type: 'lift-call-api-v2',
        buildingId,
        groupId: targetGroupId,
        callType: 'hold_open',
        payload: {
          request_id: requestId,
          time: nowIso,
          //terminal: terminalId ?? 1,
          served_area: servedArea,
          lift_deck: liftDeck,
          //soft_time: softTime,
          hard_time: hardTime,
        },
      } as const;
      logOutgoing('kone hold_open context', {
        deviceUuid: request.deviceUuid,
        buildingId,
        groupId: targetGroupId,
        liftNo: request.liftNo,
        served_area: servedArea,
        lift_deck: liftDeck,
        //terminal: terminalId ?? 1,
        source: saved ? 'saved' : 'derived',
      });
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
        topology = await fetchBuildingTopology(
          accessToken,
          buildingId,
          groupId,
        );
        logIncoming('kone fetchBuildingConfig', topology);
        this.buildingTopologyCache.set(cacheKey, topology);
      }
      const group = topology.groups?.[0];
      const targetGroupId = groupId;
      const lift = group?.lifts?.find(
        (l: any) => this.getLiftNumber(l) === request.liftNo,
      );
      const area = lift?.floors?.[0]?.areasServed?.[0] || 0;

      const webSocketConnection = await openWebSocketConnection(accessToken);
      // Heartbeat gate: ensure connection is healthy before sending action
      await this.ensureHeartbeat(
        webSocketConnection as unknown as WebSocket,
        buildingId,
        targetGroupId,
      );
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
