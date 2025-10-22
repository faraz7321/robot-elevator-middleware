import { Module } from '@nestjs/common';
import { EnvironmentModule } from './core/config/environment.module';
import { DeviceModule } from './kone/device/module/device.module';
import { ElevatorModule } from './kone/elevator/module/elevator.module';

@Module({
  imports: [EnvironmentModule, DeviceModule, ElevatorModule],
})
export class AppModule {}
