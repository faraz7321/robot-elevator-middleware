import { Injectable } from '@nestjs/common';
import { RegisterDeviceRequestDTO } from '../dto/register/RegisterDeviceRequestDTO';
import { RegisterDeviceResponseDTO } from '../dto/register/RegisterDeviceResponseDTO';
import { RegisterDeviceResultDTO } from '../dto/register/RegisterDeviceResultDTO';
import { BindDeviceRequestDTO } from '../dto/bind/BindDeviceRequestDTO';
import { BindDeviceResponseDTO } from '../dto/bind/BindDeviceResponseDTO';
import { BindDeviceResultDTO } from '../dto/bind/BindDeviceResultDTO';
import { DeviceRegistryService, DeviceRegistryException } from './device-registry.service';
import { DeviceBindingService } from './device-binding.service';
import { LiftAuthorizationService } from './lift-authorization.service';
import { MacAddress } from '../domain/mac-address.value';
import { appLogger } from '../../../logger/gcp-logger.service';
import { DeviceBinding } from '../domain/device-binding.entity';

const BIND_SUCCESS_STATUS = '11';
const UNBIND_SUCCESS_STATUS = '00';
const UNAUTHORIZED_STATUS = '-1';
const NOT_AUTHORIZED_MESSAGE = 'NOT_AUTHORIZED';

interface BindingIdentity {
  readonly deviceUuid: string;
  readonly deviceMac?: string;
}

@Injectable()
export class DeviceService {
  private readonly logger = appLogger.forContext(DeviceService.name);

  constructor(
    private readonly deviceRegistry: DeviceRegistryService,
    private readonly deviceBindings: DeviceBindingService,
    private readonly liftAuthorization: LiftAuthorizationService,
  ) {}

  async registerDevice(
    request: RegisterDeviceRequestDTO,
  ): Promise<RegisterDeviceResponseDTO> {
    this.logger.log(
      `Requested: /openapi/v5/device/register on ${new Date().toISOString()}`,
    );

    const response = new RegisterDeviceResponseDTO();

    try {
      const mac = MacAddress.create(request.deviceMac);
      this.logger.debug({
        deviceUuid: request.deviceUuid,
        deviceMac: mac.toString(),
      });

      const { device } = await this.deviceRegistry.registerDevice(
        request.deviceUuid,
        mac,
      );

      const result = new RegisterDeviceResultDTO();
      result.deviceUuid = device.uuid;
      result.deviceMac = device.mac.toString();
      result.deviceSecret = device.secret;

      response.result = result;
      response.errcode = 0;
      response.errmsg = 'SUCCESS';
      return response;
    } catch (error) {
      response.errcode = 1;
      if (error instanceof DeviceRegistryException) {
        response.errmsg = error.message;
        return response;
      }
      if (error instanceof Error) {
        response.errmsg = error.message;
      } else {
        response.errmsg = 'Failed to register device';
      }
      this.logger.error(response.errmsg);
      return response;
    }
  }

  async getDeviceSecret(deviceUuid: string): Promise<string | undefined> {
    return this.deviceRegistry.getDeviceSecret(deviceUuid);
  }

  async isDeviceBoundToLift(
    deviceUuid: string,
    liftNo: number,
  ): Promise<boolean> {
    return this.deviceBindings.isDeviceBound(deviceUuid, liftNo);
  }

  async getBoundLiftsForDevice(deviceUuid: string): Promise<number[]> {
    return this.deviceBindings.getBoundLifts(deviceUuid);
  }

  async bindDevice(
    request: BindDeviceRequestDTO,
  ): Promise<BindDeviceResponseDTO> {
    this.logger.log(
      `Requested: /openapi/v5/device/binding on ${new Date().toISOString()}`,
    );
    this.logger.debug({
      deviceUuid: request.deviceUuid,
      liftNos: request.liftNos ?? [],
    });

    const response = new BindDeviceResponseDTO();
    const availableLifts =
      await this.liftAuthorization.getAuthorizedLiftNumbers(request.placeId);
    const targetLiftNos =
      request.liftNos && request.liftNos.length > 0
        ? request.liftNos
        : Array.from(availableLifts);

    const identity = await this.resolveBindingIdentity(request.deviceUuid);
    const binding = await this.deviceBindings.getBinding(request.deviceUuid);

    const { results, updated } = this.applyLiftOperation(
      targetLiftNos,
      availableLifts,
      identity,
      binding,
      (entity, lift) => entity.bind(lift),
      BIND_SUCCESS_STATUS,
    );

    if (updated) {
      await this.deviceBindings.persist(binding);
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
    this.logger.log(
      `Requested: /openapi/v5/device/unbinding on ${new Date().toISOString()}`,
    );
    this.logger.debug({
      deviceUuid: request.deviceUuid,
      liftNos: request.liftNos ?? [],
    });

    const response = new BindDeviceResponseDTO();
    const availableLifts =
      await this.liftAuthorization.getAuthorizedLiftNumbers(request.placeId);
    const targetLiftNos =
      request.liftNos && request.liftNos.length > 0
        ? request.liftNos
        : Array.from(availableLifts);

    const identity = await this.resolveBindingIdentity(request.deviceUuid);
    const binding = await this.deviceBindings.getBinding(request.deviceUuid);

    const { results, updated } = this.applyLiftOperation(
      targetLiftNos,
      availableLifts,
      identity,
      binding,
      (entity, lift) => entity.unbind(lift),
      UNBIND_SUCCESS_STATUS,
    );

    if (updated) {
      await this.deviceBindings.persist(binding);
    }

    this.populateResponseStatus(
      response,
      results,
      new Set([UNBIND_SUCCESS_STATUS]),
      NOT_AUTHORIZED_MESSAGE,
    );

    return response;
  }

  private async resolveBindingIdentity(
    deviceUuid: string,
  ): Promise<BindingIdentity> {
    const identity = await this.deviceRegistry.getIdentity(deviceUuid);
    return {
      deviceUuid: identity?.deviceUuid ?? deviceUuid,
      deviceMac: identity?.deviceMac,
    };
  }

  private applyLiftOperation(
    liftNos: number[],
    availableLifts: Set<number>,
    identity: BindingIdentity,
    binding: DeviceBinding,
    operation: (binding: DeviceBinding, liftNo: number) => boolean,
    successStatus: typeof BIND_SUCCESS_STATUS | typeof UNBIND_SUCCESS_STATUS,
  ): { results: BindDeviceResultDTO[]; updated: boolean } {
    let updated = false;

    const results = liftNos.map((liftNo) => {
      if (!availableLifts.has(liftNo)) {
        return this.buildBindingResult(identity, liftNo, UNAUTHORIZED_STATUS);
      }

      const changed = operation(binding, liftNo);
      updated = updated || changed;
      return this.buildBindingResult(identity, liftNo, successStatus);
    });

    return { results, updated };
  }

  private buildBindingResult(
    identity: BindingIdentity,
    liftNo: number,
    status: string,
  ): BindDeviceResultDTO {
    const result = new BindDeviceResultDTO();
    result.deviceUuid = identity.deviceUuid;
    result.deviceMac = identity.deviceMac;
    result.liftNo = liftNo;
    result.bindingStatus = status;
    return result;
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
    response.result = normalizedResults;
  }
}
