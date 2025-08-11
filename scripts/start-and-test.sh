#!/bin/bash
set -e

npm run start >/tmp/app.log 2>&1 &
APP_PID=$!

# give the server time to start
sleep 5

npm test

kill $APP_PID
wait $APP_PID 2>/dev/null || true
