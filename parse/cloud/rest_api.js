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

var Api = function Api() {
  // still empty
};

// API
Api.prototype.root = function root(req, res) {
  ok(res, 200, "OK", { message: 'badass api!'});
};

Api.prototype.accessToken = function accessToken(req, res) {
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

Api.prototype.getUser = function getUser(req, res) {
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

Api.prototype.updateUser = function updateUser(req, res) {
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
    }, function(err) {
      invalidSession(res, err);
    });
  } else {
    missingToken(res);
  }
};

Api.prototype.getUserTags = function getUserTags(req, res) {
  error(res, 501, "not implemented");
};

Api.prototype.getUserArticles = function getUserArticles(req, res) {
  var limit = req.query.limit || 100;
  var offset = req.query.offset || 0;

  var compileTags = function(page) {
    var formatTag = function(tag) {
      return {
        name: tag.get('name'),
        type: tag.get('type'),
        created: tag.createdAt,
        ref: buildLink(req, '/tags/' + tag.id)
      };
    }; 

    return { 
      negative: page.get('negative_tags').map(formatTag),
      positive: page.get('positive_tags').map(formatTag)
    };
  };

  var compileArticle = function(page) {
    return {
      articleid: page.id,
      title: page.get('title'),
      url: page.get('url'),
      ref: "", 
      tagsInArticle: compileTags(page)
    };
  };

  if (isValidRequest(req)) {
    Parse.User.become(req.query.oauth_token).then(function(user) {
      var userArticlesResponse = {
        userid: user.id,
      }
      
      var Page = Parse.Object.extend('Page');
      var query = new Parse.Query(Page);
      query.equalTo('user', user);
      query.include('negative_tags');
      query.include('positive_tags');
      query.descending('createdAt');
      
      // set limit
      if (limit > 0 && limit <= 1000) {
        query.limit(limit);
        userArticlesResponse.limit = limit
      } else {
        userArticlesResponse.limit = 100; // Parse default
      }

      // set offset
      query.skip(offset);
      userArticlesResponse.offset = offset;

      userArticlesResponse.next = buildLink(req, 
        '/users/me/articles', {
          limit: userArticlesResponse.limit,
          offset: offset + userArticlesResponse.limit
        });
      
      // execute query
      query.find().then(function(pages) {
        userArticlesResponse.articles = pages.map(compileArticle);
        ok(res, 200, 'OK', userArticlesResponse);
      }, 
      function(err) {
        error(res, 500, err.message);
      });
    }, function(err) {
      invalidSession(res, err);
    });
  } else {
    missingToken(res);
  }
};

// Helpers
var ok = function ok(res, status, text, data) {
  res.json(status, {
    statusCode: status,
    statusText: text,
    response: data
  });
};

var error = function error(res, status, text) {
  res.json(status, {
    statusCode: status,
    statusText: text
  });
};

var isValidAuthRequest = function isValidAuthRequest(req) {
  return (req.header('Authorization') !== undefined &&
          req.body.grant_type !== undefined && 
          req.body.username !== undefined &&
          req.body.password !== undefined);
};

var isValidRequest = function isValidRequest(req) {
  return req.query.oauth_token !== undefined;
};

var missingToken = function missingToken(res) {
  error(res, 400, "Missing accessToken parameter.");
};

var invalidSession = function invalidSession(res, err) {
  error(res, 401, "Invalid oauth_token. " + err.message );
};

var buildLink = function buildLink(req, path, params) {
  var extraParams = '';
  
  if (params) {
    extraParams = Object.keys(params).map(function(value) { 
      return '&' + value + '=' + params[value]; 
    }).join('');
  }

  return req.protocol + '://' + req.host + path + 
    '?oauth_token=' + req.query.oauth_token + extraParams;
};

var buildUserObject = function buildUserObject(req, user) {
  return {
    userid: user.id,
    username: user.getUsername(),
    email: user.getEmail(),
    created: user.createdAt,
    updated: user.updatedAt,
    tags: buildLink(req, '/users/me/tags'),
    articles: buildLink(req, '/users/me/articles')
  };
};

module.exports.Api = function() {
  var api = new Api();
  return api;
};