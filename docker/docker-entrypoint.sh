#!/bin/bash
set -e

cd /var/www/html/server

echo 'Server Npm install';
#npm install

#npm run dev 2>&1 &

cd /var/www/html/front
echo 'Front Npm install';
npm install


npm start 2>&1 &

tail -f /dev/null
