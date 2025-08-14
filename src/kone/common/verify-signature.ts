import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config();
function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

const ELEVATOR_APP_NAME = process.env.ELEVATOR_APP_NAME || '';
const ELEVATOR_APP_SECRET = process.env.ELEVATOR_APP_SECRET || '';

export function generateCheck(
  deviceUuid: string,
  ts: number,
  deviceSecret: string,
): string {
  //console.log('CHECK PAYLOAD:', payload);
  return md5(`${deviceUuid}|${ts}|${deviceSecret}`);
}

export function generateSign(
  payload: Record<string, any>,
  appname: string,
  appSecret: string,
  ts: number,
): string {
  const keys = Object.keys(payload).filter(
    (key) =>
      !['sign', 'ts', 'appname', 'secret', 'check'].includes(key) &&
      payload[key] !== '',
  );

  const kvs = keys.sort().map((key) => `${key}:${payload[key]}`);

  kvs.push(`appname:${appname}`);
  kvs.push(`secret:${appSecret}`);
  kvs.push(`ts:${ts}`);

  const signPayload = kvs.join('|');
  //console.log('SIGN PAYLOAD:', signPayload);
  return md5(signPayload);
}

export function isValidRequest(
  request: Record<string, any>,
  appSecret: string,
  deviceSecret?: string,
): boolean {
  const { sign, check, ts, appname, deviceUuid } = request;

  if (!sign || !ts || !appname || !deviceUuid || !appSecret) {
    console.warn('Missing required fields or secrets');
    return false;
  }

  if (appname !== ELEVATOR_APP_NAME) {
    console.warn(`Blocked: appname '${appname}' is not allowed`);

    console.log(
      'EXPECTED APP_NAME HEX:',
      Buffer.from(ELEVATOR_APP_NAME || '').toString('hex'),
    );
    console.log('RECEIVED appname HEX:', Buffer.from(appname).toString('hex'));

    return false;
  }

  const calculatedSign = generateSign(request, appname, appSecret, ts);

  if (deviceSecret) {
    if (!check) {
      console.warn('Missing check field in request');
      return false;
    }
    const calculatedCheck = generateCheck(deviceUuid, ts, deviceSecret);
    return calculatedCheck === check && calculatedSign === sign;
  }

  // Device secret not provided, only validate sign
  return calculatedSign === sign;
}

export function validateSignedRequest(
  request: Record<string, any>,
  deviceSecret?: string,
): void {
  if (!isValidRequest(request, ELEVATOR_APP_SECRET, deviceSecret)) {
    throw new UnauthorizedException('Invalid sign or check');
  }
}

export function validateRegisterRequest(request: Record<string, any>): void {
  if (!isValidRequest(request, ELEVATOR_APP_SECRET)) {
    throw new UnauthorizedException('Invalid sign');
  }
}
