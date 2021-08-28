#!/bin/bash
set -e



cd /var/www/html/frontend
echo 'Npm install';
npm install


npm start

tail -f /dev/null
