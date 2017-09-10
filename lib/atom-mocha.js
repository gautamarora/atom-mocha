"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var _atom = require("atom");

var _utils = require("./utils");

var _atomMochaView = require("./atom-mocha-view");

var _atomMochaView2 = _interopRequireDefault(_atomMochaView);

var _mocha = require("./mocha");

var _mocha2 = _interopRequireDefault(_mocha);

var _redux = require("redux");

var _reducers = require("./reducers");

var _reducers2 = _interopRequireDefault(_reducers);

var _fs = require("fs");

var _fs2 = _interopRequireDefault(_fs);

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var store = (0, _redux.createStore)(_reducers2["default"]);

var readdir = (0, _utils.promisify)(_fs2["default"].readdir);
var stat = (0, _utils.promisify)(_fs2["default"].stat);

var fileRegex = "*.js";

function compilerFromConfig(config) {
    switch (config) {
        case "ES5 (nothing)":
            return "";
        case "ES6 (Babel 5.8.34)":
            return "babel/register";
        case "CoffeScript (coffeescript compiler 1.10.0)":
            return "coffee-script/register";
        default:
            return "";
    }
}

function parseEnvironmentVariables(variables) {
    if (!variables) {
        return null;
    }
    return variables.split(";").reduce(function (environmentVariables, currentVariable) {
        var parts = currentVariable.split("=").map(function (part) {
            return part.trim();
        });
        environmentVariables[parts[0]] = parts[1];
        return environmentVariables;
    }, {});
}

function isSrcPath(path) {
    return path.includes('/src/');
}

function replaceSrcPathWithTestPath(path) {
    var newPath = path;
    newPath = newPath.replace('/src/', '/test/');
    newPath = newPath.replace('.js', '.spec.js');
    return newPath;
}

exports["default"] = {
    config: {
        compiler: {
            type: 'string',
            "default": "ES6 (Babel 5.8.34)",
            "enum": ["ES5 (nothing)", "ES6 (Babel 5.8.34)", "CoffeScript (coffeescript compiler 1.10.0)"],
            description: "Defines the compiler to be used for the test files and the files required in the tests"
        },
        environmentVariables: {
            type: 'string',
            "default": "",
            description: "Define a set of envirment variables for the mocha process. Enviroment variables should be specified in the following format: VARIABLE1_NAME=VARIABLE1_VALUE; VARIABLE2_NAME=VARIABLE2_VALUE;"
        },
        alwaysExpandTree: {
            type: 'boolean',
            "default": false,
            description: "Tick if all nodes in the tree should expand after a test is executed. Untick if tree should only expand failed tests"
        }
    },
    activate: function activate(state) {
        var _this = this;

        var that = this;
        var language = atom.config.get("atom-mocha.compiler");
        var environmentVariables = atom.config.get("atom-mocha.environmentVariables");
        var expandAnyway = atom.config.get("atom-mocha.alwaysExpandTree");

        this.runtime = new _mocha2["default"](store, {
            compiler: compilerFromConfig(language),
            env: parseEnvironmentVariables(environmentVariables),
            expandAnyway: expandAnyway
        });
        this.atomMochaView = new _atomMochaView2["default"](state.atomMochaViewState, store, this.runtime);
        this.modalPanel = atom.workspace.addRightPanel({
            item: this.atomMochaView,
            visible: false
        });
        this.subscriptions = new _atom.CompositeDisposable();
        this.subscriptions.add(atom.config.observe("atom-mocha", function (value) {
            try {
                _this.runtime.compiler = compilerFromConfig(value.compiler);
                _this.runtime.env = parseEnvironmentVariables(value.environmentVariables);
                _this.runtime.expandAnyway = value.alwaysExpandTree;
            } catch (e) {}
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'atom-mocha:toggle': function atomMochaToggle() {
                return _this.toggle();
            },
            'atom-mocha:rerunTests': function atomMochaRerunTests() {
                return _this.runtime.start();
            },
            'atom-mocha:runTestFileFromEditor': function atomMochaRunTestFileFromEditor() {
                var activePaneItem = atom.workspace.getActivePaneItem();
                var buffer = activePaneItem ? activePaneItem.buffer : null;
                var file = buffer ? buffer.file : null;
                var path = file ? file.path : null;
                if (isSrcPath(path)) {
                    path = replaceSrcPathWithTestPath(path);
                }
                if (path) {
                    that.restartRuntimeWithFile(path);
                }
            }
        }));
        this.subscriptions.add(atom.commands.add('.tree-view .file .name', {
            'atom-mocha:runTestFile': function atomMochaRunTestFile() {
                var filePath = this.getAttribute("data-path");
                if (isSrcPath(filePath)) {
                    filePath = replaceSrcPathWithTestPath(filePath);
                }
                that.restartRuntimeWithFile(filePath);
            }
        }));
        this.subscriptions.add(atom.commands.add('.tree-view .directory span.icon-file-directory', {
            'atom-mocha:runTestFolder': function atomMochaRunTestFolder(e) {
                var folderPath = this.getAttribute("data-path");
                that.restartRuntimeWithFolder(folderPath);
            }
        }));
    },
    restartRuntimeWithFolder: function restartRuntimeWithFolder(folderPath) {
        var _this2 = this;

        this.modalPanel.show();
        this.runtime.clearFiles();
        readdir(folderPath).then(function (files) {
            Promise.all(files.map(function (file) {
                var filePath = _path2["default"].join(folderPath, file);
                if (isSrcPath(filePath)) {
                    filePath = replaceSrcPathWithTestPath(filePath);
                }
                return _this2.addFileOrFolderToRuntime(filePath);
            })).then(function () {
                _this2.runtime.start();
            });
        });
    },
    addFileOrFolderToRuntime: function addFileOrFolderToRuntime(_file) {
        var _this3 = this;

        return stat(_file).then(function (result) {
            if (result.isDirectory()) {
                var _ret = (function () {
                    var folderPath = _file;
                    return {
                        v: readdir(folderPath).then(function (files) {
                            Promise.all(files.map(function (file) {
                                var filePath = _path2["default"].join(folderPath, file);
                                if (isSrcPath(filePath)) {
                                    filePath = replaceSrcPathWithTestPath(filePath);
                                }
                                console.log("adding a nested file", filePath);
                                return _this3.runtime.addFile(filePath);
                                // return this.addFileOrFolderToRuntime(filePath);
                            }));
                        })
                    };
                })();

                if (typeof _ret === "object") return _ret.v;
            } else {
                    _this3.runtime.addFile(_file);
                }
        });
    },
    restartRuntimeWithFile: function restartRuntimeWithFile(filePath) {
        var _this4 = this;

        this.modalPanel.show();
        this.runtime.clearFiles();
        this.addFileOrFolderToRuntime(filePath).then(function () {
            _this4.runtime.start();
        });
    },
    deactivate: function deactivate() {
        this.modalPanel.destroy();
        this.subscriptions.dispose();
        return this.atomMochaView.destroy();
    },
    serialize: function serialize() {
        return {
            atomMochaViewState: this.atomMochaView.serialize()
        };
    },
    toggle: function toggle() {
        if (this.modalPanel.isVisible()) {
            return this.modalPanel.hide();
        } else {
            return this.modalPanel.show();
        }
    }

};
module.exports = exports["default"];
//# sourceMappingURL=data:application/json;charset=utf8;base64,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QU8sRUFBRSxDQUFDO0tBQ3JDO0FBQ0QsYUFBUyxFQUFBLHFCQUFHO0FBQ1YsZUFBTztBQUNMLDhCQUFrQixFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFO1NBQ25ELENBQUM7S0FDSDtBQUNELFVBQU0sRUFBQSxrQkFBRztBQUNQLFlBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUUsRUFBRTtBQUMvQixtQkFBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO1NBQy9CLE1BQU07QUFDTCxtQkFBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO1NBQy9CO0tBQ0Y7O0NBRUYiLCJmaWxlIjoiYXRvbS1tb2NoYS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7Q29tcG9zaXRlRGlzcG9zYWJsZX0gZnJvbSBcImF0b21cIjtcclxuaW1wb3J0IHtwcm9taXNpZnl9IGZyb20gXCIuL3V0aWxzXCI7XHJcbmltcG9ydCBBdG9tTW9jaGFWaWV3IGZyb20gXCIuL2F0b20tbW9jaGEtdmlld1wiO1xyXG5pbXBvcnQgTW9jaGFSdW50aW1lIGZyb20gXCIuL21vY2hhXCI7XHJcbmltcG9ydCB7Y3JlYXRlU3RvcmV9IGZyb20gXCJyZWR1eFwiO1xyXG5pbXBvcnQgcmVkdWNlciBmcm9tIFwiLi9yZWR1Y2Vyc1wiO1xyXG5pbXBvcnQgZnMgZnJvbSBcImZzXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcblxyXG5jb25zdCBzdG9yZSA9IGNyZWF0ZVN0b3JlKHJlZHVjZXIpO1xyXG5cclxuY29uc3QgcmVhZGRpciA9IHByb21pc2lmeShmcy5yZWFkZGlyKTtcclxuY29uc3Qgc3RhdCA9IHByb21pc2lmeShmcy5zdGF0KTtcclxuXHJcbmNvbnN0IGZpbGVSZWdleCA9IFwiKi5qc1wiO1xyXG5cclxuZnVuY3Rpb24gY29tcGlsZXJGcm9tQ29uZmlnKGNvbmZpZyl7XHJcbiAgICBzd2l0Y2goY29uZmlnKXtcclxuICAgICAgICBjYXNlIFwiRVM1IChub3RoaW5nKVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgICAgICBjYXNlIFwiRVM2IChCYWJlbCA1LjguMzQpXCI6XHJcbiAgICAgICAgICAgIHJldHVybiBcImJhYmVsL3JlZ2lzdGVyXCI7XHJcbiAgICAgICAgY2FzZSBcIkNvZmZlU2NyaXB0IChjb2ZmZWVzY3JpcHQgY29tcGlsZXIgMS4xMC4wKVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gXCJjb2ZmZWUtc2NyaXB0L3JlZ2lzdGVyXCI7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlRW52aXJvbm1lbnRWYXJpYWJsZXModmFyaWFibGVzKXtcclxuICAgIGlmKCF2YXJpYWJsZXMpe1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHZhcmlhYmxlcy5zcGxpdChcIjtcIikucmVkdWNlKChlbnZpcm9ubWVudFZhcmlhYmxlcywgY3VycmVudFZhcmlhYmxlKSA9PiB7XHJcbiAgICAgICAgdmFyIHBhcnRzID0gY3VycmVudFZhcmlhYmxlLnNwbGl0KFwiPVwiKS5tYXAoIHBhcnQgPT4gcGFydC50cmltKCkpO1xyXG4gICAgICAgIGVudmlyb25tZW50VmFyaWFibGVzW3BhcnRzWzBdXSA9IHBhcnRzWzFdO1xyXG4gICAgICAgIHJldHVybiBlbnZpcm9ubWVudFZhcmlhYmxlcztcclxuICAgIH0sIHt9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTcmNQYXRoKHBhdGgpIHtcclxuICByZXR1cm4gcGF0aC5pbmNsdWRlcygnL3NyYy8nKVxyXG59XHJcblxyXG5mdW5jdGlvbiByZXBsYWNlU3JjUGF0aFdpdGhUZXN0UGF0aChwYXRoKSB7XHJcbiAgbGV0IG5ld1BhdGggPSBwYXRoO1xyXG4gIG5ld1BhdGggPSBuZXdQYXRoLnJlcGxhY2UoJy9zcmMvJywgJy90ZXN0LycpXHJcbiAgbmV3UGF0aCA9IG5ld1BhdGgucmVwbGFjZSgnLmpzJywgJy5zcGVjLmpzJylcclxuICByZXR1cm4gbmV3UGF0aFxyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgY29uZmlnIDoge1xyXG4gICAgICBjb21waWxlcjoge1xyXG4gICAgICAgICAgdHlwZTogJ3N0cmluZycsXHJcbiAgICAgICAgICBkZWZhdWx0OiBcIkVTNiAoQmFiZWwgNS44LjM0KVwiLFxyXG4gICAgICAgICAgZW51bTogW1wiRVM1IChub3RoaW5nKVwiLCBcIkVTNiAoQmFiZWwgNS44LjM0KVwiLCBcIkNvZmZlU2NyaXB0IChjb2ZmZWVzY3JpcHQgY29tcGlsZXIgMS4xMC4wKVwiXSxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uIDogXCJEZWZpbmVzIHRoZSBjb21waWxlciB0byBiZSB1c2VkIGZvciB0aGUgdGVzdCBmaWxlcyBhbmQgdGhlIGZpbGVzIHJlcXVpcmVkIGluIHRoZSB0ZXN0c1wiXHJcbiAgICAgIH0sXHJcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzIDoge1xyXG4gICAgICAgICAgdHlwZSA6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgZGVmYXVsdCA6IFwiXCIsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbiA6IFwiRGVmaW5lIGEgc2V0IG9mIGVudmlybWVudCB2YXJpYWJsZXMgZm9yIHRoZSBtb2NoYSBwcm9jZXNzLiBFbnZpcm9tZW50IHZhcmlhYmxlcyBzaG91bGQgYmUgc3BlY2lmaWVkIGluIHRoZSBmb2xsb3dpbmcgZm9ybWF0OiBWQVJJQUJMRTFfTkFNRT1WQVJJQUJMRTFfVkFMVUU7IFZBUklBQkxFMl9OQU1FPVZBUklBQkxFMl9WQUxVRTtcIlxyXG4gICAgICB9LFxyXG4gICAgICBhbHdheXNFeHBhbmRUcmVlIDoge1xyXG4gICAgICAgICAgdHlwZSA6ICdib29sZWFuJyxcclxuICAgICAgICAgIGRlZmF1bHQgOiBmYWxzZSxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uIDogXCJUaWNrIGlmIGFsbCBub2RlcyBpbiB0aGUgdHJlZSBzaG91bGQgZXhwYW5kIGFmdGVyIGEgdGVzdCBpcyBleGVjdXRlZC4gVW50aWNrIGlmIHRyZWUgc2hvdWxkIG9ubHkgZXhwYW5kIGZhaWxlZCB0ZXN0c1wiXHJcbiAgICAgIH1cclxuICB9LFxyXG4gIGFjdGl2YXRlKHN0YXRlKSB7XHJcbiAgICBjb25zdCB0aGF0ID0gdGhpcztcclxuICAgIGNvbnN0IGxhbmd1YWdlID0gYXRvbS5jb25maWcuZ2V0KFwiYXRvbS1tb2NoYS5jb21waWxlclwiKTtcclxuICAgIGNvbnN0IGVudmlyb25tZW50VmFyaWFibGVzID0gYXRvbS5jb25maWcuZ2V0KFwiYXRvbS1tb2NoYS5lbnZpcm9ubWVudFZhcmlhYmxlc1wiKTtcclxuICAgIGNvbnN0IGV4cGFuZEFueXdheSA9IGF0b20uY29uZmlnLmdldChcImF0b20tbW9jaGEuYWx3YXlzRXhwYW5kVHJlZVwiKTtcclxuXHJcbiAgICB0aGlzLnJ1bnRpbWUgPSBuZXcgTW9jaGFSdW50aW1lKHN0b3JlLCB7XHJcbiAgICAgICAgY29tcGlsZXIgOiBjb21waWxlckZyb21Db25maWcobGFuZ3VhZ2UpLFxyXG4gICAgICAgIGVudiA6IHBhcnNlRW52aXJvbm1lbnRWYXJpYWJsZXMoZW52aXJvbm1lbnRWYXJpYWJsZXMpLFxyXG4gICAgICAgIGV4cGFuZEFueXdheVxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmF0b21Nb2NoYVZpZXcgPSBuZXcgQXRvbU1vY2hhVmlldyhzdGF0ZS5hdG9tTW9jaGFWaWV3U3RhdGUsIHN0b3JlLCB0aGlzLnJ1bnRpbWUpO1xyXG4gICAgdGhpcy5tb2RhbFBhbmVsID0gYXRvbS53b3Jrc3BhY2UuYWRkUmlnaHRQYW5lbCh7XHJcbiAgICAgIGl0ZW06IHRoaXMuYXRvbU1vY2hhVmlldyxcclxuICAgICAgdmlzaWJsZTogZmFsc2VcclxuICAgIH0pO1xyXG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5hZGQoYXRvbS5jb25maWcub2JzZXJ2ZShcImF0b20tbW9jaGFcIiwgKHZhbHVlKSA9PiB7XHJcbiAgICAgIHRyeXtcclxuICAgICAgICB0aGlzLnJ1bnRpbWUuY29tcGlsZXIgPSBjb21waWxlckZyb21Db25maWcodmFsdWUuY29tcGlsZXIpO1xyXG4gICAgICAgIHRoaXMucnVudGltZS5lbnYgPSBwYXJzZUVudmlyb25tZW50VmFyaWFibGVzKHZhbHVlLmVudmlyb25tZW50VmFyaWFibGVzKTtcclxuICAgICAgICB0aGlzLnJ1bnRpbWUuZXhwYW5kQW55d2F5ID0gdmFsdWUuYWx3YXlzRXhwYW5kVHJlZTtcclxuICAgICAgfWNhdGNoKGUpe31cclxuICAgIH0pKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5hZGQoYXRvbS5jb21tYW5kcy5hZGQoJ2F0b20td29ya3NwYWNlJywge1xyXG4gICAgICAnYXRvbS1tb2NoYTp0b2dnbGUnOiAoKT0+IHRoaXMudG9nZ2xlKCksXHJcbiAgICAgICdhdG9tLW1vY2hhOnJlcnVuVGVzdHMnIDogKCk9PiB0aGlzLnJ1bnRpbWUuc3RhcnQoKSxcclxuICAgICAgJ2F0b20tbW9jaGE6cnVuVGVzdEZpbGVGcm9tRWRpdG9yJyA6IGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVBhbmVJdGVtID0gYXRvbS53b3Jrc3BhY2UuZ2V0QWN0aXZlUGFuZUl0ZW0oKTtcclxuICAgICAgICAgICAgY29uc3QgYnVmZmVyID0gYWN0aXZlUGFuZUl0ZW0gPyBhY3RpdmVQYW5lSXRlbS5idWZmZXIgOiBudWxsO1xyXG4gICAgICAgICAgICBjb25zdCBmaWxlID0gYnVmZmVyID8gYnVmZmVyLmZpbGUgOiBudWxsO1xyXG4gICAgICAgICAgICBsZXQgcGF0aCA9IGZpbGUgPyBmaWxlLnBhdGggOiBudWxsO1xyXG4gICAgICAgICAgICBpZihpc1NyY1BhdGgocGF0aCkpIHtcclxuICAgICAgICAgICAgICBwYXRoID0gcmVwbGFjZVNyY1BhdGhXaXRoVGVzdFBhdGgocGF0aClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihwYXRoKXtcclxuICAgICAgICAgICAgICAgIHRoYXQucmVzdGFydFJ1bnRpbWVXaXRoRmlsZShwYXRoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0pKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5hZGQoYXRvbS5jb21tYW5kcy5hZGQoJy50cmVlLXZpZXcgLmZpbGUgLm5hbWUnLCB7XHJcbiAgICAgICAgJ2F0b20tbW9jaGE6cnVuVGVzdEZpbGUnOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSB0aGlzLmdldEF0dHJpYnV0ZShcImRhdGEtcGF0aFwiKTtcclxuICAgICAgICAgICAgaWYoaXNTcmNQYXRoKGZpbGVQYXRoKSkge1xyXG4gICAgICAgICAgICAgIGZpbGVQYXRoID0gcmVwbGFjZVNyY1BhdGhXaXRoVGVzdFBhdGgoZmlsZVBhdGgpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhhdC5yZXN0YXJ0UnVudGltZVdpdGhGaWxlKGZpbGVQYXRoKTtcclxuICAgICAgICB9XHJcbiAgICB9KSk7XHJcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMuYWRkKGF0b20uY29tbWFuZHMuYWRkKCcudHJlZS12aWV3IC5kaXJlY3Rvcnkgc3Bhbi5pY29uLWZpbGUtZGlyZWN0b3J5Jywge1xyXG4gICAgICAgICdhdG9tLW1vY2hhOnJ1blRlc3RGb2xkZXInIDogZnVuY3Rpb24oZSl7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSB0aGlzLmdldEF0dHJpYnV0ZShcImRhdGEtcGF0aFwiKTtcclxuICAgICAgICAgICAgdGhhdC5yZXN0YXJ0UnVudGltZVdpdGhGb2xkZXIoZm9sZGVyUGF0aCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSkpO1xyXG4gIH0sXHJcbiAgcmVzdGFydFJ1bnRpbWVXaXRoRm9sZGVyKGZvbGRlclBhdGgpe1xyXG4gICAgICB0aGlzLm1vZGFsUGFuZWwuc2hvdygpO1xyXG4gICAgICB0aGlzLnJ1bnRpbWUuY2xlYXJGaWxlcygpO1xyXG4gICAgICByZWFkZGlyKGZvbGRlclBhdGgpLnRoZW4oKGZpbGVzKSA9PiB7XHJcbiAgICAgICAgICBQcm9taXNlLmFsbChmaWxlcy5tYXAoZmlsZSA9PiB7XHJcbiAgICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gcGF0aC5qb2luKGZvbGRlclBhdGgsIGZpbGUpOyBcclxuICAgICAgICAgICAgICBpZihpc1NyY1BhdGgoZmlsZVBhdGgpKSB7XHJcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlcGxhY2VTcmNQYXRoV2l0aFRlc3RQYXRoKGZpbGVQYXRoKVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGRGaWxlT3JGb2xkZXJUb1J1bnRpbWUoZmlsZVBhdGgpO1xyXG4gICAgICAgICAgfSkpLnRoZW4oICgpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnJ1bnRpbWUuc3RhcnQoKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9LFxyXG4gIGFkZEZpbGVPckZvbGRlclRvUnVudGltZShfZmlsZSl7XHJcbiAgICAgIHJldHVybiBzdGF0KF9maWxlKS50aGVuKCAocmVzdWx0KT0+IHtcclxuICAgICAgICAgIGlmKHJlc3VsdC5pc0RpcmVjdG9yeSgpKXtcclxuICAgICAgICAgICAgICBsZXQgZm9sZGVyUGF0aCA9IF9maWxlXHJcbiAgICAgICAgICAgICAgcmV0dXJuIHJlYWRkaXIoZm9sZGVyUGF0aCkudGhlbigoZmlsZXMpID0+IHtcclxuICAgICAgICAgICAgICAgICAgUHJvbWlzZS5hbGwoZmlsZXMubWFwKGZpbGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gcGF0aC5qb2luKGZvbGRlclBhdGgsIGZpbGUpOyBcclxuICAgICAgICAgICAgICAgICAgICAgIGlmKGlzU3JjUGF0aChmaWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXBsYWNlU3JjUGF0aFdpdGhUZXN0UGF0aChmaWxlUGF0aClcclxuICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiYWRkaW5nIGEgbmVzdGVkIGZpbGVcIiwgZmlsZVBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucnVudGltZS5hZGRGaWxlKGZpbGVQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgIC8vIHJldHVybiB0aGlzLmFkZEZpbGVPckZvbGRlclRvUnVudGltZShmaWxlUGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgIH0pKVxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnJ1bnRpbWUuYWRkRmlsZShfZmlsZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gIH0sXHJcbiAgcmVzdGFydFJ1bnRpbWVXaXRoRmlsZShmaWxlUGF0aCl7XHJcbiAgICAgIHRoaXMubW9kYWxQYW5lbC5zaG93KCk7XHJcbiAgICAgIHRoaXMucnVudGltZS5jbGVhckZpbGVzKCk7XHJcbiAgICAgIHRoaXMuYWRkRmlsZU9yRm9sZGVyVG9SdW50aW1lKGZpbGVQYXRoKS50aGVuKCgpPT57XHJcbiAgICAgICAgICB0aGlzLnJ1bnRpbWUuc3RhcnQoKTtcclxuICAgICAgfSk7XHJcbiAgfSxcclxuICBkZWFjdGl2YXRlKCkge1xyXG4gICAgdGhpcy5tb2RhbFBhbmVsLmRlc3Ryb3koKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kaXNwb3NlKCk7XHJcbiAgICByZXR1cm4gdGhpcy5hdG9tTW9jaGFWaWV3LmRlc3Ryb3koKTtcclxuICB9LFxyXG4gIHNlcmlhbGl6ZSgpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGF0b21Nb2NoYVZpZXdTdGF0ZTogdGhpcy5hdG9tTW9jaGFWaWV3LnNlcmlhbGl6ZSgpXHJcbiAgICB9O1xyXG4gIH0sXHJcbiAgdG9nZ2xlKCkge1xyXG4gICAgaWYgKHRoaXMubW9kYWxQYW5lbC5pc1Zpc2libGUoKSkge1xyXG4gICAgICByZXR1cm4gdGhpcy5tb2RhbFBhbmVsLmhpZGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiB0aGlzLm1vZGFsUGFuZWwuc2hvdygpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbn07XHJcbiJdfQ==
