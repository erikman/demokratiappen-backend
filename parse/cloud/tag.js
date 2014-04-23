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

var Saplo = require('cloud/saplo');
var saploKeys = require('cloud/saplo_parameters').saploKeys;
var tagBooster = require('cloud/tagbooster');

var collection = new Saplo.Collection({'collection_id': saploKeys.DemokratiArtiklar});


/**
 * @brief Helper function for updating a Url object with tags from parse
 *
 * This function takes an Url object as input (which might be unsaved but needs
 * to have the textId parameter set), and asks Saplo for the tags related to
 * the url.
 *
 * It will update the 'relevanceTags' property on the url object but will not
 * store the url in the Parse database.
 *
 * @return Parse.Promise with the url object as result.
 */
function addTagsOnUrl(url) {
  function dLog(str) {
    // Enable next line to turn on debug logging
    // console.log('addTagsOnUrl: ' + str);
  }
  dLog('begin');

  // Create a saplo object for the text.
  var text = new Saplo.Text({
    text_id: url.get('textId'),
    collection_id: collection.collection_id
  });

  // This is where we collect our parse tags. The indices matches the
  // items in the saploTags.tags array
  var resultTags = [];
  var saploTags = [];

  return text.tags().then(function (tags) {
    dLog('have saplo tags');

    // Now we have an array with tags
    // [
    //   {
    //     "category": "person/location/organisation",
    //     "tag": "Bertil Adam",
    //     "relevance": 0.7,
    //   },
    // ]
    saploTags = tags;

    // Search for tags in the parse database, prepare our query
    var tagNames = [];
    for (var i = 0; i < saploTags.tags.length; i++) {
      tagNames = tagNames.concat(saploTags.tags[i].tag);
    }

    var Tag = Parse.Object.extend("Tag");
    var query = new Parse.Query("Tag");
    query.containedIn("name", tagNames);
    return query.find();
  }).then(function (parseTags) {
    dLog('have parse tags');

    // Check if we have found any new tags that don't have a post in
    // the parse database.
    var newTagPromises = [];
    for (var i = 0; i < saploTags.tags.length; i++) {
      var foundTag = false;
      for (var j = 0; j < parseTags.length; j++) {
        if (parseTags[j].get("name") == saploTags.tags[i].tag
            && parseTags[j].get("type") == saploTags.tags[i].category) {
          foundTag = true;

          resultTags[resultTags.length] = parseTags[j];
          break;
        }
      }

      if (!foundTag) {
        // Need to use master key, ordinary users are not allowed to create
        // Tag objects
        Parse.Cloud.useMasterKey();

        // Create parse object with public read access, but no write
        // access.
        var tagACL = new Parse.ACL();
        tagACL.setPublicReadAccess(true);
        var Tag = Parse.Object.extend("Tag");
        var tag = new Tag();
        tag.setACL(tagACL);
        tag.set("name", saploTags.tags[i].tag);
        tag.set("type", saploTags.tags[i].category);

        // Add save operation to promise
        newTagPromises[newTagPromises.length] = tag.save();
        resultTags[resultTags.length] = tag;
      }
    }

    // Return promise that is triggered when all tags have been saved.
    return Parse.Promise.when(newTagPromises);
  }).then(function () {
    dLog('saved new tags');

    // Associate relevance with the tags (now we have id on all our
    // objects).
    // Note resultTags and saploTags match so same index can be used in
    // both arrays.
    var urlRelevanceTags = [];
    for (var i = 0; i < resultTags.length; i++) {
      urlRelevanceTags[urlRelevanceTags.length] = {
        tag: resultTags[i],
        relevance: saploTags.tags[i].relevance
      };
    }

    url.set("relevanceTags", urlRelevanceTags);

    dLog('success');
    return Parse.Promise.as(url);
  });
}


/**
 * @brief Add a text to the database
 *
 * This function is a cloud function, the parameters on the request object are
 * text:     The text to be tagged
 * url:      The url for the text (uesd for cache:ing)
 * title:    The text's headline
 */
function extractTags(request, response) {
  var requestJSON = JSON.parse(request.body);

  var textBody = requestJSON.text;
  var textUrl = requestJSON.url;
  var textHeadline = requestJSON.title;

  function dLog(str) {
    // Enable next line to turn on debug logging
    // console.log('extractTags: ' + str);
  }
  dLog('begin');
  if (!textBody) {
    response.error("Missing required field: text");
    return;
  }
  if (!textUrl) {
    response.error("Missing required field: url");
    return;
  }
  if (!textHeadline) {
    response.error("Missing required field: title");
    return;
  }

  // This function takes a Saplo.Text object as input and extracts
  // information from Saplo and store it in the Parse database.
  //
  // Return Promise with Url object
  function extractAndSave(text) {
    dLog('entering extractAndSave');

    // Need to use master key, ordinary users are not allowed to create
    // Tag objects
    Parse.Cloud.useMasterKey();

    var urlACL = new Parse.ACL();
    urlACL.setPublicReadAccess(true);

    var Url = Parse.Object.extend("Url");
    var url = new Url();

    url.setACL(urlACL);
    url.set("url", textUrl);
    url.set("textId", text.text_id);
    url.set("text", textBody);
    url.set("headline", textHeadline);

    return addTagsOnUrl(url).then(function () {
      // Search for extra tags to boost
      return tagBooster.boostTags(textHeadline + ' ' + textBody);
    }).then(function (extraRelevanceTags) {
      var relevanceTags = url.get('relevanceTags');
      dLog('boosting tags: ' + JSON.stringify(extraRelevanceTags));

      var newRelevanceTags
        = tagBooster.combineRelevanceTags(extraRelevanceTags, relevanceTags);

      url.set('relevanceTags', newRelevanceTags);

      dLog('save url object');
      return url.save();
    });
  }

  // Start a thread to find the url in our database, and get the tags
  var query = new Parse.Query("Url");
  query.equalTo("url", textUrl);
  query.find().then(function(urls) {
    if (urls.length == 0) {
      dLog('Send text to saplo for analysis.');
      // If we _don't_ have the url in our database, so send it to saplo for
      // analysis.
      return collection.createText(textBody, textHeadline, textUrl)
        .then(extractAndSave);
    }
    else {
      dLog('Return previously analyzed Url object.');
      // We have the url in our database, so we can return directly
      return Parse.Promise.as(urls[0]);
    }
  }).then(function(url) {
    response.success({id: url.id});
    dLog('success');
  }, function (error) {
    console.error('extractTags failed: ' + JSON.stringify(error));
    response.error("Finding parse URL object failed.");
  });
} // extractTags
exports.extractTags = extractTags;


function listCollections(request, response) {
  Saplo.Collection.list().then(function(collections) {
    response.success(collections);
  },
  function(error) {
    console.error('listCollections failed: ' + JSON.stringify(error));
    response.error('listCollections failed.');
  });
}
exports.listCollections = listCollections;

