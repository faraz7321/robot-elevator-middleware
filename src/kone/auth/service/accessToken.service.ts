import { Injectable } from '@nestjs/common';
import {
  fetchAccessToken,
  validateClientIdAndClientSecret,
} from '../../common/koneapi';
import { BUILDING_ID_PREFIX } from '../../common/types';
import { AccessTokenData } from '../dto/AccessTokenData';
import { EnvironmentService } from '../../../core/config/environment.service';

@Injectable()
export class AccessTokenService {
  private scopeToTokenMap: Map<string, AccessTokenData> = new Map<
    string,
    AccessTokenData
  >();

  constructor(private readonly environmentService: EnvironmentService) {}

  private get clientId(): string {
    return this.environmentService.koneClientId;
  }

  private get clientSecret(): string {
    return this.environmentService.koneClientSecret;
  }

  async getAccessToken(
    buildingId: string,
    groupId: string = '1',
  ): Promise<string> {
    validateClientIdAndClientSecret(this.clientId, this.clientSecret);
    const scopes = this.getScopes(buildingId, groupId);
    const existingAccessToken: AccessTokenData | undefined =
      this.scopeToTokenMap.get(scopes.join(' '));
    if (existingAccessToken && Date.now() < existingAccessToken.expiresAt) {
      // Token is still valid
      return existingAccessToken.accessToken;
    }

    // if token not cached or expired
    const accessTokenData = await fetchAccessToken(
      this.clientId,
      this.clientSecret,
      scopes,
    ); // returns expires_in, not expires_at so we need a separate dto to store that
    const token = new AccessTokenData(
      accessTokenData.access_token,
      Date.now() + accessTokenData.expires_in * 1000,
    ); // calculate expires_at and store with token
    this.scopeToTokenMap.set(scopes.join(' '), token);
    return accessTokenData.access_token;
  }

  private getScopes(buildingId: string, groupId: string = '1'): string[] {
    const scopes = ['application/inventory'];
    const id = buildingId.startsWith(BUILDING_ID_PREFIX)
      ? buildingId.slice(BUILDING_ID_PREFIX.length)
      : buildingId;
    //scopes.push(`topology/building:${id}:${groupId}`);
    scopes.push(`robotcall/group:${id}:${groupId}`);
    //scopes.push(`callgiving/group:${id}:${groupId}`);
    //scopes.push('equipmentstatus/*');
    return scopes;
  }
}
