import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {DeviceModule} from "./elevatorcompanyname/device/module/device.module";

@Module({
  imports: [DeviceModule],
})
export class AppModule {}
