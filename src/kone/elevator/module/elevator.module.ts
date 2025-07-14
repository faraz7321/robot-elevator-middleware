import { Module } from '@nestjs/common';
import {ElevatorService} from "../service/elevator.service";
import {ElevatorController} from "../controller/elevator.controller";
import {AccessTokenService} from "../../auth/service/accessToken.service";

@Module({
    imports: [],
    controllers: [ElevatorController],
    providers: [ElevatorService, AccessTokenService],
})
export class ElevatorModule {}
