
sudo wget -O/etc/yum.repos.d/couchbase.repo http://packages.couchbase.com/rpm/couchbase-centos62-x86_64.repo

sudo yum check-update && sudo yum install -y libcouchbase-devel

wget http://packages.couchbase.com/releases/2.0.0/couchbase-server-enterprise_x86_64_2.0.0.rpm

sudo yum install -y couchbase-server-enterprise_x86_64_2.0.0.rpm

sleep 15

PASS=`openssl rand -base64 16`
BUCKET=picl

/opt/couchbase/bin/couchbase-cli cluster-init -c 127.0.0.1:8091 --cluster-init-username=Administrator --cluster-init-password=$PASS --cluster-init-port=8091 --cluster-init-ramsize=1024

/opt/couchbase/bin/couchbase-cli bucket-create -c 127.0.0.1:8091   --bucket=$BUCKET   --bucket-type=couchbase   --bucket-ramsize=1024   --bucket-replica=0   -u Administrator -p $PASS

echo {\"couchbase\": {\"password\":\"${PASS}\", \"bucket\":\"${BUCKET}\"}} > kvstore.json
sudo mv kvstore.json /home/app/kvstore.json
