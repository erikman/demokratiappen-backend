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

/**
 * Setup default users and roles we need in the system
 *
 * You can trigger this code using:
 * curl -X POST \
 * -H "X-Parse-Application-Id: INSERT-PARSE-API-KEY" \
 * -H "X-Parse-REST-API-Key: INSERT-PARSE-REST-KEY" \
 * -H "Content-Type: application/json" \
 * -d '{}' \
 * https://api.parse.com/1/functions/createDefaultUsers
 */
function createDefaultUsers(request, response) {
  // First we create all default users
  var userPromises = [];

  /* var rootUser = new Parse.User();
  rootUser.set('username', 'rootUser');
  rootUser.set('password', 'root');
  userPromises[userPromises.length]
    = rootUser.signUp({ ACL: new Parse.ACL() }); */

  // Create a guest user
  var guestUser = new Parse.User();
  guestUser.set('username', 'Sandra');
  guestUser.set('password', 'guest');
  userPromises[userPromises.length]
    = guestUser.signUp({ ACL: new Parse.ACL() });

  var setupPromise = Parse.Promise.when(userPromises).then(function() {
    // Create roles in sequence since some roles need access are set to
    // administer other roles
    var rootRoleACL = new Parse.ACL();
    rootRoleACL.setPublicReadAccess(true);
    var rootRole = new Parse.Role('root', rootRoleACL);
    var rolePromises = rootRole.save().then(function() {
      // Create guest group
      var guestRoleACL = new Parse.ACL();
      guestRoleACL.setPublicReadAccess(true);
      guestRoleACL.setRoleWriteAccess(rootRole, true);
      var guestRole = new Parse.Role('guest', guestRoleACL);
      guestRole.getUsers().add(guestUser);
      return guestRole.save();
    });
    return rolePromises;
  });

  setupPromise.then(function () {
    response.success("createDefaultUsers: Completed successfully!");
  },
  function (error) {
    console.error('createDefaultUsers: Failed: ' + JSON.stringify(error));
    response.error(error);
  });
}

exports.createDefaultUsers = createDefaultUsers;


/**
 * Setup Saplo groups
 *
 * You can trigger this code using:
 * curl -X POST \
 * -H "X-Parse-Application-Id: INSERT-PARSE-API-KEY" \
 * -H "X-Parse-REST-API-Key: INSERT-PARSE-REST-KEY" \
 * -H "Content-Type: application/json" \
 * -d '{}' \
 * https://api.parse.com/1/functions/createSaploGroups
 */
function createSaploGroups(request, response) {
  var parseTags;
  var saploGroups;

  return Saplo.Group.list().then(function (groups) {
    saploGroups = groups;

    // Iterate over the topic tags and create groups for each one
    var tagQuery = new Parse.Query('Tag');
    tagQuery.equalTo('type', 'topic');
    return tagQuery.find();
  }).then(function (tags) {
    parseTags = tags;

    console.log('Have ' + saploGroups.length + ' saplo groups and ' + parseTags.length + ' parse tags.');

    // Saplo has a limit on number of groups that can be created, so start by
    // checking if there are any groups we should remove.
    groupRemovePromises = [];
    for (var groupId = 0; groupId < saploGroups.length; groupId++) {
      var haveTagForGroup = false;
      for (var tagId = 0; tagId < parseTags.length; tagId++) {
        if (saploGroups[groupId].name === parseTags[tagId].get('name')) {
          haveTagForGroup = true;
          break;
        }
      }

      if (!haveTagForGroup) {
        // No matching tag for this group. Remove the group.
        console.log('Remove group ' + saploGroups[groupId].name);
        groupRemovePromises[groupRemovePromises.length]
          = saploGroups[groupId].remove();
      }
    }
    return Parse.Promise.when(groupRemovePromises);
  }).then(function() {
    // Iterate over the topic tags, create saplo groups for the ones we don't
    // already have.
    var groupCreatePromises = [];
    for (var tagId = 0; tagId < parseTags.length; tagId++) {
      var tag = parseTags[tagId];

      // Check if we have a group for this topic.
      var haveGroupForTopic = false;
      for (var groupId = 0; groupId < saploGroups.length; groupId++) {
        if (saploGroups[groupId].name === tag.get('name')) {
          haveGroupForTopic = true;
          break;
        }
      }

      if (!haveGroupForTopic) {
        console.log('Create saplo group ' + tag.get('name'));
        groupCreatePromises[groupCreatePromises.length]
          = Saplo.Group.create(tag.get('name'), 'sv');
      }
    }

    return Parse.Promise.when(groupCreatePromises);
  }).then(function () {
    response.success("createSaploGroups: Completed successfully!");
  }, function(error) {
    console.error('createSaploGroups: Failed: ' + JSON.stringify(error));
    response.error(error);
  });
}
exports.createSaploGroups = createSaploGroups;
