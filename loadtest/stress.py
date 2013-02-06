# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Load test for the PICL server
"""

import json

from funkload.FunkLoadTestCase import FunkLoadTestCase

class StressTest(FunkLoadTestCase):

    def setUp(self):
        self.server_url = self.conf_get("main", "url")

    def test_hello_world(self):
        self.setOkCodes([200])
        response = self.get(self.server_url + "/hello")
        self.assertTrue(response.body != '')
        self.assertEquals(json.loads(response.body)["greeting"], "it works")
