import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DeviceModel, UserModel } from '@democracy-deutschland/democracy-common';
import axios from 'axios';
import crypto from 'crypto';
import { connectDB, disconnectDB } from '../../services/mongoose';
import config from '../../config';

const GRAPHQL_API_URL = process.env.GRAPHQL_API_URL || 'http://localhost:3000';

describe('authMiddleware', () => {
  const xDeviceHash = `xDeviceHash_AUTH_TESTS_${Date.now()}`;
  const deviceHash = crypto.createHash('sha256').update(xDeviceHash).digest('hex');

  beforeAll(async () => {
    await connectDB(config.DB_URL, { debug: false });
  });

  afterAll(async () => {
    const devices = await DeviceModel.find({ deviceHash });
    await UserModel.deleteMany({ device: { $in: devices } });
    await DeviceModel.deleteMany({ deviceHash });
    await disconnectDB();
  });

  it('creates exactly one device and user for parallel first requests of a new device', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        axios.post(
          GRAPHQL_API_URL,
          { query: '{ __typename }' },
          { headers: { 'x-device-hash': xDeviceHash }, validateStatus: () => true },
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
    responses.forEach((response) => expect(response.headers['x-token']).toBeTruthy());

    const devices = await DeviceModel.find({ deviceHash });
    expect(devices).toHaveLength(1);
    expect(devices[0].notificationSettings?.enabled).toBe(true);

    const users = await UserModel.find({ device: devices[0]._id });
    expect(users).toHaveLength(1);
    expect(users[0].verified).toBe(false);

    const health = await axios.get(new URL('/.well-known/apollo/server-health', GRAPHQL_API_URL).toString());
    expect(health.data.status).toBe('pass');
  });
});
