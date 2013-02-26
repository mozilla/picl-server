/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Prerequesites can be included in a route's configuration and will run
// before the route's handler is called. Results are set on
// the request.pre object using the method's name for the property name,
// or otherwise using the value of the "assign" property.

const Hapi = require('hapi');
const Joi = require('joi');

const VersionNumberType = Joi.Types.Number().integer();

module.exports = {

  // Check that the userid component of the URL matches
  // the user authorized in the session.
  //
  checkUserId: function checkUserId(request, next) {
    var userid = request.params.userid;
    if (userid !== request.session.user) {
      return next(Hapi.Error.unauthorized('WrongUserid'));
    }
    next();
  },

  // Extract and validate the X-If-Modified-Since-Version header.
  //
  ifModifiedSinceVersion: {
    assign: 'ifModifiedSinceVersion',
    method: function(request, next) {
      var version = request.raw.req.headers['x-if-modified-since-version'];
      if (version === undefined) return next();
      version = VersionNumberType.convert(version);
      if (!VersionNumberType.validate(version)) {
        var err = 'invalid X-If-Mmodified-Since-Version';
        return next(Hapi.Error.badRequest(err));
      }
      return next(version);
    }
  },

  // Extract and validate the X-If-Unmodified-Since-Version header.
  //
  ifUnmodifiedSinceVersion: {
    assign: 'ifUnmodifiedSinceVersion',
    method: function(request, next) {
      var version = request.raw.req.headers['x-if-unmodified-since-version'];
      if (version === undefined) return next();
      version = VersionNumberType.convert(version);
      if (!VersionNumberType.validate(version)) {
        var err = 'invalid X-If-Unmodified-Since-Version';
        return next(Hapi.Error.badRequest(err));
      }
      return next(version);
    }
  }

};
