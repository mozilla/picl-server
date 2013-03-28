
AWS Deployment Tools for PiCL Server
====================================

The initial deployment of the PiCL server infrastructure will be hosted with
Amazon Web Services.  This directory contains tooling and documentation for
working with that deployment.

We use AWS CloudFormation to describe the necessary resources and structure
of the deployment.  It's an experiment, we might change to something else
in the future if this doesn't work out...


Overview
--------

The deployment consists of the following key components:

 * An **Elastic Load Balancer** instance, which is the entry-point for all
   traffic hitting the service.
 * A cluster of **webserver** machines, which are EC2 instances running the
   picl-server nodejs application and receiving traffic from the load
   balancer.
 * A **dbserver** machine, which is a MySQL database host responsible for the
   actual storage of data.  Currently this is an Amazon RDS instance, we'll
   probably replace that with a custom EC2 instance in the future.
   will be replaced by custom EC2 instances running MySQL.

Visually::

                                +-----------+
                             +->| webserver |---+
     +--------+     +-----+  |  +-----------+   |   +----------+
     | client |---->| ELB |--+                  +-->| dbserver |
     +--------+     +-----+  |  +-----------+   |   +----------+
                             +->| webserver |---+
                                +-----------+


The orchestration of all these resources is managed by CloudFormation, using
the declarations in ./cfntemplate/.  We use some python scripts to manage the
deployment of these stacks.  To create a new deployment, do this:

    ./mozsvcdeploy.py create picl-server-test ./cfntemplate/

To update a stack after changing the declarations, do this::

    ./mozsvcdeploy.py update picl-server-test ./cfntemplate/

To tear down a stack after you've finished with it, do this::

    ./mozsvcdeploy.py destroy picl-server-test

