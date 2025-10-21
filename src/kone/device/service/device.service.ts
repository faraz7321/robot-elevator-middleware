import { Injectable } from '@nestjs/common';
import { RegisterDeviceRequestDTO } from '../dto/register/RegisterDeviceRequestDTO';
import { RegisterDeviceResponseDTO } from '../dto/register/RegisterDeviceResponseDTO';
import { BindDeviceRequestDTO } from '../dto/bind/BindDeviceRequestDTO';
import { BindDeviceResponseDTO } from '../dto/bind/BindDeviceResponseDTO';
import { RegisterDeviceResultDTO } from '../dto/register/RegisterDeviceResultDTO';
import { randomBytes, createHash } from 'crypto';
import { BindDeviceResultDTO } from '../dto/bind/BindDeviceResultDTO';
import { DeviceRegistryRepository } from '../repository/device-registry.repository';
import { DeviceBindingRepository } from '../repository/device-binding.repository';
import { appLogger } from '../../../logger/gcp-logger.service';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { fetchBuildingTopology } from '../../common/koneapi';
import { getLiftNumber } from '../../elevator/utils/lift-utils';
import { BuildingTopology } from '../../common/types';

const BIND_SUCCESS_STATUS = '11';
const UNBIND_SUCCESS_STATUS = '00';
const UNAUTHORIZED_STATUS = '-1';
const NOT_AUTHORIZED_MESSAGE = 'NOT_AUTHORIZED';
const LIFT_CACHE_TTL_MS = Number(
  process.env.KONE_LIFT_CACHE_TTL_MS || 5 * 60 * 1000,
);

@Injectable()
export class DeviceService {
  private readonly logger = appLogger.forContext(DeviceService.name);
  private deviceRegistry = new Map<
    string,
    { deviceSecret: string; deviceMac: string }
  >();
  private deviceBindings = new Map<string, Set<number>>();
  private bindingLoadPromises = new Map<string, Promise<Set<number>>>();
  private liftCache = new Map<string, { lifts: number[]; expiresAt: number }>();

  constructor(
    private readonly deviceRegistryRepository: DeviceRegistryRepository,
    private readonly deviceBindingRepository: DeviceBindingRepository,
    private readonly accessTokenService: AccessTokenService,
  ) {}

  private normalizeMac(deviceMac: string): string {
    return deviceMac.toUpperCase();
  }

  private cacheDevice(
    deviceUuid: string,
    deviceMac: string,
    deviceSecret: string,
  ): void {
    this.deviceRegistry.set(deviceUuid, { deviceMac, deviceSecret });
  }

  private formatBuildingId(id: string): string {
    return id.startsWith('building:') ? id : `building:${id}`;
  }

  private parsePlaceId(
    placeId?: string,
  ): { buildingId: string; groupId: string } | null {
    if (!placeId) {
      return null;
    }

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

  private async getAuthorizedLiftNumbers(
    placeId?: string,
  ): Promise<Set<number>> {
    const parsed = this.parsePlaceId(placeId);
    if (!parsed) {
      return new Set();
    }

    const cacheKey = `${parsed.buildingId}|${parsed.groupId}`;
    const now = Date.now();
    const cached = this.liftCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return new Set(cached.lifts);
    }

    try {
      const accessToken = await this.accessTokenService.getAccessToken(
        parsed.buildingId,
        parsed.groupId,
      );
      const topology = await fetchBuildingTopology(
        accessToken,
        parsed.buildingId,
        parsed.groupId,
      );
      const lifts = this.extractLiftNumbers(topology, parsed.groupId);
      const expiresAt = now + LIFT_CACHE_TTL_MS;
      this.liftCache.set(cacheKey, { lifts, expiresAt });
      return new Set(lifts);
    } catch (error) {
      const message =
        error instanceof Error
          ? `Unable to fetch lift numbers from KONE: ${error.message}`
          : 'Unable to fetch lift numbers from KONE';
      this.logger.error(message);
      return new Set();
    }
  }

  private extractLiftNumbers(
    topology: BuildingTopology | any,
    targetGroupId: string,
  ): number[] {
    const groups = (topology as any)?.groups;
    if (!Array.isArray(groups)) {
      return [];
    }

    const normalizedTarget = String(targetGroupId ?? '').trim();
    const group =
      groups.find((item: any) => {
        const raw = item?.groupId ?? item?.group_id ?? item?.id;
        if (!raw) return false;
        const suffix = String(raw).split(':').pop();
        return suffix === normalizedTarget;
      }) || groups[0];

    if (!group || !Array.isArray(group.lifts)) {
      return [];
    }

    const numbers = group.lifts
      .map((lift: any) => getLiftNumber(lift))
      .filter((n) => Number.isFinite(n)) as number[];

    return Array.from(new Set(numbers));
  }

  async registerDevice(
    request: RegisterDeviceRequestDTO,
  ): Promise<RegisterDeviceResponseDTO> {
    this.logger.log(
      `Requested: /openapi/v5/device/register on ${new Date().toISOString()}`,
    );
    this.logger.debug({
      deviceUuid: request.deviceUuid,
      deviceMac: this.normalizeMac(request.deviceMac),
    });

    const response = new RegisterDeviceResponseDTO();
    const deviceUuid = request.deviceUuid;
    const normalizedMac = this.normalizeMac(request.deviceMac);

    const cached = this.deviceRegistry.get(deviceUuid);
    if (cached) {
      if (this.normalizeMac(cached.deviceMac) !== normalizedMac) {
        response.errcode = 1;
        response.errmsg =
          'Device UUID already registered with a different MAC address';
        return response;
      }

      response.result = {
        deviceUuid,
        deviceMac: cached.deviceMac,
        deviceSecret: cached.deviceSecret,
      };
      response.errcode = 0;
      response.errmsg = 'SUCCESS';
      return response;
    }

    const existing = await this.deviceRegistryRepository.findByUuid(deviceUuid);
    if (existing) {
      if (this.normalizeMac(existing.deviceMac) !== normalizedMac) {
        response.errcode = 1;
        response.errmsg =
          'Device UUID already registered with a different MAC address';
        return response;
      }

      this.cacheDevice(
        existing.deviceUuid,
        existing.deviceMac,
        existing.deviceSecret,
      );

      response.result = {
        deviceUuid: existing.deviceUuid,
        deviceMac: existing.deviceMac,
        deviceSecret: existing.deviceSecret,
      };
      response.errcode = 0;
      response.errmsg = 'SUCCESS';
      return response;
    }

    const conflictingMac = await this.deviceRegistryRepository.findByMac(
      normalizedMac,
    );
    if (conflictingMac && conflictingMac.deviceUuid !== deviceUuid) {
      response.errcode = 1;
      response.errmsg = 'Device MAC already registered with a different UUID';
      return response;
    }

    const deviceSecret = this.generateSecret(deviceUuid, normalizedMac);

    const stored = await this.deviceRegistryRepository.save({
      deviceUuid,
      deviceMac: normalizedMac,
      deviceSecret,
    });

    this.cacheDevice(deviceUuid, stored.deviceMac, stored.deviceSecret);

    const result: RegisterDeviceResultDTO = {
      deviceUuid,
      deviceMac: stored.deviceMac,
      deviceSecret: stored.deviceSecret,
    };

    response.result = result;
    response.errcode = 0;
    response.errmsg = 'SUCCESS';
    return response;
  }

  private generateSecret(deviceUuid: string, deviceMac: string): string {
    const rawSecret = randomBytes(12).toString('hex');
    return createHash('sha256')
      .update(`${deviceUuid}:${deviceMac}:${rawSecret}`)
      .digest('hex');
  }

  async getDeviceSecret(deviceUuid: string): Promise<string | undefined> {
    const cached = this.deviceRegistry.get(deviceUuid);
    if (cached) {
      return cached.deviceSecret;
    }

    const existing = await this.deviceRegistryRepository.findByUuid(deviceUuid);
    if (!existing) {
      return undefined;
    }

    this.cacheDevice(
      existing.deviceUuid,
      existing.deviceMac,
      existing.deviceSecret,
    );
    return existing.deviceSecret;
  }

  private async loadBindings(deviceUuid: string): Promise<Set<number>> {
    try {
      const record = await this.deviceBindingRepository.findByUuid(deviceUuid);
      const bindings = new Set<number>(record?.liftNos ?? []);
      this.deviceBindings.set(deviceUuid, bindings);
      return bindings;
    } finally {
      this.bindingLoadPromises.delete(deviceUuid);
    }
  }

  private getOrCreateBindings(deviceUuid: string): Promise<Set<number>> {
    const cached = this.deviceBindings.get(deviceUuid);
    if (cached) {
      return Promise.resolve(cached);
    }

    let loadPromise = this.bindingLoadPromises.get(deviceUuid);
    if (!loadPromise) {
      loadPromise = this.loadBindings(deviceUuid);
      this.bindingLoadPromises.set(deviceUuid, loadPromise);
    }
    return loadPromise;
  }

  private async persistBindings(
    deviceUuid: string,
    bindings: Set<number>,
  ): Promise<void> {
    await this.deviceBindingRepository.save({
      deviceUuid,
      liftNos: Array.from(new Set(bindings)).sort((a, b) => a - b),
    });
  }

  /**
   * Check if a device is bound to a specific lift number
   */
  async isDeviceBoundToLift(deviceUuid: string, liftNo: number): Promise<boolean> {
    const bindings = await this.getOrCreateBindings(deviceUuid);
    return bindings.has(liftNo);
  }

  /**
   * Get all lift numbers that the device is currently bound to
   */
  async getBoundLiftsForDevice(deviceUuid: string): Promise<number[]> {
    const bindings = await this.getOrCreateBindings(deviceUuid);
    return Array.from(bindings).sort((a, b) => a - b);
  }

  async bindDevice(
    request: BindDeviceRequestDTO,
  ): Promise<BindDeviceResponseDTO> {
    const { deviceUuid, liftNos = [] } = request;

    this.logger.log(
      `Requested: /openapi/v5/device/binding on ${new Date().toISOString()}`,
    );
    this.logger.debug({
      deviceUuid,
      liftNos,
    });

    const response = new BindDeviceResponseDTO();
    const availableLifts = await this.getAuthorizedLiftNumbers(request.placeId);
    const liftsToBind = liftNos.length > 0 ? liftNos : Array.from(availableLifts);

    const bound = await this.getOrCreateBindings(deviceUuid);

    let hasChanges = false;

    const results: BindDeviceResultDTO[] = liftsToBind.map((liftNo) => {
      if (!availableLifts.has(liftNo)) {
        return {
          liftNo,
          bindingStatus: UNAUTHORIZED_STATUS,
        };
      }

      if (!bound.has(liftNo)) {
        bound.add(liftNo);
        hasChanges = true;
      }
      return {
        liftNo,
        bindingStatus: BIND_SUCCESS_STATUS,
      };
    });

    if (hasChanges) {
      await this.persistBindings(deviceUuid, bound);
    }
    this.populateResponseStatus(
      response,
      results,
      new Set([BIND_SUCCESS_STATUS]),
      NOT_AUTHORIZED_MESSAGE,
    );

    return response;
  }

  async unbindDevice(
    request: BindDeviceRequestDTO,
  ): Promise<BindDeviceResponseDTO> {
    const { deviceUuid, liftNos = [] } = request;

    this.logger.log(
      `Requested: /openapi/v5/device/unbinding on ${new Date().toISOString()}`,
    );
    this.logger.debug({
      deviceUuid,
      liftNos,
    });

    const response = new BindDeviceResponseDTO();
    const availableLifts = await this.getAuthorizedLiftNumbers(request.placeId);

    const liftsToUnbind =
      liftNos.length > 0 ? liftNos : Array.from(availableLifts);

    const bound = await this.getOrCreateBindings(deviceUuid);

    let hasChanges = false;

    const results: BindDeviceResultDTO[] = liftsToUnbind.map((liftNo) => {
      if (!availableLifts.has(liftNo)) {
        return {
          liftNo,
          bindingStatus: UNAUTHORIZED_STATUS,
        };
      }

      const removed = bound.delete(liftNo);
      hasChanges = hasChanges || removed;
      return {
        liftNo,
        bindingStatus: UNBIND_SUCCESS_STATUS,
      };
    });

    if (hasChanges) {
      await this.persistBindings(deviceUuid, bound);
    }
    this.populateResponseStatus(
      response,
      results,
      new Set([UNBIND_SUCCESS_STATUS]),
      NOT_AUTHORIZED_MESSAGE,
    );
    return response;
  }

  private populateResponseStatus(
    response: BindDeviceResponseDTO,
    results: Array<BindDeviceResultDTO | BindDeviceResultDTO[]>,
    successStatuses: Set<string>,
    failureMessage: string,
  ): void {
    const normalizedResults = results.flatMap((entry) =>
      Array.isArray(entry) ? entry : [entry],
    );

    const hasFailure = normalizedResults.some(
      ({ bindingStatus }) => !successStatuses.has(bindingStatus),
    );

    response.errcode = hasFailure ? 1 : 0;
    response.errmsg = hasFailure ? failureMessage : 'SUCCESS';
    response.result =
      normalizedResults.length === 1
        ? normalizedResults[0]
        : normalizedResults;
  }
}
