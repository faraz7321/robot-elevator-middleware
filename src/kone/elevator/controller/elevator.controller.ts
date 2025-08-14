import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ElevatorService } from '../service/elevator.service';
import { LiftStatusRequestDTO } from '../dtos/status/LiftStatusRequestDTO';
import { LiftStatusResponseDTO } from '../dtos/status/LiftStatusResponseDTO';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import { BaseResponseDTO } from '../../baseDtos/BaseResponseDTO';
import { DelayDoorRequestDTO } from '../dtos/delay/DelayDoorRequestDTO';
import { ReserveAndCancelRequestDTO } from '../dtos/reserve/ReserveAndCancelRequestDTO';
import { ListElevatorsRequestDTO } from '../dtos/list/ListElevatorsRequestDTO';
import { ListElevatorsResponseDTO } from '../dtos/list/ListElevatorsResponseDTO';
import { validateSignedRequest } from '../../common/verify-signature';
import { DeviceService } from '../../device/service/device.service';
import * as dotenv from 'dotenv';
import { CallElevatorResponseDTO } from '../dtos/call/CallElevatorResponseDTO';
import { logIncoming, logOutgoing } from '../../common/logger';
dotenv.config();

@Controller('lift')
export class ElevatorController {
  constructor(
    private readonly elevatorService: ElevatorService,
    private readonly deviceService: DeviceService,
  ) {}

  @Post('list')
  async listElevators(
    @Body() request: ListElevatorsRequestDTO,
  ): Promise<ListElevatorsResponseDTO> {
    logIncoming('robot /openapi/v5/lift/list', request);
    const deviceSecret = this.deviceService.getDeviceSecret(request.deviceUuid);
    if (!deviceSecret) {
      throw new UnauthorizedException('Device not registered');
    }
    validateSignedRequest(request, deviceSecret);
    const response = await this.elevatorService.listElevators(request);
    logOutgoing('robot /openapi/v5/lift/list', response);
    return response;
  }

  @Post('status')
  async getLiftStatus(
    @Body() request: LiftStatusRequestDTO,
  ): Promise<LiftStatusResponseDTO> {
    logIncoming('robot /openapi/v5/lift/status', request);
    const deviceSecret = this.deviceService.getDeviceSecret(request.deviceUuid);
    if (!deviceSecret) {
      throw new UnauthorizedException('Device not registered');
    }
    validateSignedRequest(request, deviceSecret);
    const response = await this.elevatorService.getLiftStatus(request);
    logOutgoing('robot /openapi/v5/lift/status', response);
    return response;
  }

  @Post('call')
  async callElevator(
    @Body() request: CallElevatorRequestDTO,
  ): Promise<CallElevatorResponseDTO> {
    logIncoming('robot /openapi/v5/lift/call', request);
    const deviceSecret = this.deviceService.getDeviceSecret(request.deviceUuid);
    if (!deviceSecret) {
      throw new UnauthorizedException('Device not registered');
    }
    validateSignedRequest(request, deviceSecret);
    const response = await this.elevatorService.callElevator(request);
    logOutgoing('robot /openapi/v5/lift/call', response);
    return response;
  }

  @Post('open')
  async delayElevatorDoors(
    @Body() request: DelayDoorRequestDTO,
  ): Promise<BaseResponseDTO> {
    logIncoming('robot /openapi/v5/lift/open', request);
    const deviceSecret = this.deviceService.getDeviceSecret(request.deviceUuid);
    if (!deviceSecret) {
      throw new UnauthorizedException('Device not registered');
    }
    validateSignedRequest(request, deviceSecret);
    const response = await this.elevatorService.delayElevatorDoors(request);
    logOutgoing('robot /openapi/v5/lift/open', response);
    return response;
  }

  @Post('lock')
  async reserveOrCancelElevator(
    @Body() request: ReserveAndCancelRequestDTO,
  ): Promise<BaseResponseDTO> {
    logIncoming('robot /openapi/v5/lift/lock', request);
    const deviceSecret = this.deviceService.getDeviceSecret(request.deviceUuid);
    if (!deviceSecret) {
      throw new UnauthorizedException('Device not registered');
    }
    validateSignedRequest(request, deviceSecret);
    const response = await this.elevatorService.reserveOrCancelCall(request);
    logOutgoing('robot /openapi/v5/lift/lock', response);
    return response;
  }
}
