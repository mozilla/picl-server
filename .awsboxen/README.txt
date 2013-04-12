This directory specifies how to deploy picl-server into AWS.
You'll need "awsboxen" to interpret and act on these instructions.

  https://github.com/rfk/awsboxen

The basic setup for "MockProduction" deployment (which is actually not
anywhere near production ready!) is as follows:

   * A public LoadBalancer
   * An AutoScaling group launching instances of the AWSBox AMI
   * An RDS Database Instance

The AutoScaling launch config uses cloud-init to write the database setup
information into each instance at launch time.
