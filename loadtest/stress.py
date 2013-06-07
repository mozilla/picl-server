# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Load test for the PICL server
"""

import json
import uuid
import random

from funkload.FunkLoadTestCase import FunkLoadTestCase
from funkload.utils import Data


class StressTest(FunkLoadTestCase):

    def setUp(self):
        self.server_url = self.conf_get("main", "url")
        if not self.server_url.endswith("/"):
            self.server_url += "/"

    def test_syncstore_read_and_write(self):
        COLLECTIONS = ["history", "bookmarks", "tabs", "passwords"]
        auth_token = uuid.uuid4().hex
        base_url = self.server_url + auth_token
        # Start by getting the info document.
        self.setHeader("Authorization", auth_token)
        self.setOkCodes([200])
        self.get(base_url + "/info/collections")
        # Read the items from a random collections.
        coll = random.choice(COLLECTIONS)
        self.setOkCodes([200, 404])
        self.get(base_url + "/storage/" + coll)
        # Write some new items into a random collection.
        coll = random.choice(COLLECTIONS)
        items = {}
        while len(items) < 10:
            id = "item%s" % (random.randrange(0, 100),)
            items[id] = { "id": id, "payload": "DATADATADATA" }
        data = Data("application/json", json.dumps(items.values()))
        self.setOkCodes([200])
        r = self.post(base_url + "/storage/" + coll, params=data)
        last_modified = int(r.headers["x-last-modified-version"])
        # Check the collection info again and sanity-check the version nums.
        r = self.get(base_url + "/info/collections")
        info = json.loads(r.body)
        assert last_modified <= info["collections"][coll]
 
