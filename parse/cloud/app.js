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

// These two lines are required to initialize Express in Cloud Code.
var express = require('express');
var app = express();
var api = require('cloud/rest_api');

// Global app configuration section
app.use(express.bodyParser());    // Middleware for reading request body

// Set up intermediate handlers
app.param(function(name, fn){
  if (fn instanceof RegExp) {
    return function(req, res, next, val){
      var captures;
      if (captures = fn.exec(String(val))) {
        req.params[name] = captures;
        next();
      } else {
        next('route');
      }
    }
  }
});

app.param('userid', /^\w+$/);
app.param('tagid', /^\w+$/);
app.param('articleid', /^\w+$/);

// Routes
var api = new api();
app.get('/', api.root);
app.post('/oauth/access_token', api.accessToken);
app.get('/users/me', api.getUser);
app.post('/users/me', api.updateUser);
app.get('/users/:userid', api.getUser);
app.get('/users/:userid/tags', api.getUserTags);
app.get('/users/:userid/articles', api.getUserArticles);

// Attach the Express app to Cloud Code.
app.listen();
