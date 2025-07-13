import { Module } from '@nestjs/common';
import {DeviceModule} from "./kone/device/module/device.module";

@Module({
  imports: [DeviceModule],
})
export class AppModule {}
