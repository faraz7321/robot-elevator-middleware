import { Injectable } from '@nestjs/common';
import { DeviceBindingRepository } from '../repository/device-binding.repository';
import { DeviceBinding } from '../domain/device-binding.entity';

@Injectable()
export class DeviceBindingService {
  private readonly bindings = new Map<string, DeviceBinding>();
  private readonly bindingLoadPromises = new Map<
    string,
    Promise<DeviceBinding>
  >();

  constructor(
    private readonly deviceBindingRepository: DeviceBindingRepository,
  ) {}

  private mapRecordToBinding(record: {
    deviceUuid: string;
    liftNos: number[];
  }): DeviceBinding {
    const binding = new DeviceBinding(record.deviceUuid, record.liftNos);
    this.bindings.set(record.deviceUuid, binding);
    return binding;
  }

  private async loadBindings(deviceUuid: string): Promise<DeviceBinding> {
    try {
      const record =
        await this.deviceBindingRepository.findByUuid(deviceUuid);
      if (!record) {
        return this.mapRecordToBinding({ deviceUuid, liftNos: [] });
      }
      return this.mapRecordToBinding(record);
    } finally {
      this.bindingLoadPromises.delete(deviceUuid);
    }
  }

  async getBinding(deviceUuid: string): Promise<DeviceBinding> {
    const cached = this.bindings.get(deviceUuid);
    if (cached) {
      return cached;
    }

    let promise = this.bindingLoadPromises.get(deviceUuid);
    if (!promise) {
      promise = this.loadBindings(deviceUuid);
      this.bindingLoadPromises.set(deviceUuid, promise);
    }
    return promise;
  }

  async persist(binding: DeviceBinding): Promise<void> {
    await this.deviceBindingRepository.save({
      deviceUuid: binding.deviceUuid,
      liftNos: binding.toArray(),
    });
  }

  async getBoundLifts(deviceUuid: string): Promise<number[]> {
    const binding = await this.getBinding(deviceUuid);
    return binding.toArray();
  }

  async isDeviceBound(deviceUuid: string, liftNo: number): Promise<boolean> {
    const binding = await this.getBinding(deviceUuid);
    return binding.has(liftNo);
  }
}
