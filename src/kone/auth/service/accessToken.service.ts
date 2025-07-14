import { Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  fetchAccessToken,
  openWebSocketConnection,
  validateClientIdAndClientSecret,
} from '../../common/koneapi';

@Injectable()
export class AccessTokenService {

  private CLIENT_ID: string = process.env.CLIENT_ID || 'YOUR_CLIENT_ID'; // eg. 'dcf48ab0-a902-4b52-8c53-1a9aede716e5'
  private CLIENT_SECRET: string = process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET'; // eg. '31d1329f8344fc12b1a960c8b8e0fc6a22ea7c35774c807a4fcabec4ffc8ae5b'

  private accessToken: string | null = null;
  private expiresAt: number = 0; // in ms timestamp

  async getAccessToken(scopes?: string[]): Promise<string> {
    const now = Date.now();
    validateClientIdAndClientSecret(this.CLIENT_ID, this.CLIENT_SECRET);
    if (this.accessToken && now < this.expiresAt) {
      // Token is still valid
      return this.accessToken;
    }

    // Token is missing or expired - fetch new one
    const newTokenData = await fetchAccessToken(this.CLIENT_ID, this.CLIENT_SECRET, scopes);

    this.accessToken = newTokenData.access_token;
    // Assume expires_in is in seconds; convert to ms
    this.expiresAt = now + newTokenData.expires_in * 1000 - 5000; // minus 5s buffer

    return this.accessToken;
  }

    return response.data;
  }