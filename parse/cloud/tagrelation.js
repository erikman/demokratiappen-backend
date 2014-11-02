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

// Supported parameters in request object:
// tagName:             The name of the tag ("in tag")
// tagType:             Type of tag (Person, Political party, ...)
// relatedTag:          The tag related to ... ("out tag")
// relationType:        The relation type (Synonym, ...)
function relateTags(request, response) {
  var requestJSON = JSON.parse(request.body);

  var tagName = requestJSON.tagName;
  var tagType = requestJSON.tagType;
  var relatedTag = requestJSON.relatedTag;
  var relationType = requestJSON.relationType;

  function debugLog(str) {
    // Enable next line to turn on debug logging
    console.log('tagrelation.relateTags: ' + str);
  }
  function errorLog(str) {
    console.error('tagrelation.relateTags: ' + str);
  }

  function createTagRelationIfNeeded(){
     // Start a thread to find the TagRelation in our database, and get the tags
    var query = new Parse.Query("TagRelation");
    query.equalTo("tagName", tagName);
    query.equalTo("relatedTag", relatedTag);
    query.find().then(function(findresult) {
      var promise;
      if(findresult.length < 1) {
        tagRelation = createTagRelation(tagName, tagType, relatedTag, relationType);

        // Need to use master key, ordinary users are not allowed to create
        // Tag objects
        Parse.Cloud.useMasterKey();

        // Add save operation to promise
        promise = tagRelation.save();
      } else {
        // Create a promise that immedideately succeeds
        promise = new Parse.Promise.as();
      }

      // Return promise that is triggered when the tag relation have been saved.
      return promise;
    }, function(error){
        debugLog("Could not find tag relation.");
        response.error("Could not find tag relation.");
    }).then(
    function(tagRelationObject){
      if( !tagRelationObject ){
        debugLog("Tag relation already exists.");
      } else {
        debugLog("Stored new tag relation: " + JSON.stringify(tagRelationObject));
      }

      // Return the result tag objects to the requester
      response.success();
    },
    function(error){
      debugLog("Could not save tag relation.");
      response.error("Could not save tag relation.");
    });
  }

  createTagRelationIfNeeded();
}

function createTagRelation(tagName, tagType, relatedTag, relationType) {
  // Create parse object with public read access, but no write
  // access.
  var tagACL = new Parse.ACL();
  tagACL.setPublicReadAccess(true);
  var TagRelation = Parse.Object.extend("TagRelation");
  var tagRelation = new TagRelation();
  tagRelation.setACL(tagACL);
  tagRelation.set("tagName", tagName);
  tagRelation.set("tagType", tagType);
  tagRelation.set("relatedTag", relatedTag);
  tagRelation.set("relationType", relationType);
  tagRelation.set("associationStrength", 0);

  return tagRelation;
}
exports.relateTags = relateTags

// Supported parameters in request object:
// tagName:             The name of the tag ("in tag")
// relatedTag:          The tag related to ... ("out tag")
// associationStrength: The association strength
function setAssociatonStrengthForTagRelation(request, response){
  var requestJSON = JSON.parse(request.body);

  var tagName = requestJSON.tagName;
  var relatedTag = requestJSON.relatedTag;
  var associationStrength = requestJSON.associationStrength;

  function debugLog(str) {
    // Enable next line to turn on debug logging
    console.log('tagrelation.setAssociatonStrengthForTagRelation: ' + str);
  }
  function errorLog(str) {
    console.error('tagrelation.setAssociatonStrengthForTagRelation: ' + str);
  }

  function updateAssociationStrength(){
     // Start a thread to find the TagRelation in our database, and get the tags
    var query = new Parse.Query("TagRelation");
    query.equalTo("tagName", tagName);
    query.equalTo("relatedTag", relatedTag);
    query.first().then(function(tagRelation) {
      tagRelation.set("associationStrength", associationStrength);

      // Need to use master key, ordinary users are not allowed to change
      // Tag objects
      Parse.Cloud.useMasterKey();

      // Return promise that is triggered when the tag relation have been saved.
      return tagRelation.save();
    }, function(error){
        debugLog("Could not find tag relation.");
        response.error("Could not find tag relation.");
    }).then(
    function(tagRelationObject){
      if( !tagRelationObject ){
        debugLog("Failed to update tag relation.");
      } else {
        debugLog("Updated tag relation: " + JSON.stringify(tagRelationObject));
      }

      // Return the result tag objects to the requester
      response.success();
    },
    function(error){
      debugLog("Could not save tag relation." + error.message);
      response.error("Could not save tag relation." + error.message);
    });
  }

  updateAssociationStrength();
}
exports.setAssociatonStrengthForTagRelation = setAssociatonStrengthForTagRelation

function computeAssociatedTags(request, response) {
  // Idé: Få ut relationen mellan två taggar
  //      Baserat på att varje url har en lista med de taggar som hittades i artikeln.
  //      Då kan vi få ut ett mått på hur ofta dessa förekommer tillsammans.
  //      Vad använder vi för enhet?
  //      Betingade sannolikheter?

  // Troligen (pga sättet som det lagras) ska vi göra detta som batch-körningar
}
// exports.computeAssociatedTags = computeAssociatedTags



/**
 * Compiled Tag Associations
 *
 * Propagate tag strengths along the edges
 *
 * tag: {Tag}
 * relatedTags: {[Tag]}
 * relatedTagStrength: {[Double]}
 */
