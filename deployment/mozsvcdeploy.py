#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "mozsvcdeploy"))

import mozsvcdeploy
import mozsvcdeploy.commands

if __name__ == "__main__":
    sys.exit(mozsvcdeploy.commands.main())
