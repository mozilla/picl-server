#!/bin/sh
#
# Script to automate setup of a marteau server node.
#
# This script automatically installs and configures a marteau server on a
# CentOS-like environment.  It's intended to be used via cloud-init or some
# other mechanism for initializing AWS VMs.
#
# If we push ahead with marteau long-term, this will likely be turned into
# some chef code for proper deployment.
#

set -e
YUM="yum --assumeyes"

# Make sure everything's up-to-date.

$YUM update
$YUM install gcc gcc-c++ make

# Install nginx and configure it with a self-signed SSL certificate.
# It will redirect HTTP to HTTPS, and forward HTTPS traffic to localhost:8080.

$YUM install nginx
yes '' | sudo openssl req -new -x509 -nodes -out /etc/nginx/selfsigned.crt -keyout /etc/nginx/selfsigned.key
chmod 0600 /etc/nginx/selfsigned.key
cat << EOF > /etc/nginx/nginx.conf
user  nginx;
worker_processes  1;

events {
    worker_connections  20480;
}

http {
    client_max_body_size 1m;

    server {
       listen         80;
       rewrite        ^ https://$host$request_uri? permanent;
    }

    server {
        listen                 443;
        ssl                    on;
        ssl_certificate        /etc/nginx/selfsigned.crt;
        ssl_certificate_key    /etc/nginx/selfsigned.key;

        location / {
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Protocol ssl;
            proxy_set_header Host $http_host;
            proxy_redirect off;
            proxy_pass http://localhost:8080;
            proxy_read_timeout 60s;
        }
    }
}
EOF
chkconfig nginx on

# Install redis.  This is what marteau uses to store its job queue.
# Unfortunately no rpms, so we build from source.  Blech.

OLDDIR=`pwd`
WORKDIR=`mktemp -d`
cd $WORKDIR
wget https://redis.googlecode.com/files/redis-2.6.9.tar.gz
tar -xzvf redis-2.6.9.tar.gz
cd ./redis-2.6.9
make
make PREFIX=/usr install
cd ./utils
yes '' | ./install_server.sh
cd $OLDDIR
rm -rf $WORKDIR
cat << EOF > /etc/init.d/redis_6379
#!/bin/sh
# redis - this script starts and stops the redis-server daemon
#
# chkconfig:   - 85 15 
# description: redis is a persistent key-value database
# processname: redis-server
# config:      /etc/redis/6379.conf
# pidfile:     /var/run/redis_6379.pid
#
# Lightly edited version of https://gist.github.com/paulrosania/257849

. /etc/rc.d/init.d/functions

. /etc/sysconfig/network

[ "$NETWORKING" = "no" ] && exit 0

redis="/usr/bin/redis-server"
prog=$(basename $redis)

REDIS_CONF_FILE="/etc/redis/6379.conf"

lockfile=/var/lock/subsys/redis

start() {
    [ -x $redis ] || exit 5
    [ -f $REDIS_CONF_FILE ] || exit 6
    echo -n $"Starting $prog: "
    daemon $redis $REDIS_CONF_FILE
    retval=$?
    echo
    [ $retval -eq 0 ] && touch $lockfile
    return $retval
}

stop() {
    echo -n $"Stopping $prog: "
    killproc $prog -QUIT
    retval=$?
    echo
    [ $retval -eq 0 ] && rm -f $lockfile
    return $retval
}

restart() {
    stop
    start
}

reload() {
    echo -n $"Reloading $prog: "
    killproc $redis -HUP
    RETVAL=$?
    echo
}

force_reload() {
    restart
}

rh_status() {
    status $prog
}

rh_status_q() {
    rh_status >/dev/null 2>&1
}

case "$1" in
    start)
        rh_status_q && exit 0
        $1
        ;;
    stop)
        rh_status_q || exit 0
        $1
        ;;
    restart|configtest)
        $1
        ;;
    reload)
        rh_status_q || exit 7
        $1
        ;;
    force-reload)
        force_reload
        ;;
    status)
        rh_status
        ;;
    condrestart|try-restart)
        rh_status_q || exit 0
            ;;
    *)
        echo $"Usage: $0 {start|stop|status|restart|condrestart|try-restart|reload|force-reload}"
        exit 2
esac
EOF
chkconfig redis_6379 on

# Install marteau and have it run on localhost:8080.

$YUM install python-devel git libevent-devel
easy_install pip
pip install https://github.com/mozilla-services/marteau/archive/master.tar.gz
mkdir -p /etc/marteau
mkdir -p /var/run/marteau

# XXX TODO: have it start on boot
