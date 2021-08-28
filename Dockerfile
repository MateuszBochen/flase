FROM node:16.6





ADD ./ /var/www/html/

WORKDIR /var/www/html/

COPY ./docker/docker-entrypoint.sh /docker-entrypoint.sh
# RUN iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]


# CMD composer install -n --prefer-dist

