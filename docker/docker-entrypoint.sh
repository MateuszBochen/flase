#!/bin/bash
set -e

echo 'ENTRY OK';


cd /var/www/html/
echo 'Composer install';
composer install

service apache2 restart

cd /var/www/html/frontend
echo 'Npm install';
npm install


npm start

tail -f /dev/null
