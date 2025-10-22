import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { appLogger } from './logger/gcp-logger.service';
import { EnvironmentService } from './core/config/environment.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(appLogger);
  app.flushLogs();
  const environmentService = app.get(EnvironmentService);
  app.setGlobalPrefix(environmentService.serverPrefix);
  app.useGlobalPipes(new ValidationPipe());
  const port = environmentService.serverPort;
  await app.listen(port);
  appLogger.log(`Application started on port ${port}`, 'Bootstrap');
}

void bootstrap();
