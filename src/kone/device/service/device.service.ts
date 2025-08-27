import { Injectable } from '@nestjs/common';
import { RegisterDeviceRequestDTO } from '../dto/register/RegisterDeviceRequestDTO';
import { RegisterDeviceResponseDTO } from '../dto/register/RegisterDeviceResponseDTO';
import { BindDeviceRequestDTO } from '../dto/bind/BindDeviceRequestDTO';
import { BindDeviceResponseDTO } from '../dto/bind/BindDeviceResponseDTO';
import { RegisterDeviceResultDTO } from '../dto/register/RegisterDeviceResultDTO';
import { randomBytes, createHash } from 'crypto';
import { BindDeviceResultDTO } from '../dto/bind/BindDeviceResultDTO';

@Injectable()
export class DeviceService {
  //map devices
  private deviceRegistry = new Map<
    string,
    { deviceSecret: string; deviceMac: string }
  >();
  private deviceBindings = new Map<string, Set<number>>();

  registerDevice(request: RegisterDeviceRequestDTO): RegisterDeviceResponseDTO {
    console.log(
      'Requested: /openapi/v5/device/register on ' +
        new Date().toISOString() +
        '\n',
      request,
    );

    const response = new RegisterDeviceResponseDTO();

    // Check if already registered
    if (this.deviceRegistry.has(request.deviceUuid)) {
      const existing = this.deviceRegistry.get(request.deviceUuid)!;
      response.result = {
        deviceUuid: request.deviceUuid,
        deviceMac: existing.deviceMac,
        deviceSecret: existing.deviceSecret,
      };
      response.errcode = 0;
      response.errmsg = 'SUCCESS';
      return response;
    }
    // Generate device secret (24-char hex)
    const rawSecret = randomBytes(12).toString('hex');
    const deviceSecret = createHash('sha256').update(rawSecret).digest('hex');

    // Store hashed secret in memory
    this.deviceRegistry.set(request.deviceUuid, {
      deviceSecret,
      deviceMac: request.deviceMac,
    });

    const result: RegisterDeviceResultDTO = {
      deviceUuid: request.deviceUuid,
      deviceMac: request.deviceMac,
      deviceSecret,
    };

    response.result = result;
    response.errcode = 0;
    response.errmsg = 'SUCCESS';
    return response;
  }

  getDeviceSecret(deviceUuid: string): string | undefined {
    return this.deviceRegistry.get(deviceUuid)?.deviceSecret;
  }

  /**
   * Check if a device is bound to a specific lift number
   */
  isDeviceBoundToLift(deviceUuid: string, liftNo: number): boolean {
    const bindings = this.deviceBindings.get(deviceUuid);
    return bindings ? bindings.has(liftNo) : false;
  }

  bindDevice(request: BindDeviceRequestDTO): BindDeviceResponseDTO {
    console.log(
      'Requested: /openapi/v5/device/binding on ' +
        new Date().toISOString() +
        '\n',
      request,
    );

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
        bindingStatus: '01', // means "Bound"
      };
    });
    response.result = results;

    return response;
  }

  unbindDevice(request: BindDeviceRequestDTO): BindDeviceResponseDTO {
    console.log(
      'Requested: /openapi/v5/device/unbinding on ' +
        new Date().toISOString() +
        '\n',
      request,
    );

    const response = new BindDeviceResponseDTO();

    const { deviceUuid, liftNos = [] } = request;
    const liftsToUnbind =
      liftNos.length > 0 ? liftNos : this.getAllLiftNumbers();

    if (!this.deviceBindings.has(deviceUuid)) {
      // No bindings exist yet, but still respond with unbind results
      const results: BindDeviceResultDTO[] = liftsToUnbind.map((liftNo) => ({
        liftNo,
        bindingStatus: '00', // Not bound (Unbound)
      }));
      response.result = results;
      return response;
    }

    const bound = this.deviceBindings.get(deviceUuid)!;

    const results: BindDeviceResultDTO[] = liftsToUnbind.map((liftNo) => {
      bound.delete(liftNo);
      return {
        liftNo,
        bindingStatus: '00', // Unbound
      };
    });

    response.result = results;
    return response;
  }

  private getAllLiftNumbers(): number[] {
    // You can return all known liftNos here or load from config/db
    return [258742, 123]; // example fallback if liftNos is empty
  }
}
