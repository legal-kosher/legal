var fs = require('fs');
var _ = require('underscore');
var spawn = require('child_process').spawn;
var prc = spawn('npm', ['ls', '--json', '--long']);
var data = '';
var includes = ["name", "version", "licenses", "license", "dependencies"];
var modules;

var path = require('path');
var appDir = path.dirname(require.main.filename);

var parseModule = function(data) {

  var modules = data.dependencies;

  var rules = {
    "MIT": true,
    "GPL": false
  };

  var Node = function(value, parent) {
    this.value = value;
    this.parent = parent;
  };

  // If data.licenses and a license fails the test, mark warning
  var markNodeSafety = function(data) {
    if (data.licenses) {
      var passes = true;
      for (var i = 0; i < data.licenses.length; i++) {
        if (rules[data.licenses[i]] === false) {
          passes = false;
          break;
        } else if (!rules[data.licenses[i]] || rules[data.licenses[i]] !== true) {
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
    var currentParent = parent;
    if (data.passes !== true) {
      while (currentParent) {
        if (data.passes === false) {
          parent.passes = false;
        } else if (data.passes === "warn" && parent.value && parent.passes !== false) {
          parent.passes = "warn";
        }
        currentParent = parent.parent;
      }
    } else if (!parent.passes) {
      parent.passes = true;
    }
  };

  var makeNode = function(name, data, parent) {
    // Modify data object
    data.name = name;
    var dependencies = data.dependencies;
    data.dependencies = [];

    // Create child node for each dependency that points to data object as parent
    Object.keys(dependencies).forEach(function(depName) {
      makeNode(depName, dependencies[depName], data);
    });

    // Determine data object safety
    markNodeSafety(data);

    if (parent) {
      markParentNode(parent, data);
      // Create data node from data object and push to parent dependencies
      var node = new Node(data, parent);
      parent.dependencies.push(node);
    }
  }

  // Begin parsing data
  Object.keys(modules).forEach(function(modKey) {
    makeNode(modKey, modules[modKey], null);
    // console.log(util.inspect(modules, {depth: null}));
  });

  return modules;

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

    console.log(modules);
    console.log(appDir);


  });

  prc.on('close', function(code) {
    console.log('process exit code ' + code);
  });
}