import { Module } from '@nestjs/common';
import { DeviceService } from '../service/device.service';
import { DeviceController } from '../controller/device.controller';
import { DeviceRegistryRepository } from '../repository/device-registry.repository';
import { AccessTokenService } from '../../auth/service/accessToken.service';

@Module({
  imports: [],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceRegistryRepository, AccessTokenService],
  exports: [DeviceService],
})
export class DeviceModule {}
