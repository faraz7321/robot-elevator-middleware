import { Module } from '@nestjs/common';
import {DeviceModule} from "./elevatorcompanyname/device/module/device.module";

@Module({
  imports: [DeviceModule],
})
export class AppModule {}
