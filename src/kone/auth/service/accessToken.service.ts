import {Injectable} from '@nestjs/common';
import axios from 'axios';
import {
    fetchAccessToken,
    openWebSocketConnection,
    validateClientIdAndClientSecret,
} from '../../common/koneapi';
import {AccessTokenData} from "../dto/AccessTokenData";

@Injectable()
export class AccessTokenService {

    private CLIENT_ID: string = process.env.CLIENT_ID || 'YOUR_CLIENT_ID'; // eg. 'dcf48ab0-a902-4b52-8c53-1a9aede716e5'
    private CLIENT_SECRET: string = process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET'; // eg. '31d1329f8344fc12b1a960c8b8e0fc6a22ea7c35774c807a4fcabec4ffc8ae5b'

    private scopeToTokenMap: Map<string, AccessTokenData> = new Map<string, AccessTokenData>();

    async getAccessToken(placeId: string): Promise<string> {
        validateClientIdAndClientSecret(this.CLIENT_ID, this.CLIENT_SECRET);
        let scopes = this.getScopes(placeId);
        let existingAccessToken: AccessTokenData | undefined = this.scopeToTokenMap.get(scopes.join(" "));
        if (existingAccessToken && Date.now() < existingAccessToken.expiresAt) {
            // Token is still valid
            return existingAccessToken.accessToken;
        }

        // if token not cached or expired
        const accessTokenData = await fetchAccessToken(this.CLIENT_ID, this.CLIENT_SECRET, scopes); // returns expires_in, not expires_at so we need a separate dto to store that
        const token = new AccessTokenData(accessTokenData.access_token, Date.now() + accessTokenData.expires_in * 1000); // calculate expires_at and store with token
        this.scopeToTokenMap.set(scopes.join(" "), token);
        return accessTokenData.access_token;
    }

    private getScopes(placeId: string): string[] {
        return [
            'application/inventory',
            `callgiving/group:${placeId}:1`,
        ]
    }

}