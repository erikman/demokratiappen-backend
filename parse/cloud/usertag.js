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
 * @brief Function that works like _.property(key) but for backbone objects
 */
function bbProperty(propertyName) {
  return function (obj) {
    return obj.get(propertyName);
  }
}


function recreateAllUserTags(request, response) {
  // Iterate over all page objects
  var Page = Parse.Object.extend('Page');
  var pageCounter = 0;

  // TODO: Remove all UserTag objects
  // TODO: Remove all UserTopicTag objects

  // Iterate over all Page objects
  var pages = new Parse.Query(Page);
  pages.include('positive_tags');
  pages.include('negative_tags');
  pages.each(function (page) {
    if (pageCounter % 100 === 0) {
      // Set the  job's progress status
      response.message(pageCounter + ' pages processed.');
    }
    pageCounter += 1;

    page.set('processState', 0);
    return page.save();
  }).then(function() {
    response.success('Success, updated page state for ' + pageCounter + ' pages');
  }, function (error) {
    response.error('Failure: ' + JSON.stringify(error));
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
  var UserTopicTag = Parse.Object.extend('UserTopicTag');

  var getTagName = bbProperty('name');
  var getTag = bbProperty('tag');
  var getObjectId = _.property('id');

  var pageCounter = 0;

  // Iterate over all Page objects
  var pages = new Parse.Query(Page);
  pages.include('positive_tags');
  pages.include('negative_tags');
  pages.equalTo('processState', 0);
  pages.each(function (page) {
    if (pageCounter % 100 === 0) {
      // Set the  job's progress status
      response.message(pageCounter + ' pages processed.');
    }
    pageCounter += 1;

    var negativeTags = page.get('negative_tags');
    var positiveTags = page.get('positive_tags');
    var allTags = _.union(positiveTags, negativeTags);
    var user = page.get('user');
    var acl = new Parse.ACL(user);

    // Create mapping for the positive and negative tags
    var negativeIds = _.indexBy(negativeTags, getObjectId);
    var positiveIds = _.indexBy(positiveTags, getObjectId);

    page.set('processState', 1);
    userTopicTags[userTopicTags.length] = page;

    // Create user topic tags
    var userTopicTags = [];
    for (var i = 0; i < allTags.length; i++) {
      var tag = allTags[i];
      var tagId = getObjectId(tag);
      var newUserTopicTag = new UserTopicTag();

      newUserTopicTag.set('name', tag.get('name'));
      newUserTopicTag.set('tag',  tag);
      newUserTopicTag.set('topic', tag.get('topic'));
      newUserTopicTag.set('user', user);

      var score = (_.has(positiveIds, tagId) ? 1 : 0);
        + (_.has(negativeIds, tagId) ? -1 : 0);
      newUserTopicTag.set('score', score);

      userTopicTags[userTopicTags.length] = newUserTopicTag;
    }
    return Parse.Object.saveAll(userTopicTags).then(function () {
      // Get the user tags for the tags associated with this page
      var userTags = new Parse.Query(UserTag);
      userTags.include('tag');
      userTags.equalTo('user', user);
      userTags.containedIn('tag', allTags);
      return userTags.find();
    }).then(function (userTags) {
      var userTagsToSave = [];

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
    response.success('Success, updated user tags for ' + pageCounter + ' pages');
  }, function (error) {
    response.error('Failure: ' + JSON.stringify(error));
  });
}
exports.updateUserTags = updateUserTags;

