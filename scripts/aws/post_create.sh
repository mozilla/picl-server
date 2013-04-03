#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Setting up couchbase"
$DIR/install_couchbase.sh

echo "Setting up mysql"

sudo /sbin/chkconfig mysqld on
sudo /sbin/service mysqld start
echo "CREATE USER 'picl'@'localhost';" | mysql -u root
echo "CREATE DATABASE picl;" | mysql -u root
echo "GRANT ALL ON picl.* TO 'picl'@'localhost';" | mysql -u root
