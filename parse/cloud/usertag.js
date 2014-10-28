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


/**
 * @brief Remove all objects that matches a query.
 *
 * @return {Parse.Promise} when the objects have been removed.
 */
function deleteAll(query) {
  var batchSize = 1000;

  var objects = [];
  return query.each(function (object) {
    // Create batches of objects each that we remove
    var promise;
    objects[objects.length] = object;
    if (objects.length > batchSize) {
      // We have filled one batch, send it to parse for removal, the 'each' iteration will
      // continue when the objects have been removed.
      promise = Parse.Object.deleteAll(objects);
      objects = [];
    }
    else {
      promise = Parse.Promise.as();
    }
    return promise;
  }).then(function () {
    // Take care of the last batch of objects
    promise = Parse.Objects.deleteAll(objects);
    return promise;
  });
}


/**
 * @brief Reset the UserTag and UserTopicTag classes and all pages to allow us to recreate
 *    the data.
 *
 * This can be used as a recovery operation if the UserTags processing fails or the format
 * of the data changes.
 */
function recreateAllUserTags(request, response) {
  // Iterate over all page objects
  var Page = Parse.Object.extend('Page');
  var pageCounter = 0;

  // Remove all UserTag and UserTopicTag objects
  deleteAll(new Parse.Query('UserTag')).then(function () {
    response.message('Removed all UserTag objects.');
    return deleteAll(new Parse.Query('UserTopicTag'));
  }).then(function () {
    response.message('Removed all UserTopicTag objects.');

    // Iterate over all Page objects
    var pages = new Parse.Query(Page);
    return pages.each(function (page) {
      if (pageCounter % 100 === 0) {
        // Set the  job's progress status
        response.message(pageCounter + ' pages processed.');
      }
      pageCounter += 1;

      page.set('processState', 0);
      return page.save();
    });
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
  var Page = Parse.Object.extend('Page');
  var UserTag = Parse.Object.extend('UserTag');
  var UserTopicTag = Parse.Object.extend('UserTopicTag');

  var getTagName = bbProperty('name');
  var getTag = bbProperty('tag');
  var getObjectId = _.property('id');

  var pageCounter = 0;

  // Iterate over Page objects that should be updated.
  // Pages with process state != 1 have not been processed.
  var pages = new Parse.Query(Page);
  pages.include('positive_tags');
  pages.include('negative_tags');
  pages.notEqualTo('processState', 1);
  pages.each(function (page) {
    if (pageCounter % 100 === 0) {
      // Set the job's progress status
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

    // Get the user tags for the tags associated with this page
    var userTags = new Parse.Query(UserTag);
    userTags.include('tag');
    userTags.equalTo('user', user);
    userTags.containedIn('tag', allTags);
    return userTags.find().then(function (userTags) {
      var objectsToSave = [];

      // Update process state on this page
      page.set('processState', 1);
      objectsToSave[objectsToSave.length] = page;

      // Create user topic tags
      var userTopicTags = [];
      for (var i = 0; i < allTags.length; i++) {
        var tag = allTags[i];
        var tagId = getObjectId(tag);
        var newUserTopicTag = new UserTopicTag();

        newUserTopicTag.setACL(acl);
        newUserTopicTag.set('name', tag.get('name'));
        newUserTopicTag.set('tag',  tag);
        newUserTopicTag.set('topic', tag.get('topic'));
        newUserTopicTag.set('user', user);
        newUserTopicTag.set('createdAt', page.get('createdAt'));

        var score = (_.has(positiveIds, tagId) ? 1 : 0);
          + (_.has(negativeIds, tagId) ? -1 : 0);
        newUserTopicTag.set('score', score);

        objectsToSave[objectsToSave.length] = newUserTopicTag;
      }

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

        objectsToSave[objectsToSave.length] = newUserTag;
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

        objectsToSave[objectsToSave.length] = userTag;
      }
      return Parse.Object.saveAll(objectsToSave);
    });
  }).then(function() {
    response.success('Success, updated user tags for ' + pageCounter + ' pages');
  }, function (error) {
    response.error('Failure: ' + JSON.stringify(error));
  });
}
exports.updateUserTags = updateUserTags;

