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
                if (path) {
                    that.restartRuntimeWithFile(path);
                }
            }
        }));
        this.subscriptions.add(atom.commands.add('.tree-view .file .name', {
            'atom-mocha:runTestFile': function atomMochaRunTestFile() {
                var filePath = this.getAttribute("data-path");
                that.restartRuntimeWithFile(filePath);
            }
        }));
        this.subscriptions.add(atom.commands.add('.tree-view .file .name', {
            'atom-mocha:runTestFile': function atomMochaRunTestFile() {
                var filePath = this.getAttribute("data-path");
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
        // readdir(folderPath).then((files) => {
        //     Promise.all(files.map(file => {
        //         return this.addFileOrFolderToRuntime(path.join(folderPath, file));
        //     })).then( () => {
        //         this.runtime.start();
        //     });
        // });
        this.addFileOrFolderToRuntime(_path2["default"].join(folderPath)).then(function () {
            console.log("starting runtime...");
            _this2.runtime.start();
        });
    },
    addFileOrFolderToRuntime: function addFileOrFolderToRuntime(filePath) {
        var _this3 = this;

        return stat(filePath).then(function (result) {
            if (result.isDirectory()) {
                (function () {
                    var folderPath = filePath;
                    readdir(folderPath).then(function (files) {
                        Promise.all(files.map(function (file) {
                            var filePath = _path2["default"].join(folderPath, file);
                            console.log("adding " + filePath + " in dir");
                            // return this.runtime.addFile(filePath);
                            _this3.addFileOrFolderToRuntime(filePath);
                        }));
                    });
                })();
            } else {
                console.log("adding " + filePath);
                return _this3.runtime.addFile(filePath);
            }
        }).then(function () {
            console.log("now we should start runtime");
            return;
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,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bUJBQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQTtBQUMxQyxtQkFBTztTQUNWLENBQUMsQ0FBQztLQUNOO0FBQ0QsMEJBQXNCLEVBQUEsZ0NBQUMsUUFBUSxFQUFDOzs7QUFDNUIsWUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUN2QixZQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQzFCLFlBQUksQ0FBQyx3QkFBd0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBSTtBQUM3QyxtQkFBSyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDeEIsQ0FBQyxDQUFDO0tBQ047QUFDRCxjQUFVLEVBQUEsc0JBQUc7QUFDWCxZQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzFCLFlBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDN0IsZUFBTyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO0tBQ3JDO0FBQ0QsYUFBUyxFQUFBLHFCQUFHO0FBQ1YsZUFBTztBQUNMLDhCQUFrQixFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFO1NBQ25ELENBQUM7S0FDSDtBQUNELFVBQU0sRUFBQSxrQkFBRztBQUNQLFlBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUUsRUFBRTtBQUMvQixtQkFBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO1NBQy9CLE1BQU07QUFDTCxtQkFBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO1NBQy9CO0tBQ0Y7O0NBRUYiLCJmaWxlIjoiYXRvbS1tb2NoYS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7Q29tcG9zaXRlRGlzcG9zYWJsZX0gZnJvbSBcImF0b21cIjtcclxuaW1wb3J0IHtwcm9taXNpZnl9IGZyb20gXCIuL3V0aWxzXCI7XHJcbmltcG9ydCBBdG9tTW9jaGFWaWV3IGZyb20gXCIuL2F0b20tbW9jaGEtdmlld1wiO1xyXG5pbXBvcnQgTW9jaGFSdW50aW1lIGZyb20gXCIuL21vY2hhXCI7XHJcbmltcG9ydCB7Y3JlYXRlU3RvcmV9IGZyb20gXCJyZWR1eFwiO1xyXG5pbXBvcnQgcmVkdWNlciBmcm9tIFwiLi9yZWR1Y2Vyc1wiO1xyXG5pbXBvcnQgZnMgZnJvbSBcImZzXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcblxyXG5jb25zdCBzdG9yZSA9IGNyZWF0ZVN0b3JlKHJlZHVjZXIpO1xyXG5cclxuY29uc3QgcmVhZGRpciA9IHByb21pc2lmeShmcy5yZWFkZGlyKTtcclxuY29uc3Qgc3RhdCA9IHByb21pc2lmeShmcy5zdGF0KTtcclxuXHJcbmNvbnN0IGZpbGVSZWdleCA9IFwiKi5qc1wiO1xyXG5cclxuZnVuY3Rpb24gY29tcGlsZXJGcm9tQ29uZmlnKGNvbmZpZyl7XHJcbiAgICBzd2l0Y2goY29uZmlnKXtcclxuICAgICAgICBjYXNlIFwiRVM1IChub3RoaW5nKVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgICAgICBjYXNlIFwiRVM2IChCYWJlbCA1LjguMzQpXCI6XHJcbiAgICAgICAgICAgIHJldHVybiBcImJhYmVsL3JlZ2lzdGVyXCI7XHJcbiAgICAgICAgY2FzZSBcIkNvZmZlU2NyaXB0IChjb2ZmZWVzY3JpcHQgY29tcGlsZXIgMS4xMC4wKVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gXCJjb2ZmZWUtc2NyaXB0L3JlZ2lzdGVyXCI7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlRW52aXJvbm1lbnRWYXJpYWJsZXModmFyaWFibGVzKXtcclxuICAgIGlmKCF2YXJpYWJsZXMpe1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHZhcmlhYmxlcy5zcGxpdChcIjtcIikucmVkdWNlKChlbnZpcm9ubWVudFZhcmlhYmxlcywgY3VycmVudFZhcmlhYmxlKSA9PiB7XHJcbiAgICAgICAgdmFyIHBhcnRzID0gY3VycmVudFZhcmlhYmxlLnNwbGl0KFwiPVwiKS5tYXAoIHBhcnQgPT4gcGFydC50cmltKCkpO1xyXG4gICAgICAgIGVudmlyb25tZW50VmFyaWFibGVzW3BhcnRzWzBdXSA9IHBhcnRzWzFdO1xyXG4gICAgICAgIHJldHVybiBlbnZpcm9ubWVudFZhcmlhYmxlcztcclxuICAgIH0sIHt9KTtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge1xyXG4gIGNvbmZpZyA6IHtcclxuICAgICAgY29tcGlsZXI6IHtcclxuICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgZGVmYXVsdDogXCJFUzYgKEJhYmVsIDUuOC4zNClcIixcclxuICAgICAgICAgIGVudW06IFtcIkVTNSAobm90aGluZylcIiwgXCJFUzYgKEJhYmVsIDUuOC4zNClcIiwgXCJDb2ZmZVNjcmlwdCAoY29mZmVlc2NyaXB0IGNvbXBpbGVyIDEuMTAuMClcIl0sXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbiA6IFwiRGVmaW5lcyB0aGUgY29tcGlsZXIgdG8gYmUgdXNlZCBmb3IgdGhlIHRlc3QgZmlsZXMgYW5kIHRoZSBmaWxlcyByZXF1aXJlZCBpbiB0aGUgdGVzdHNcIlxyXG4gICAgICB9LFxyXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcyA6IHtcclxuICAgICAgICAgIHR5cGUgOiAnc3RyaW5nJyxcclxuICAgICAgICAgIGRlZmF1bHQgOiBcIlwiLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb24gOiBcIkRlZmluZSBhIHNldCBvZiBlbnZpcm1lbnQgdmFyaWFibGVzIGZvciB0aGUgbW9jaGEgcHJvY2Vzcy4gRW52aXJvbWVudCB2YXJpYWJsZXMgc2hvdWxkIGJlIHNwZWNpZmllZCBpbiB0aGUgZm9sbG93aW5nIGZvcm1hdDogVkFSSUFCTEUxX05BTUU9VkFSSUFCTEUxX1ZBTFVFOyBWQVJJQUJMRTJfTkFNRT1WQVJJQUJMRTJfVkFMVUU7XCJcclxuICAgICAgfSxcclxuICAgICAgYWx3YXlzRXhwYW5kVHJlZSA6IHtcclxuICAgICAgICAgIHR5cGUgOiAnYm9vbGVhbicsXHJcbiAgICAgICAgICBkZWZhdWx0IDogZmFsc2UsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbiA6IFwiVGljayBpZiBhbGwgbm9kZXMgaW4gdGhlIHRyZWUgc2hvdWxkIGV4cGFuZCBhZnRlciBhIHRlc3QgaXMgZXhlY3V0ZWQuIFVudGljayBpZiB0cmVlIHNob3VsZCBvbmx5IGV4cGFuZCBmYWlsZWQgdGVzdHNcIlxyXG4gICAgICB9XHJcbiAgfSxcclxuICBhY3RpdmF0ZShzdGF0ZSkge1xyXG4gICAgY29uc3QgdGhhdCA9IHRoaXM7XHJcbiAgICBjb25zdCBsYW5ndWFnZSA9IGF0b20uY29uZmlnLmdldChcImF0b20tbW9jaGEuY29tcGlsZXJcIik7XHJcbiAgICBjb25zdCBlbnZpcm9ubWVudFZhcmlhYmxlcyA9IGF0b20uY29uZmlnLmdldChcImF0b20tbW9jaGEuZW52aXJvbm1lbnRWYXJpYWJsZXNcIik7XHJcbiAgICBjb25zdCBleHBhbmRBbnl3YXkgPSBhdG9tLmNvbmZpZy5nZXQoXCJhdG9tLW1vY2hhLmFsd2F5c0V4cGFuZFRyZWVcIik7XHJcblxyXG4gICAgdGhpcy5ydW50aW1lID0gbmV3IE1vY2hhUnVudGltZShzdG9yZSwge1xyXG4gICAgICAgIGNvbXBpbGVyIDogY29tcGlsZXJGcm9tQ29uZmlnKGxhbmd1YWdlKSxcclxuICAgICAgICBlbnYgOiBwYXJzZUVudmlyb25tZW50VmFyaWFibGVzKGVudmlyb25tZW50VmFyaWFibGVzKSxcclxuICAgICAgICBleHBhbmRBbnl3YXlcclxuICAgIH0pO1xyXG4gICAgdGhpcy5hdG9tTW9jaGFWaWV3ID0gbmV3IEF0b21Nb2NoYVZpZXcoc3RhdGUuYXRvbU1vY2hhVmlld1N0YXRlLCBzdG9yZSwgdGhpcy5ydW50aW1lKTtcclxuICAgIHRoaXMubW9kYWxQYW5lbCA9IGF0b20ud29ya3NwYWNlLmFkZFJpZ2h0UGFuZWwoe1xyXG4gICAgICBpdGVtOiB0aGlzLmF0b21Nb2NoYVZpZXcsXHJcbiAgICAgIHZpc2libGU6IGZhbHNlXHJcbiAgICB9KTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKCk7XHJcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMuYWRkKGF0b20uY29uZmlnLm9ic2VydmUoXCJhdG9tLW1vY2hhXCIsICh2YWx1ZSkgPT4ge1xyXG4gICAgICB0cnl7XHJcbiAgICAgICAgdGhpcy5ydW50aW1lLmNvbXBpbGVyID0gY29tcGlsZXJGcm9tQ29uZmlnKHZhbHVlLmNvbXBpbGVyKTtcclxuICAgICAgICB0aGlzLnJ1bnRpbWUuZW52ID0gcGFyc2VFbnZpcm9ubWVudFZhcmlhYmxlcyh2YWx1ZS5lbnZpcm9ubWVudFZhcmlhYmxlcyk7XHJcbiAgICAgICAgdGhpcy5ydW50aW1lLmV4cGFuZEFueXdheSA9IHZhbHVlLmFsd2F5c0V4cGFuZFRyZWU7XHJcbiAgICAgIH1jYXRjaChlKXt9XHJcbiAgICB9KSk7XHJcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMuYWRkKGF0b20uY29tbWFuZHMuYWRkKCdhdG9tLXdvcmtzcGFjZScsIHtcclxuICAgICAgJ2F0b20tbW9jaGE6dG9nZ2xlJzogKCk9PiB0aGlzLnRvZ2dsZSgpLFxyXG4gICAgICAnYXRvbS1tb2NoYTpyZXJ1blRlc3RzJyA6ICgpPT4gdGhpcy5ydW50aW1lLnN0YXJ0KCksXHJcbiAgICAgICdhdG9tLW1vY2hhOnJ1blRlc3RGaWxlRnJvbUVkaXRvcicgOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVQYW5lSXRlbSA9IGF0b20ud29ya3NwYWNlLmdldEFjdGl2ZVBhbmVJdGVtKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1ZmZlciA9IGFjdGl2ZVBhbmVJdGVtID8gYWN0aXZlUGFuZUl0ZW0uYnVmZmVyIDogbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgZmlsZSA9IGJ1ZmZlciA/IGJ1ZmZlci5maWxlIDogbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgcGF0aCA9IGZpbGUgPyBmaWxlLnBhdGggOiBudWxsO1xyXG4gICAgICAgICAgICBpZihwYXRoKXtcclxuICAgICAgICAgICAgICAgIHRoYXQucmVzdGFydFJ1bnRpbWVXaXRoRmlsZShwYXRoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0pKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5hZGQoYXRvbS5jb21tYW5kcy5hZGQoJy50cmVlLXZpZXcgLmZpbGUgLm5hbWUnLCB7XHJcbiAgICAgICAgJ2F0b20tbW9jaGE6cnVuVGVzdEZpbGUnOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHRoaXMuZ2V0QXR0cmlidXRlKFwiZGF0YS1wYXRoXCIpO1xyXG4gICAgICAgICAgICB0aGF0LnJlc3RhcnRSdW50aW1lV2l0aEZpbGUoZmlsZVBhdGgpO1xyXG4gICAgICAgIH1cclxuICAgIH0pKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5hZGQoYXRvbS5jb21tYW5kcy5hZGQoJy50cmVlLXZpZXcgLmZpbGUgLm5hbWUnLCB7XHJcbiAgICAgICAgJ2F0b20tbW9jaGE6cnVuVGVzdEZpbGUnOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHRoaXMuZ2V0QXR0cmlidXRlKFwiZGF0YS1wYXRoXCIpO1xyXG4gICAgICAgICAgICB0aGF0LnJlc3RhcnRSdW50aW1lV2l0aEZpbGUoZmlsZVBhdGgpO1xyXG4gICAgICAgIH1cclxuICAgIH0pKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5hZGQoYXRvbS5jb21tYW5kcy5hZGQoJy50cmVlLXZpZXcgLmRpcmVjdG9yeSBzcGFuLmljb24tZmlsZS1kaXJlY3RvcnknLCB7XHJcbiAgICAgICAgJ2F0b20tbW9jaGE6cnVuVGVzdEZvbGRlcicgOiBmdW5jdGlvbihlKXtcclxuICAgICAgICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IHRoaXMuZ2V0QXR0cmlidXRlKFwiZGF0YS1wYXRoXCIpO1xyXG4gICAgICAgICAgICB0aGF0LnJlc3RhcnRSdW50aW1lV2l0aEZvbGRlcihmb2xkZXJQYXRoKTtcclxuICAgICAgICB9XHJcbiAgICB9KSk7XHJcbiAgfSxcclxuICByZXN0YXJ0UnVudGltZVdpdGhGb2xkZXIoZm9sZGVyUGF0aCl7XHJcbiAgICAgIHRoaXMubW9kYWxQYW5lbC5zaG93KCk7XHJcbiAgICAgIHRoaXMucnVudGltZS5jbGVhckZpbGVzKCk7XHJcbiAgICAgIC8vIHJlYWRkaXIoZm9sZGVyUGF0aCkudGhlbigoZmlsZXMpID0+IHtcclxuICAgICAgLy8gICAgIFByb21pc2UuYWxsKGZpbGVzLm1hcChmaWxlID0+IHtcclxuICAgICAgLy8gICAgICAgICByZXR1cm4gdGhpcy5hZGRGaWxlT3JGb2xkZXJUb1J1bnRpbWUocGF0aC5qb2luKGZvbGRlclBhdGgsIGZpbGUpKTtcclxuICAgICAgLy8gICAgIH0pKS50aGVuKCAoKSA9PiB7XHJcbiAgICAgIC8vICAgICAgICAgdGhpcy5ydW50aW1lLnN0YXJ0KCk7XHJcbiAgICAgIC8vICAgICB9KTtcclxuICAgICAgLy8gfSk7XHJcbiAgICAgIHRoaXMuYWRkRmlsZU9yRm9sZGVyVG9SdW50aW1lKHBhdGguam9pbihmb2xkZXJQYXRoKSlcclxuICAgICAgICAgIC50aGVuKCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJzdGFydGluZyBydW50aW1lLi4uXCIpXHJcbiAgICAgICAgICAgICAgdGhpcy5ydW50aW1lLnN0YXJ0KCk7XHJcbiAgICAgICAgICB9KTtcclxuICB9LFxyXG4gIGFkZEZpbGVPckZvbGRlclRvUnVudGltZShmaWxlUGF0aCl7XHJcbiAgICAgIHJldHVybiBzdGF0KGZpbGVQYXRoKS50aGVuKCAocmVzdWx0KT0+IHtcclxuICAgICAgICAgIGlmKHJlc3VsdC5pc0RpcmVjdG9yeSgpKXtcclxuICAgICAgICAgICAgICBsZXQgZm9sZGVyUGF0aCA9IGZpbGVQYXRoO1xyXG4gICAgICAgICAgICAgIHJlYWRkaXIoZm9sZGVyUGF0aCkudGhlbigoZmlsZXMpID0+IHtcclxuICAgICAgICAgICAgICAgICAgUHJvbWlzZS5hbGwoZmlsZXMubWFwKGZpbGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gcGF0aC5qb2luKGZvbGRlclBhdGgsIGZpbGUpOyBcclxuICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBhZGRpbmcgJHtmaWxlUGF0aH0gaW4gZGlyYClcclxuICAgICAgICAgICAgICAgICAgICAgIC8vIHJldHVybiB0aGlzLnJ1bnRpbWUuYWRkRmlsZShmaWxlUGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEZpbGVPckZvbGRlclRvUnVudGltZShmaWxlUGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgIH0pKTtcclxuICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYGFkZGluZyAke2ZpbGVQYXRofWApXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJ1bnRpbWUuYWRkRmlsZShmaWxlUGF0aCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKCAoKSA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhcIm5vdyB3ZSBzaG91bGQgc3RhcnQgcnVudGltZVwiKVxyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9KTtcclxuICB9LFxyXG4gIHJlc3RhcnRSdW50aW1lV2l0aEZpbGUoZmlsZVBhdGgpe1xyXG4gICAgICB0aGlzLm1vZGFsUGFuZWwuc2hvdygpO1xyXG4gICAgICB0aGlzLnJ1bnRpbWUuY2xlYXJGaWxlcygpO1xyXG4gICAgICB0aGlzLmFkZEZpbGVPckZvbGRlclRvUnVudGltZShmaWxlUGF0aCkudGhlbigoKT0+e1xyXG4gICAgICAgICAgdGhpcy5ydW50aW1lLnN0YXJ0KCk7XHJcbiAgICAgIH0pO1xyXG4gIH0sXHJcbiAgZGVhY3RpdmF0ZSgpIHtcclxuICAgIHRoaXMubW9kYWxQYW5lbC5kZXN0cm95KCk7XHJcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGlzcG9zZSgpO1xyXG4gICAgcmV0dXJuIHRoaXMuYXRvbU1vY2hhVmlldy5kZXN0cm95KCk7XHJcbiAgfSxcclxuICBzZXJpYWxpemUoKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBhdG9tTW9jaGFWaWV3U3RhdGU6IHRoaXMuYXRvbU1vY2hhVmlldy5zZXJpYWxpemUoKVxyXG4gICAgfTtcclxuICB9LFxyXG4gIHRvZ2dsZSgpIHtcclxuICAgIGlmICh0aGlzLm1vZGFsUGFuZWwuaXNWaXNpYmxlKCkpIHtcclxuICAgICAgcmV0dXJuIHRoaXMubW9kYWxQYW5lbC5oaWRlKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gdGhpcy5tb2RhbFBhbmVsLnNob3coKTtcclxuICAgIH1cclxuICB9XHJcblxyXG59O1xyXG4iXX0=
