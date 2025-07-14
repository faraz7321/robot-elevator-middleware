
export class AccessTokenData {

    constructor(accessToken: string, expiresAt: number) {
        this.accessToken = accessToken;
        this.expiresAt = expiresAt;
    }

    accessToken: string;

    expiresAt: number;
}