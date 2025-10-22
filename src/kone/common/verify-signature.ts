import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { appLogger } from '../../logger/gcp-logger.service';

dotenv.config();

const logger = appLogger.forContext('SignatureVerifier');
function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

const ELEVATOR_APP_NAME = process.env.ELEVATOR_APP_NAME || '';
const ELEVATOR_APP_SECRET = process.env.ELEVATOR_APP_SECRET || '';
const DISABLE_SIGNATURE_VALIDATION =
  (process.env.DISABLE_SIGNATURE_VALIDATION || '').toLowerCase() === 'true';

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
  if (DISABLE_SIGNATURE_VALIDATION) {
    logger.warn('Signature validation bypassed (DISABLE_SIGNATURE_VALIDATION=true)');
    return true;
  }

  const { sign, check, ts, appname, deviceUuid } = request;

  if (!sign || !ts || !appname || !deviceUuid || !appSecret) {
    logger.warn({
      message: 'Rejected request: missing required fields or secrets',
      receivedKeys: Object.keys(request ?? {}),
      hasAppSecret: Boolean(appSecret),
    });
    return false;
  }

  if (appname !== ELEVATOR_APP_NAME) {
    logger.warn({
      message: `Blocked request: appname '${appname}' is not allowed`,
      expectedAppNameHex: Buffer.from(ELEVATOR_APP_NAME || '').toString('hex'),
      receivedAppNameHex: Buffer.from(appname).toString('hex'),
    });
    return false;
  }

  const calculatedSign = generateSign(request, appname, appSecret, ts);

  if (deviceSecret) {
    if (!check) {
      logger.warn('Rejected request: missing check field while device secret available');
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
    logger.error({
      message: 'Rejected signed request due to invalid sign or check',
      deviceUuid: request?.deviceUuid,
      appname: request?.appname,
      ts: request?.ts,
      hasSign: Boolean(request?.sign),
      hasCheck: Boolean(request?.check),
      hasDeviceSecret: Boolean(deviceSecret),
    });
    throw new UnauthorizedException('Invalid sign or check');
  }
}

export function validateRegisterRequest(request: Record<string, any>): void {
  if (!isValidRequest(request, ELEVATOR_APP_SECRET)) {
    logger.error({
      message: 'Rejected register request due to invalid sign',
      deviceUuid: request?.deviceUuid,
      appname: request?.appname,
      ts: request?.ts,
      hasSign: Boolean(request?.sign),
    });
    throw new UnauthorizedException('Invalid sign');
  }
}
