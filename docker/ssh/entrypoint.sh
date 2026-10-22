#!/bin/sh
# databases on loopback of bastion only
socat TCP-LISTEN:13306,bind=127.0.0.1,fork,reuseaddr TCP:mysql:3306 &
socat TCP-LISTEN:13307,bind=127.0.0.1,fork,reuseaddr TCP:mariadb:3306 &
socat TCP-LISTEN:15432,bind=127.0.0.1,fork,reuseaddr TCP:postgres:5432 &
# Alpine disables forwarding by default; user nofwd keeps it disabled (Match block)
exec /usr/sbin/sshd -D -e -o PasswordAuthentication=yes -o AllowTcpForwarding=yes
