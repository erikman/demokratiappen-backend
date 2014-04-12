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
 * along with Demokratiappen.  If not, see <http://www.gnu.org/licenses/>.
 */

// List with saplo error codes
var saploErrorCodes = {
  'TOKEN_EXPIRED': 595
};

var saploErrorDescriptions = {
  'TOKEN_EXPIRED': 'Access token has expired'
};


/**
 * @brief Initialize the saplo api library.
 */
var saploApiKey;
var saploSecretKey;
function initialize(apiKey, secretKey) {
  if (!apiKey || !secretKey) {
    console.error('Saplo.initialize was called with invalid keys.');
    return;
  }
  if (saploApiKey || saploSecretKey) {
    console.error('Saplo.initialize has already been called.');
  }

  saploApiKey = apiKey;
  saploSecretKey = secretKey;
}
exports.initialize = initialize;


/**
 * @brief Make request to saplo.
 *
 * This function manages access to SAPLO. We will use a cached access token
 * if available, otherwise we will request a new token. If we get a
 * 'TOKEN_EXPIRED' error we will request a new token and resubmit the saplo
 * request.
 */
var saploAccessUrlWithToken;
function saploRequest(request) {
  function dLog(str) {
    // Enable next line to turn on debug logging
    // console.log('saploRequest: ' + str);
  }
  dLog('begin');

  if (!saploApiKey || !saploSecretKey) {
    return Parse.Promise.error('Saplo.initialize must be invoked before requests can be made');
  }

  /**
   * Connect to Saplo.
   *
   * @return Promise with access token when we are connected
   */
  function auth_accessToken() {
    dLog('getAccessToken');
    var saploUrlWithToken = 'http://api.saplo.com/rpc/json?access_token=';

    // Request object to ask for a authorization token
    var accessTokenRequest = {
      "method": "auth.accessToken",
      "params": {
        "api_key":    saploApiKey,
        "secret_key": saploSecretKey
      }
    };

    return Parse.Cloud.httpRequest({
      url: 'http://api.saplo.com/rpc/json',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(accessTokenRequest)
    }).then(function (httpResponse) {
      // Was this a success?
      var result = httpResponse.data.result;
      if (result) {
        dLog('Got saplo access token');
        return Parse.Promise.as(saploUrlWithToken + result.access_token);
      }
      else {
        var error = httpResponse.data.error;
        var errorMessage;
        if (error) {
          errorMessage = 'Saplo error(' + error.code + '): ' + error.msg;
        }
        else {
          errorMessage = 'Saplo: Neither result nor error returned';
        }

        console.error(errorMessage);
        return Parse.Promise.error(errorMessage);
      }
    });
  }

  function saploRequestWithToken(accessUrl) {
    dLog('Make saplo request: ' + JSON.stringify(request));

    // Try to make real request
    return Parse.Cloud.httpRequest({
      url: accessUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(request)
    }).then(function (httpResponse) {
      dLog('Got Saplo response: ' + JSON.stringify(httpResponse.data));

      if (httpResponse.data.result) {
        return Parse.Promise.as(httpResponse.data.result);
      }
      else {
        var error = httpResponse.data.error;
        return Parse.Promise.error(error);
      }
    });
  }

  if (saploAccessUrlWithToken) {
    return saploRequestWithToken(saploAccessUrlWithToken)
      .fail(function (error) {
      // The request failed, check if it was due to an expired token
      if (error.code ==  saploErrorCodes['TOKEN_EXPIRED']) {
        dLog('Saplo token has expired, request new token');
        auth_accessToken().then(function (accessUrl) {
          // Cache the url until next time we make a saplo request
          saploAccessUrlWithToken = accessUrl;

          // Issue the main request
          dLog('reissuing saplo request');
          return saploRequestWithToken(saploAccessUrlWithToken);
        });
      }
      else {
        // The function failed due to some other error. Rethrow the error so
        // someone else can handle it.
        return Parse.Promise.error(error);
      }
    });
  }
  else {
    dLog('No Sapo acccess token available. Request one.');
    return auth_accessToken().then(function (accessUrl) {
      // Cache the url until next time we make a saplo request
      saploAccessUrlWithToken = accessUrl;

      // Issue the main request
      return saploRequestWithToken(saploAccessUrlWithToken);
    });
  }
}


function Text(data) {
  this.collection_id = data.collection_id;
  this.text_id = data.text_id;
}
exports.Text = Text;


/**
 * @brief Wrapper around Saplo's text.relatedGroups function
 *
 * The function returns an promise with an array of objects like:
 * {
 *   relevance: 0.91,
 *   group: { Group Object }
 * },
 *
 * @return Promise that will return an array with related groups
 */
Text.prototype.relatedGroups = function() {
  var request = {
    method: 'text.relatedGroups',
    params: {
      collection_id: this.collection_id,
      text_id: this.text_id
    },
    id:0
  };

  return saploRequest(request).then(function (result) {
    // Convert the result to wrapped objects
    var groups = [];
    for (var i = 0; i < result.related_groups; i++) {
      var saploGroup = result.related_groups[i];
      groups[groups.length] = {
        relevance: saploGroup.relevance,
        group: new Group(saploGroup)
      };
    }

    return Parse.Promise.as(groups);
  });
}


Text.prototype.tags = function() {
  // Object to use to post the text id and get back the tags
  var request = {
    "method": "text.tags",
    "params": {
      "collection_id": this.collection_id,
      "text_id": this.text_id,
      "wait": 15
    },
    "id": 0
  };

  return saploRequest(request);
}


/**
 * @brief List Saplo groups
 *
 * Each group has properties like:
 * {
 *   "group_id":13,
 *   "name":"My Tech Group",
 *   "language":"en",
 *   "description":"Group based on tech articles.",
 *   "date_created":"2011-03-30T10:31:33z",
 *   "date_updated":"2011-07-15T23:08:54z"
 * }
 *
 * only group_id is guaranteed to exist, depending on how the group was
 * retrieved.
 */
function Group(groupData) {
  this.group_id = groupData.group_id;
  this.name = groupData.name;
  this.language = groupData.language;
  this.description = groupData.description;
}
exports.Group = Group;

/**
 * @brief Create Saplo group
 *
 * @return Promise when group is created
 */
Group.create = function(name, lang) {
  var request = {
    "method": "group.create",
    "params": {
      "name": name,
      "language": lang
    },
    "id":0
  };

  return saploRequest(request).then(function (result) {
    var groupObject = new Group(result);
    return Parse.Promise.as(groupObject);
  });
}


/**
 * @brief List Saplo groups
 *
 * Each group looks like:
 * {
 *   "group_id":13,
 *   "name":"My Tech Group",
 *   "language":"en",
 *   "description":"Group based on tech articles.",
 *   "date_created":"2011-03-30T10:31:33z",
 *   "date_updated":"2011-07-15T23:08:54z"
 * },
 *
 * @return Promise with list of groups
 */
Group.list = function() {
  var request = {
    "method": "group.list",
    "params": {},
    "id":0
  };

  return saploRequest(request).then(function (result) {
    groupObjects = [];
    for (var i = 0; i < result.groups.length; i++) {
      groupObjects[groupObjects.length] = new Group(result.groups[i]);
    }
    return Parse.Promise.as(groupObjects);
  });
}


/**
 * @brief Remove Saplo group
 *
 * This function is called group.delete in the SAPLO api, but delete is a
 * reserved word in javascript, so we use remove instead.
 *
 * Note that the object is not destroyed because that is up to the garbage
 * collector to do, instead we just clear the contents of the group object.
 *
 * @return Promise when group has been deleted.
 */
Group.prototype.remove = function() {
  var request = {
    "method": "group.delete",
    "params": {
      'group_id': this.group_id
    },
    "id":0
  };

  return saploRequest(request).then(function () {
    // This doesn't really delete anything it just makes group_id and name
    // return undefined.
    delete this.group_id;
    delete this.name;
    return Parse.Promise.as();
  });
}


/**
 * @brief A Saplo Collection object
 *
 * A collection is a container where you store texts you want to analyze.
 *
 * @constructor
 * @param data Initialization object
 */
function Collection(data) {
  this.collection_id = data.collection_id;
};
exports.Collection = Collection;


/**
 * @brief Get all registered collections
 *
 * @return Promise with array of collection objects
 */
Collection.list = function() {
  var request = {
    'method': 'collection.list',
    'params': {},
    'id': 0
  };

  return saploRequest(request).then(function (result) {
    collectionObjects = [];
    for (var i = 0; i < result.collections.length; i++) {
      collectionObjects[groupObjects.length]
        = new Collection(result.collections[i]);
    }
    return Parse.Promise.as(collectionObjects);
  });
}


/**
 * @brief Create text object in collection
 *
 * @return Parse.Promise with a Saplo.Text object
 */
Collection.prototype.createText = function(body, headline, url) {
    var request = {
    method: 'text.create',
    params: {
      body: body,
      headline: headline,
      collection_id: this.collection_id,
      url: url
    },
    id: 0
  };

  return saploRequest(request).then(function (textData) {
    var textObject = new Text(textData);
    return Parse.Promise.as(textObject);
  });
}

