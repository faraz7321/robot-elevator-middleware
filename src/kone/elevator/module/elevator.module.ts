import { Module } from '@nestjs/common';
import { ElevatorService } from '../service/elevator.service';
import { ElevatorController } from '../controller/elevator.controller';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { DeviceModule } from '../../device/module/device.module';

@Module({
  imports: [DeviceModule],
  controllers: [ElevatorController],
  providers: [ElevatorService, AccessTokenService],
})
export class ElevatorModule {}
