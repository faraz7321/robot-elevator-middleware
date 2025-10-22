import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { DeviceRegistryRepository } from '../repository/device-registry.repository';
import { Device, DeviceSnapshot } from '../domain/device.entity';
import { MacAddress } from '../domain/mac-address.value';
import { appLogger } from '../../../logger/gcp-logger.service';

export type DeviceRegistryErrorCode =
  | 'UUID_MAC_MISMATCH'
  | 'MAC_ALREADY_REGISTERED';

export class DeviceRegistryException extends Error {
  constructor(
    public readonly code: DeviceRegistryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class DeviceRegistryService {
  private readonly logger = appLogger.forContext(DeviceRegistryService.name);
  private readonly devicesByUuid = new Map<string, Device>();
  private readonly devicesByMac = new Map<string, Device>();

  constructor(
    private readonly deviceRegistryRepository: DeviceRegistryRepository,
  ) {}

  private cacheDevice(device: Device): void {
    this.devicesByUuid.set(device.uuid, device);
    this.devicesByMac.set(device.mac.toString(), device);
  }

  private createDeviceFromSnapshot(snapshot: DeviceSnapshot): Device {
    const device = Device.fromSnapshot(snapshot);
    this.cacheDevice(device);
    return device;
  }

  async findByUuid(deviceUuid: string): Promise<Device | null> {
    const cached = this.devicesByUuid.get(deviceUuid);
    if (cached) {
      return cached;
    }

    const record =
      await this.deviceRegistryRepository.findByUuid(deviceUuid);
    if (!record) {
      return null;
    }

    return this.createDeviceFromSnapshot(record);
  }

  async findByMac(mac: MacAddress): Promise<Device | null> {
    const cached = this.devicesByMac.get(mac.toString());
    if (cached) {
      return cached;
    }

    const record = await this.deviceRegistryRepository.findByMac(
      mac.toString(),
    );
    if (!record) {
      return null;
    }

    return this.createDeviceFromSnapshot(record);
  }

  async getDeviceSecret(deviceUuid: string): Promise<string | undefined> {
    const device = await this.findByUuid(deviceUuid);
    return device?.secret;
  }

  async getIdentity(
    deviceUuid: string,
  ): Promise<{ deviceUuid: string; deviceMac?: string } | null> {
    const device = await this.findByUuid(deviceUuid);
    if (!device) {
      return null;
    }
    return {
      deviceUuid: device.uuid,
      deviceMac: device.mac.toString(),
    };
  }

  async registerDevice(
    deviceUuid: string,
    mac: MacAddress,
  ): Promise<{ device: Device; created: boolean }> {
    const existing = await this.findByUuid(deviceUuid);
    if (existing) {
      if (!existing.matchesMac(mac)) {
        throw new DeviceRegistryException(
          'UUID_MAC_MISMATCH',
          'Device UUID already registered with a different MAC address',
        );
      }
      return { device: existing, created: false };
    }

    const conflicting = await this.findByMac(mac);
    if (conflicting && conflicting.uuid !== deviceUuid) {
      throw new DeviceRegistryException(
        'MAC_ALREADY_REGISTERED',
        'Device MAC already registered with a different UUID',
      );
    }

    const secret = this.generateSecret(deviceUuid, mac.toString());
    const snapshot = await this.deviceRegistryRepository.save({
      deviceUuid,
      deviceMac: mac.toString(),
      deviceSecret: secret,
    });

    return {
      device: this.createDeviceFromSnapshot(snapshot),
      created: true,
    };
  }

  private generateSecret(deviceUuid: string, deviceMac: string): string {
    const rawSecret = randomBytes(12).toString('hex');
    return createHash('sha256')
      .update(`${deviceUuid}:${deviceMac}:${rawSecret}`)
      .digest('hex');
  }
}
