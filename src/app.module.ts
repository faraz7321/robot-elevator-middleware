import { Module } from '@nestjs/common';
import {DeviceModule} from "./kone/device/module/device.module";
import {ElevatorModule} from "./kone/elevator/module/elevator.module";

@Module({
  imports: [DeviceModule, ElevatorModule],
})
export class AppModule {}
