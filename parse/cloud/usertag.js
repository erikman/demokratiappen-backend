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


var _ = require('cloud/underscore');


/**
 * @brief Find the elements available in list and not available in other when
 *   compared by the result of iterator.
 */
function differenceBy(listA, listB, iterator) {
  var mapA = _.indexBy(listA, iterator);

  // Get the difference of the keys
  var listAKeys = _.keys(mapA);
  var listBKeys = _.map(listB, iterator);
  var differenceKeys = _.difference(listAKeys, listBKeys);

  // Return the objects corresponding to the differenceKeys
  return _.map(differenceKeys, function (key) {
    return mapA[key];
  });
}


/**
 * @brief Cloud function for updating the UserTags
 */
function updateUserTags(request, response) {
  // Need to use master key since we will create objects on behalf of users.
  Parse.Cloud.useMasterKey();

  // Iterate over all page objects
  // TODO: Limit which pages that needs to be processed by keeping a status
  //       field on the Page object.
  var Page = Parse.Object.extend('Page');
  var UserTag = Parse.Object.extend('UserTag');

  function getTagName(tag) {
    return tag.get('name');
  }
  function getTag(tag) {
    return tag.get('tag');
  }
  function getObjectId(tag) {
    return tag.id;
  }
  var pageCounter = 0;

  // Iterate over the Page objects connected to this user
  var pages = new Parse.Query(Page);
  pages.include('positive_tags');
  pages.include('negative_tags');
  pages.each(function (page) {
    if (pageCounter % 100 === 0) {
      // Set the  job's progress status
      response.message(pageCounter + " pages processed.");
    }
    pageCounter += 1;

    // Get the user tags for the tags associated with this page
    var negativeTags = page.get('negative_tags');
    var positiveTags = page.get('positive_tags');
    var allTags = _.union(positiveTags, negativeTags);
    var user = page.get('user');
    var acl = new Parse.ACL(user);

    var userTags = new Parse.Query(UserTag);
    userTags.include('tag');
    userTags.equalTo('user', user);
    userTags.containedIn('tag', allTags);
    return userTags.find().then(function (userTags) {
      var userTagsToSave = [];

      // Create mapping for the positive and negative tags
      var negativeIds = _.indexBy(negativeTags, getObjectId);
      var positiveIds = _.indexBy(positiveTags, getObjectId);

      // Check if there are any UserTag objects that needs to be created.
      var tagsForExistingUserTags = _.map(userTags, getTag);
      var missingTagsForUserTags
        = differenceBy(allTags, tagsForExistingUserTags, getObjectId);
      for (var i = 0; i < missingTagsForUserTags.length; i++) {
        var missingTag = missingTagsForUserTags[i];
        var missingTagId = getObjectId(missingTag);

        var newUserTag = new UserTag();
        newUserTag.setACL(acl);
        newUserTag.set('name', missingTag.get('name'));
        newUserTag.set('tag', missingTag);
        newUserTag.set('user', user);
        newUserTag.set
          ('positiveCount', _.has(positiveIds, missingTagId) ? 1 : 0);
        newUserTag.set
          ('negativeCount', _.has(negativeIds, missingTagId) ? 1 : 0);

        userTagsToSave[userTagsToSave.length] = newUserTag;
      }

      // Increment the tag count for the UserTags
      for (var i = 0; i < userTags.length; i++) {
        var userTag = userTags[i];
        var tag = userTag.get('tag');
        var tagId = getObjectId(tag);

        if (_.has(positiveIds, tagId)) {
          userTag.increment('positiveCount');
        }
        if (_.has(negativeIds, tagId)) {
          userTag.increment('negativeCount');
        }

        userTagsToSave[userTagsToSave.length] = userTag;
      }
      return Parse.Object.saveAll(userTagsToSave);
    });
  }).then(function() {
    response.success('Success, updated UserTags for ' + pageCounter + ' pages');
  }, function (error) {
    response.error('Failure: ' + JSON.stringify(error));
  });
}
exports.updateUserTags = updateUserTags;
