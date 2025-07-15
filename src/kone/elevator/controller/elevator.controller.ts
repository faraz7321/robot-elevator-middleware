import { Body, Controller, Get, Post } from '@nestjs/common';
import { ElevatorService } from '../service/elevator.service';
import { LiftStatusRequestDTO } from '../dtos/status/LiftStatusRequestDTO';
import { LiftStatusResponseDTO } from '../dtos/status/LiftStatusResponseDTO';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import { BaseResponseDTO } from '../../baseDtos/BaseResponseDTO';
import { DelayDoorRequestDTO } from '../dtos/delay/DelayDoorRequestDTO';
import { ReserveAndCancelRequestDTO } from '../dtos/reserve/ReserveAndCancelRequestDTO';
import { ListElevatorsRequestDTO } from '../dtos/list/ListElevatorsRequestDTO';
import { ListElevatorsResponseDTO } from '../dtos/list/ListElevatorsResponseDTO';
import { isValidRequest } from '../../common/verify-signature';
import { UnauthorizedException } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config();

@Controller('lift')
export class ElevatorController {
  constructor(private readonly elevatorService: ElevatorService) {}

  private appSecret = process.env.ELEVATOR_APP_SECRET || '';
  private deviceSecret = process.env.BIB_DEVICE_SECRET || '';

  @Post('list')
  listElevators(
    @Body() request: ListElevatorsRequestDTO,
  ): ListElevatorsResponseDTO {
    return this.elevatorService.listElevators(request);
  }

  @Post('status')
  getLiftStatus(@Body() request: LiftStatusRequestDTO): LiftStatusResponseDTO {
    return this.elevatorService.getLiftStatus(request);
  }

  @Post('call')
  async call(
    @Body() request: CallElevatorRequestDTO,
  ): Promise<BaseResponseDTO> {
    if (!isValidRequest(request, this.appSecret, this.deviceSecret)) {
      throw new UnauthorizedException('Invalid sign or check');
    }

    return this.elevatorService.callElevator(request);
  }

  @Post('open')
  delayElevatorDoors(@Body() request: DelayDoorRequestDTO): BaseResponseDTO {
    return this.elevatorService.delayElevatorDoors(request);
  }

  @Post('lock')
  reserveOrCancelElevator(
    @Body() request: ReserveAndCancelRequestDTO,
  ): BaseResponseDTO {
    return this.elevatorService.reserveOrCancelCall(request);
  }
}
