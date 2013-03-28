# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.
"""

mozsvcdeploy.cfnstack:  functions for managing CloudFormation stacks
--------------------------------------------------------------------

This is all highly experimental, while I play around with what's possible
and what makes sense.  Don't you dare depend on this API for anything!

"""

import json
import boto


def list_stacks():
    conn = boto.connect_cloudformation()
    FAILED_STATUSES = ("DELETE_COMPLETE", "ROLLBACK_COMPLETE")
    for stackinfo in conn.list_stacks():
        if stackinfo.stack_status not in FAILED_STATUSES:
            product, envname = stackinfo.stack_name.rsplit("-", 1)
            yield CFNStack(product, envname)


class CFNStack(object):

    def __init__(self, product, envname):
        assert "-" not in envname
        self.product = product
        self.envname = envname

    @property
    def stack_name(self):
        return self.product + "-" + self.envname

    @property
    def _conn(self):
        try:
            return self.__conn
        except AttributeError:
            self.__conn = boto.connect_cloudformation()
            return self.__conn

    def exists(self):
        """Check whether this stack is deployed in AWS."""
        for stackinfo in self._conn.list_stacks():
            if stackinfo.stack_status != "DELETE_COMPLETE":
                if stackinfo.stack_name == self.stack_name:
                    return True
        return False

    def create(self, template):
        """Create this stack in AWS, if it does not exist."""
        if not self.exists():
            tags = {
                "mozsvc:product": self.product,
                "mozsvc:envname": self.envname,
            }
            return self._conn.create_stack(self.stack_name,
                                           json.dumps(template),
                                           tags=tags)

    def update(self, template):
        """Update this stack in AWS, if it exists."""
        if not self.exists():
            raise RuntimeError("stack does not exist")
        tags = {
            "mozsvc:product": self.product,
            "mozsvc:envname": self.envname,
        }
        return self._conn.update_stack(self.stack_name,
                                       json.dumps(template),
                                       tags=tags)

    def destroy(self):
        """Tear down this stack in AWS, if it exists."""
        if self.exists():
            self._conn.delete_stack(self.stack_name)

