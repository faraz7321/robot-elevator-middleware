import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { fetchBuildingConfig, waitForResponse } from './koneapi';
import { BuildingTopology } from './types';

class MockWebSocket extends EventEmitter {
  send(data: string) {
    const req = JSON.parse(data);
    const message = {
      requestId: req.requestId,
      callType: 'config',
      data: {
        topology: dummyTopology,
      },
    };
    setTimeout(() => {
      this.emit('message', JSON.stringify(message));
    }, 0);
  }
}

const dummyTopology: BuildingTopology = {
  buildingId: 'building:1',
  groups: [],
  areas: [],
};

describe('fetchBuildingConfig', () => {
  it('resolves topology from config response', async () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    const topology = await fetchBuildingConfig(ws, 'building:1', '1');
    expect(topology).toEqual(dummyTopology);
  });
});

describe('waitForResponse', () => {
  it('resolves when response requestId is numeric', async () => {
    const ws = new EventEmitter();
    const promise = waitForResponse(ws as any, '123', 1, true);
    setImmediate(() => {
      ws.emit('message', JSON.stringify({ requestId: 123, statusCode: 201 }));
    });
    await expect(promise).resolves.toMatchObject({
      requestId: 123,
      statusCode: 201,
    });
  });
});
