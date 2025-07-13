import { Module } from '@nestjs/common';
import {ElevatorService} from "../service/elevator.service";
import {ElevatorController} from "../controller/elevator.controller";

@Module({
    imports: [],
    controllers: [ElevatorController],
    providers: [ElevatorService],
})
export class ElevatorModule {}
