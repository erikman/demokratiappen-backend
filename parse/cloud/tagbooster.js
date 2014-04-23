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


/**
 * This file implements functionality for boosting some known tags when certain
 * words are found in the documents we are analyzing. For instance we can use
 * this for boosting party names or names of known politicians.
 *
 * The tags we want to boost are stored in a BoostTag collection. When we get a
 * text we first tokenize the text and do some minor manipulations of the tokens
 * e.g. transform to lower case, stemming etc.
 *
 * We then search for BoostTags that matches any of the tokens we were left
 * with. We then use the ngram field of the BoostTag to see if we have a tag
 * that consists of multiple tokens, and if we have a match we will return the
 * boosted tag.
 */


var _ = require('cloud/underscore');


/**
 * @brief Take a text and split it into tokens
 *
 * @param {string} text input text to be parsed
 * @return array of {string}, each representing a token.
 */
function tokenize(text) {
  // Tokenize text into words, the unicode range should handle various
  // international charactersets.
  var tokens = text.match(/[a-z0-9_\-\u00C0-\u017F]+/gi);

  // TODO: Include snowball.js for stemming,
  // e.g. 'socialdemokraternas' -> 'socialdemokrat'

  return _.map(tokens, function(x) { return x.toLowerCase(); });
}


/**
 * @brief Combine two sets of relevance tags.
 *
 * This creates the union of the two tag sets, if a tag exists in both sets we
 * will pick the one with highest relevance.
 */
function combineRelevanceTags(tags1, tags2) {
  // Convert maps from the two arrays, indexed by the names
  function getName(rt) {
    return rt.tag.get('name');
  }
  var t1 = _.indexBy(tags1, getName);
  var t2 = _.indexBy(tags2, getName);

  var result = [];
  for (var tagName in t1) {
    var tag1 = t1[tagName];
    var tag2 = t2[tagName];

    // Pick the tag with highest relevance (if represented in both arrays)
    var tag = tag1;
    if (tag2) {
      tag = (tag1.relevance > tag2.relevance) ? tag1 : tag2;
    }
    result[result.length] = tag;
  }

  // Add tags we only have in t2
  for (var tagName in t2) {
    if (!_.has(t1, tagName)) {
     result[result.length] = t2[tagName];
    }
  }

  return result;
}
exports.combineRelevanceTags = combineRelevanceTags;


/**
 * @brief Boost tags in text with known tags
 *
 * Search for known tags in text and if found boost their relevance.
 *
 * @param {string} text Text document to analyze
 * @return {Parse.Promise} which will resolve with an array of relevanceTags
 */
function boostTags(text) {
  var tokens = tokenize(text);

  var query = new Parse.Query('BoostTag');
  query.containedIn('matchToken', tokens);
  query.include('tag');
  return query.find().then(function (boostTags) {
    var relevanceTags = [];

    // We have a list of tags that matches our BoostTags, check if the BoostTag
    // is a multi-token tag and if so if it matches our text.
    for (var boostTagId = 0; boostTagId < boostTags.length; boostTagId++) {
      var boostTag = boostTags[boostTagId];
      var matchToken = boostTag.get('matchToken');
      var isMatch = true;
      var ngram = boostTag.get('ngram');
      if (ngram) {
        // We need to check the rest of the ngram before we know if we have a
        // match.
        isMatch = false;

        // We have an ngram array, check if the text contains a match.
        for (var tokenId = 0; !isMatch && tokenId < tokens.length; tokenId++) {
          if (tokens[tokenId] === matchToken) {
            // We are matching the first token, check if the rest of the ngram
            // matches.
            isMatch = true;
            for (var ngramId = 0;
                 isMatch && ngramId < ngram.length;
                 ngramId++) {
              isMatch = (ngram[ngramId] === tokens[tokenId + 1 + ngramId]);
            }
          }
        }
      }

      if (isMatch) {
        // Format a result like our results from saplo by adding a relevance
        // tag and return them.
        relevanceTags[relevanceTags.length] = {
          relevance: 1.0,
          tag: boostTag.get('tag')
        };
      }
    }

    return Parse.Promise.as(relevanceTags);
  });
}
exports.boostTags = boostTags;


/**
 * @brief Add tags to the BoostTag collection.
 *
 * This function allows us to register tags which should be boosted when we
 * parse texts.
 */
function addTagBoost(request, response) {
  var BoostTag = Parse.Object.extend('BoostTag');
  var tagNames = JSON.parse(request.body).tagNames;
  if (!tagNames) {
    response.error('Required parameter tagNames was not specified.');
    return;
  }

  // Search for the tags in parse
  var query = new Parse.Query('Tag');
  query.containedIn('name', tagNames);
  query.find().then(function(parseTags) {
    // Are there any tags we are missing in the database? We can't add them
    // here since we don't know the type of the tag so just report them.
    if (parseTags.length != tagNames.length) {
      // Generate array with parse tag names
      var parseTagNames
        = _.map(parseTags, function(x) { return x.get('name'); });
      var missingTags = _.difference(tagNames, parseTagNames);
      var missingTagsString = _.reduce(missingTags, function (a, b) {
        return a.concat(", ", b);
      });

      console.error('Following tags are unknown: ' + missingTagsString);
      return Parse.Promise.error('Following tags are unknown: '
        + missingTagsString);
    }

    // Add the tags to the BoostTag collection
    var boostTags = [];
    for (var i = 0; i < parseTags.length; i++) {
      // Tokenize the tag
      var tagName = parseTags[i].get('name');
      var tokens = tokenize(tagName);
      if (!tokens || tokens.length <= 0) {
        return Parse.Promise.error('Error parsing tag "' + tagName + '"');
      }

      // Create new BoostTag object
      var boostTag = new BoostTag();
      boostTag.set('tag', parseTags[i]);
      boostTag.set('name', tagName);
      boostTag.set('matchToken', tokens[0]);
      if (tokens.length > 1) {
        boostTag.set('ngram', tokens.slice(1));
      }

      boostTags[i] = boostTag;
    }

    // Save the BoostTags we have created.
    return Parse.Object.saveAll(boostTags);
  }).then(function() {
    response.success('Success');
  }, function (error) {
    console.error('addBoostTag failed: ' + JSON.stringify(error));
    response.error(error);
  });
}
exports.addTagBoost = addTagBoost;
