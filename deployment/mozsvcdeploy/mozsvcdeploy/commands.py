# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.
"""

mozsvcdeploy.commands:  command-line interface stuff for mozsvcdeploy
---------------------------------------------------------------------

This is where we define command-line interface for manipulating deployments.

"""

import os
import sys
import argparse

import mozsvcdeploy.cfnstack
import mozsvcdeploy.util


def main(argv=None):
    if argv is None:
       argv = sys.argv

    parser = argparse.ArgumentParser(prog=argv[0])
    subparsers = parser.add_subparsers(dest="subcommand", title="subcommands")

    subparser = subparsers.add_parser("list")
    subparser.set_defaults(func=cmd_list)

    subparser = subparsers.add_parser("create")
    subparser.add_argument("stack_name")
    subparser.add_argument("cfntemplate")
    subparser.set_defaults(func=cmd_create)

    subparser = subparsers.add_parser("update")
    subparser.add_argument("stack_name")
    subparser.add_argument("cfntemplate")
    subparser.set_defaults(func=cmd_update)

    subparser = subparsers.add_parser("destroy")
    subparser.add_argument("stack_name")
    subparser.set_defaults(func=cmd_destroy)

    args = parser.parse_args(argv[1:])
    return args.func(args)


def cmd_list(args):
    for stack in mozsvcdeploy.cfnstack.list_stacks():
        print stack.stack_name


def cmd_create(args):
    product, envname = args.stack_name.rsplit("-", 1)
    stack = mozsvcdeploy.cfnstack.CFNStack(product, envname)
    cfntemplate = mozsvcdeploy.util.load_cfn_template(args.cfntemplate)
    stack.create(cfntemplate)


def cmd_update(args):
    product, envname = args.stack_name.rsplit("-", 1)
    stack = mozsvcdeploy.cfnstack.CFNStack(product, envname)
    cfntemplate = mozsvcdeploy.util.load_cfn_template(args.cfntemplate)
    stack.update(cfntemplate)


def cmd_destroy(args):
    product, envname = args.stack_name.rsplit("-", 1)
    stack = mozsvcdeploy.cfnstack.CFNStack(product, envname)
    stack.destroy()


if __name__ == "__main__":
    sys.exit(main())
