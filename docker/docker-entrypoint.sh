#!/bin/bash
set -e

cd /var/www/html/server

echo 'Server Npm install';
npm install
npm run dev &


cd /var/www/html/frontend
echo 'Front Npm install';
npm install


npm start

tail -f /dev/null
