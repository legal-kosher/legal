var fs = require('fs');
var _ = require('underscore');
var spawn = require('child_process').spawn;
var prc = spawn('npm', ['ls', '--json', '--long']);
var data = '';
var includes = ["name", "version", "licenses", "license", "dependencies"];
var modules;
var request = require('request');
var path = require('path');
var appDir = path.dirname(require.main.filename);

var host = 'http://127.0.0.1:8008/';
var uri = 'http://127.0.0.1:8008/post'

var parseModule = function(data) {

  var modules = data.dependencies;
  // this should come from a remote source .. 
  var rules = {
    "MIT": true,
    "GPL": false
  };

  // If data.licenses and a license fails the test, mark warning
  var markNodeSafety = function(data) {
    if (!data.license && !data.licenses) {
      data.license = "unknown"
    }
    if (data.licenses) {
      var passes = true;
      for (var i = 0; i < data.licenses.length; i++) {
        if (rules[data.licenses[i].type] === false) {
          passes = false;
          break;
        } else if (!rules[data.licenses[i].type] || rules[data.licenses[i].type] !== true) {
          passes = "warn";
          break;
        }
      }
      data.passes = passes;
    } else if (data.license) {
      if (rules[data.license] === true) {
        data.passes = true;
      } else if (!rules[data.license] || rules[data.license] !== true) {
        data.passes = "warn";
      } else {
        data.passes = false;
      }
    }
  };

  // Mark parent node safety status
  var markParentNode = function(parent, data) {
    if (data.passes === false) {
      parent.passes = false;
    } else if (data.passes === "warn" && parent.passes !== false) {
      parent.passes = "warn";
    }
    if (parent.parent) {
      markParentNode(parent.parent, data);
    }
  };

  var makeNode = function(name, data, parent) {
    // Modify data object
    data.name = name;
    var dependencies = data.dependencies;
    data.dependencies = [];
    data.parent = parent

    // Determine data object safety
    markNodeSafety(data);
      // Create child node for each dependency that points to data object as parent
    Object.keys(dependencies).forEach(function(depName) {
      makeNode(depName, dependencies[depName], data);
    });

    if (parent){
      if (data.passes !== true){
        markParentNode(parent, data);
      }
      parent.dependencies.push(data);
    }
  }

  // Begin parsing data
  Object.keys(modules).forEach(function(modKey) {
    makeNode(modKey, modules[modKey], null);
  });

  var toReturn = [];

  Object.keys(modules).forEach(function(modKey){
    toReturn.push(modules[modKey]);
  })
  return toReturn;

};

module.exports = function() {

  prc.stdout.setEncoding('utf8');
  prc.stdout.on('data', function(chunk) {
    data += chunk;
  });

  prc.stdout.on('end', function(info) {
    var parsedObject = JSON.parse(data);

    function reduceObject(obj) {
      _.each(obj, function(item, key, list) {
        if (includes.indexOf(key) === -1) {
          delete obj[key];
        }
      })
      _.each(obj['dependencies'], reduceObject);
    }
    reduceObject(parsedObject);
    modules = parseModule(parsedObject);


    // here, send data to remote
    // also, display which tests passed, which failed .. 
    request({
      method: "POST",
      uri: uri,
      json: modules
    }, function(error, response, body) {
      console.log(body);
      if (!error && response.statusCode === 201) {
        console.log('Data posted to remote. \n Get result details, visit: ' + host + 'get/' + body.data._id);
      }
      if (error) console.log('Can not post data to remote. ', error)
    });

  });

  prc.on('close', function(code) {
    console.log('process exit code ' + code);
  });
}
