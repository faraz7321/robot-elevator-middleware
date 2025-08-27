# Robot Elevator Middleware

Robot Elevator Middleware is a [NestJS](https://nestjs.com) service that bridges autonomous robots with KONE elevator systems. It provides REST endpoints and WebSocket utilities that allow a robot to list elevators, check lift status and issue elevator calls in a building.

## Features
- Register, bind and unbind robot devices using KONE Service Robot APIs.
- Discover elevators and their accessible floors.
- Retrieve real‑time lift status through WebSocket events.
- Place elevator calls and track sessions.
- Delay door opening and reserve or cancel an elevator call.
- Caches building topology to minimise repeated requests.

## Prerequisites
- Node.js 18 or later (v22 recommended).
- npm.
- Valid KONE developer credentials and device secrets.

## Installation

```bash
npm install
```
## Configuration
Create a `.env` file or set environment variables before starting the application.


| Variable | Description |
| --- | --- |
| `KONE_CLIENT_ID` | Client identifier issued by KONE. |
| `KONE_CLIENT_SECRET` | Client secret issued by KONE. |
| `BIB_DEVICE_UUID` | Unique identifier for the robot device. |
| `ELEVATOR_APP_NAME` | Registered application name. |
| `ELEVATOR_APP_SECRET` | Secret associated with the application. |
| `KONE_BUILDING_ID` | Identifier of the building to control. |
| `PORT` | (optional) HTTP port for the server. Defaults to `3000`. |
| `API_HOSTNAME`, `API_AUTH_TOKEN_ENDPOINT`, `API_AUTH_LIMITED_TOKEN_ENDPOINT`, `API_RESOURCES_ENDPOINT`, `WEBSOCKET_ENDPOINT`, `WEBSOCKET_SUBPROTOCOL` | (optional) Override default KONE API endpoints. |

## Running the service

```bash
npm run start        # start in development mode
npm run start:dev    # watch mode
npm run start:prod   # start the compiled server
```

## Testing

```bash
npm test
```

## Project structure

- `src/main.ts` – application bootstrap.
- `src/kone` – modules for authentication, device management and elevator operations.
- `docs/` – supporting documentation and API specifications.

## License

This project is provided as UNLICENSED and is intended for internal use only.

## Acknowledgements

Built with [NestJS](https://nestjs.com) and integrates KONE Service Robot APIs.









