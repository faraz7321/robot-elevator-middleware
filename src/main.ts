import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { appLogger } from './logger/gcp-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(appLogger);
  app.flushLogs();
  app.setGlobalPrefix('openapi/v5');
  app.useGlobalPipes(new ValidationPipe());
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  appLogger.log(`Application started on port ${port}`, 'Bootstrap');
}

void bootstrap();
