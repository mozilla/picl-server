#!/bin/sh
#
# Build a cassandra-based storage node for picl-server.

set -e

YUM="yum --assumeyes"

# Install cassandra from datastax community edition repos.

cat << EOF > /etc/yum.repos.d/datastax.repo
[datastax]
name= DataStax Repo for Apache Cassandra
baseurl=http://rpm.datastax.com/community
enabled=1
gpgcheck=0
EOF

$YUM update
$YUM install dsc12

# Hack default config to work with OpenJDK.
# It needs a bigger stack size, or it segfaults.
#
#   https://issues.apache.org/jira/browse/CASSANDRA-2441

perl -pi -e 's/Xss180k/Xss280k/g' /etc/cassandra/conf/cassandra-env.sh

# Make cassandra start on startup.

perl -pi -e 's/rpc_address: localhost/rpc_address: 0.0.0.0/g' /etc/cassandra/conf/cassandra.yaml

/sbin/chkconfig cassandra on
/sbin/service cassandra start

# Install memcached and start it on startup.

$YUM install memcached

/sbin/chkconfig memcached on
/sbin/service memcached start
