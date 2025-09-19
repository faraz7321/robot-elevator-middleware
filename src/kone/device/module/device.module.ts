import { Module } from '@nestjs/common';
import { DeviceService } from '../service/device.service';
import { DeviceController } from '../controller/device.controller';
import { DeviceRegistryRepository } from '../repository/device-registry.repository';

@Module({
  imports: [],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceRegistryRepository],
  exports: [DeviceService],
})
export class DeviceModule {}
