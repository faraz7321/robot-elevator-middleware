import { Injectable, Logger } from '@nestjs/common';
import { RegisterDeviceRequestDTO } from '../dto/register/RegisterDeviceRequestDTO';
import { RegisterDeviceResponseDTO } from '../dto/register/RegisterDeviceResponseDTO';
import { BindDeviceRequestDTO } from '../dto/bind/BindDeviceRequestDTO';
import { BindDeviceResponseDTO } from '../dto/bind/BindDeviceResponseDTO';
import { RegisterDeviceResultDTO } from '../dto/register/RegisterDeviceResultDTO';
import { randomBytes, createHash } from 'crypto';
import { BindDeviceResultDTO } from '../dto/bind/BindDeviceResultDTO';
import { DeviceRegistryRepository } from '../repository/device-registry.repository';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);
  private deviceRegistry = new Map<
    string,
    { deviceSecret: string; deviceMac: string }
  >();
  private deviceBindings = new Map<string, Set<number>>();

  constructor(
    private readonly deviceRegistryRepository: DeviceRegistryRepository,
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

  async registerDevice(
    request: RegisterDeviceRequestDTO,
  ): Promise<RegisterDeviceResponseDTO> {
    this.logger.log(
      `Requested: /openapi/v5/device/register on ${new Date().toISOString()}`,
    );
    this.logger.debug(request);

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

  /**
   * Check if a device is bound to a specific lift number
   */
  isDeviceBoundToLift(deviceUuid: string, liftNo: number): boolean {
    const bindings = this.deviceBindings.get(deviceUuid);
    return bindings ? bindings.has(liftNo) : false;
  }

  /**
   * Get all lift numbers that the device is currently bound to
   */
  getBoundLiftsForDevice(deviceUuid: string): number[] {
    const bindings = this.deviceBindings.get(deviceUuid);
    return bindings ? Array.from(bindings) : [];
  }

  bindDevice(request: BindDeviceRequestDTO): BindDeviceResponseDTO {
    this.logger.log(
      `Requested: /openapi/v5/device/binding on ${new Date().toISOString()}`,
    );
    this.logger.debug(request);

    const response = new BindDeviceResponseDTO();
    const { deviceUuid, liftNos = [] } = request;
    const liftsToBind = liftNos.length > 0 ? liftNos : this.getAllLiftNumbers();

    if (!this.deviceBindings.has(deviceUuid)) {
      this.deviceBindings.set(deviceUuid, new Set<number>());
    }

    const bound = this.deviceBindings.get(deviceUuid)!;

    const results: BindDeviceResultDTO[] = liftsToBind.map((liftNo) => {
      bound.add(liftNo);
      return {
        liftNo,
        bindingStatus: '01',
      };
    });
    response.result = results;

    return response;
  }

  unbindDevice(request: BindDeviceRequestDTO): BindDeviceResponseDTO {
    this.logger.log(
      `Requested: /openapi/v5/device/unbinding on ${new Date().toISOString()}`,
    );
    this.logger.debug(request);

    const response = new BindDeviceResponseDTO();

    const { deviceUuid, liftNos = [] } = request;
    const liftsToUnbind =
      liftNos.length > 0 ? liftNos : this.getAllLiftNumbers();

    if (!this.deviceBindings.has(deviceUuid)) {
      const results: BindDeviceResultDTO[] = liftsToUnbind.map((liftNo) => ({
        liftNo,
        bindingStatus: '00',
      }));
      response.result = results;
      return response;
    }

    const bound = this.deviceBindings.get(deviceUuid)!;

    const results: BindDeviceResultDTO[] = liftsToUnbind.map((liftNo) => {
      bound.delete(liftNo);
      return {
        liftNo,
        bindingStatus: '00',
      };
    });

    response.result = results;
    return response;
  }

  private getAllLiftNumbers(): number[] {
    return [258742, 123];
  }
}
