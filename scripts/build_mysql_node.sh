#!/bin/sh
#
# Build a MySQL-based storage node for picl-server.

set -e

YUM="yum --assumeyes"

$YUM update
$YUM install mysql mysql-server

/sbin/chkconfig mysqld on
/sbin/service mysqld start

echo "CREATE USER 'picl' IDENTIFIED BY 'piclmesoftly';" | mysql -u root
echo "CREATE DATABASE picl;" | mysql -u root
echo "GRANT ALL ON picl.* TO 'picl';" | mysql -u root

