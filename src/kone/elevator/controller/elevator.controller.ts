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

@Controller('lift')
export class ElevatorController {
  constructor(private readonly elevatorService: ElevatorService) {}

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
    return this.elevatorService.callElevator(request); 
  }

  @Post('open')
  delayElevator(@Body() request: DelayDoorRequestDTO): BaseResponseDTO {
    return this.elevatorService.delayElevator(request);
  }

  @Post('lock')
  reserveOrCancelElevator(
    @Body() request: ReserveAndCancelRequestDTO,
  ): BaseResponseDTO {
    return this.elevatorService.reserveOrCancelCall(request);
  }
}
