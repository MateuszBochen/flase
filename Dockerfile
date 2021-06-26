FROM php:8.0-apache-buster


RUN apt-get update && apt-get install -y libfreetype6-dev libjpeg62-turbo-dev libpng-dev libzip-dev libmagickwand-dev --no-install-recommends

RUN pecl install redis && pecl install xdebug && pecl install imagick && docker-php-ext-enable redis xdebug imagick

RUN docker-php-ext-install zip pdo pdo_mysql

# install composer
RUN curl -sS https://getcomposer.org/installer -o composer-setup.php
RUN php composer-setup.php --install-dir=/usr/local/bin --filename=composer

# Install PHPUnit
RUN curl -OL https://phar.phpunit.de/phpunit.phar \
    && chmod 755 phpunit.phar \
    && mv phpunit.phar /usr/local/bin/ \
    && ln -s /usr/local/bin/phpunit.phar /usr/local/bin/phpunit


# node.js

ENV NVM_DIR /usr/local/nvm
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash
ENV NODE_VERSION v16.4.0
RUN /bin/bash -c "source $NVM_DIR/nvm.sh && nvm install $NODE_VERSION && nvm use --delete-prefix $NODE_VERSION"

ENV NODE_PATH $NVM_DIR/versions/node/$NODE_VERSION/lib/node_modules
ENV PATH      $NVM_DIR/versions/node/$NODE_VERSION/bin:$PATH


ADD docker/userphp.ini /usr/local/etc/php/conf.d/userphp.ini
ADD docker/apache-config.conf /etc/apache2/sites-enabled/000-default.conf
RUN a2enmod rewrite
RUN a2enmod proxy
RUN a2enmod proxy_http
RUN a2enmod proxy_wstunnel
RUN a2enmod proxy_balancer
RUN a2enmod lbmethod_byrequests

ADD ./ /var/www/html/

WORKDIR /var/www/html/

COPY ./docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]


# CMD composer install -n --prefer-dist

