import { Injectable } from '@nestjs/common';
import { environment } from './environment';

@Injectable()
export class EnvironmentService {
  get nodeEnv(): string {
    return environment.nodeEnv;
  }

  get serverPort(): number {
    return environment.server.port;
  }

  get serverPrefix(): string {
    return environment.server.globalPrefix;
  }

  get koneClientId(): string {
    return environment.kone.clientId;
  }

  get koneClientSecret(): string {
    return environment.kone.clientSecret;
  }

  get koneLiftCacheTtlMs(): number {
    return environment.kone.liftCacheTtlMs;
  }

  get elevatorAppName(): string {
    return environment.kone.elevatorAppName;
  }

  get elevatorAppSecret(): string {
    return environment.kone.elevatorAppSecret;
  }

  get disableSignatureValidation(): boolean {
    return environment.kone.disableSignatureValidation;
  }

  get gcpProjectId(): string | undefined {
    return environment.gcp.projectId;
  }
}
