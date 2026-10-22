# SSH server for tests of SSH tunnel (bastion). Databases are visible only on its 127.0.0.1:
# 13306 mysql, 13307 mariadb, 15432 postgres - from Flase server they are reachable only through the tunnel.
# User tunnel / tunnel; keys of tests (made at build): /keys/id_ed25519 (no passphrase), /keys/id_rsa_pass (passphrase "secret")
FROM alpine:3.20
RUN apk add --no-cache openssh socat \
 && ssh-keygen -A \
 && adduser -D -s /bin/sh tunnel && echo 'tunnel:tunnel' | chpasswd \
 && adduser -D -s /bin/sh nofwd && echo 'nofwd:nofwd' | chpasswd \
 && mkdir -p /keys /home/tunnel/.ssh \
 && ssh-keygen -q -t ed25519 -N '' -C flase-test -f /keys/id_ed25519 \
 && ssh-keygen -q -t rsa -b 2048 -N 'secret' -C flase-test-passphrase -f /keys/id_rsa_pass \
 && cat /keys/*.pub > /home/tunnel/.ssh/authorized_keys \
 && chown -R tunnel:tunnel /home/tunnel/.ssh && chmod 700 /home/tunnel/.ssh && chmod 600 /home/tunnel/.ssh/authorized_keys \
 && chmod 644 /keys/* \
 && printf 'Match User nofwd\n  AllowTcpForwarding no\n' >> /etc/ssh/sshd_config
COPY entrypoint.sh /entrypoint.sh
EXPOSE 22
CMD ["sh", "/entrypoint.sh"]
