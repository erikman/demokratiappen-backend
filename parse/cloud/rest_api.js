/* Copyright (C) 2014 Demokratiappen.
 *
 * This file is part of Demokratiappen.
 *
 * Demokratiappen is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Demokratiappen is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Demokratiappen. If not, see <http://www.gnu.org/licenses/>.
 */

function Api() {};

// Helpers
var ok = function(res, status, text, data) {
  res.json(status, {
    statusCode: status,
    statusText: text,
    response: data
  });
};

var error = function(res, status, text) {
  res.json(status, {
    statusCode: status,
    statusText: text
  });
};

var isValidAuthRequest = function(req) {
  return (req.header('Authorization') !== undefined &&
          req.body.grant_type !== undefined && 
          req.body.username !== undefined &&
          req.body.password !== undefined);
};

var isValidRequest = function(req) {
  return req.query.oauth_token !== undefined;
};

var missingToken = function(res) {
  error(res, 400, "Missing accessToken parameter.");
};

var invalidSession = function(res, err) {
  error(res, 401, "Invalid oauth_token. " + err.message );
};

var buildLink = function(req, path, token) {
  return req.protocol + '://' + req.host + path + '?oauth_token=' + token;
};

var buildUserObject = function(req, user) {
  return {
           userid: user.id,
           username: user.getUsername(),
           email: user.getEmail(),
           created: user.createdAt,
           updated: user.updatedAt,
           tags: buildLink(req, '/users/me/tags', req.query.oauth_token),
           articles: buildLink(req, '/users/me/articles', req.query.oauth_token)
         };
};

// API
Api.prototype.root = function(req, res) {
  ok(res, 200, "OK", { message: 'badass api!'});
};

Api.prototype.accessToken = function(req, res) {
  if (isValidAuthRequest(req)) {
    if (req.body.grant_type === 'password') {
      Parse.User.logIn(req.body.username, req.body.password, {
        success: function(user) {
          // TODO: verify client_id and client_secret
          ok(res, 200, 'OK', { 
            accessToken: user.getSessionToken()
          });
        },
        error: function(user, err) {
          error(res, 403, err.message);
        }
      });
    } else {
      error(res, 403, "Invalid grant_type.");
    }
  } else {
    error(res, 400, "Bad request. Missing header or body argument.");
  }
};

Api.prototype.getUser = function(req, res) {
  if (isValidRequest(req)) {
    Parse.User.become(req.query.oauth_token).then(function (user) {
      ok(res, 200, 'OK', buildUserObject(req, user));
    }, function (err) {
      invalidSession(res, err);
    });
  } else {
    missingToken(res);
  }
};

Api.prototype.updateUser = function(req, res) {
  if (isValidRequest(req)) {
    Parse.User.become(req.query.oauth_token).then(function(user) {
      if (req.body.email) {
        user.setEmail(req.body.email);
        user.save().then(function(updatedUser) {
          ok(res, 200, 'OK', buildUserObject(req, user));
        }, function(err) {
          error(res, 400, "Could not update email.");
        });
      }
    }, function(error) {
      invalidSession(res, err);
    });
  } else {
    missingToken(res);
  }
};

Api.prototype.getUserTags = function(req, res) {
  error(res, 501, "not implemented");
};

Api.prototype.getUserArticles = function(req, res) {
  error(res, 501, "not implemented");
};

module.exports = Api;