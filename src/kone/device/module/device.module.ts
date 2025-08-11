import { Module } from '@nestjs/common';
import { DeviceService } from '../service/device.service';
import { DeviceController } from '../controller/device.controller';

@Module({
  imports: [],
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}
