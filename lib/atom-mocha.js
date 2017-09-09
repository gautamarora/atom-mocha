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
    addFileOrFolderToRuntime: function addFileOrFolderToRuntime(file) {
        var _this3 = this;

        return stat(file).then(function (result) {
            if (result.isDirectory()) {
                return;
            }
            _this3.runtime.addFile(file);
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,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QkFBTzthQUNWO0FBQ0QsbUJBQUssT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUM5QixDQUFDLENBQUM7S0FDTjtBQUNELDBCQUFzQixFQUFBLGdDQUFDLFFBQVEsRUFBQzs7O0FBQzVCLFlBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDdkIsWUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUMxQixZQUFJLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQUk7QUFDN0MsbUJBQUssT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ3hCLENBQUMsQ0FBQztLQUNOO0FBQ0QsY0FBVSxFQUFBLHNCQUFHO0FBQ1gsWUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUMxQixZQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzdCLGVBQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztLQUNyQztBQUNELGFBQVMsRUFBQSxxQkFBRztBQUNWLGVBQU87QUFDTCw4QkFBa0IsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRTtTQUNuRCxDQUFDO0tBQ0g7QUFDRCxVQUFNLEVBQUEsa0JBQUc7QUFDUCxZQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztTQUMvQixNQUFNO0FBQ0wsbUJBQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztTQUMvQjtLQUNGOztDQUVGIiwiZmlsZSI6ImF0b20tbW9jaGEuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0NvbXBvc2l0ZURpc3Bvc2FibGV9IGZyb20gXCJhdG9tXCI7XHJcbmltcG9ydCB7cHJvbWlzaWZ5fSBmcm9tIFwiLi91dGlsc1wiO1xyXG5pbXBvcnQgQXRvbU1vY2hhVmlldyBmcm9tIFwiLi9hdG9tLW1vY2hhLXZpZXdcIjtcclxuaW1wb3J0IE1vY2hhUnVudGltZSBmcm9tIFwiLi9tb2NoYVwiO1xyXG5pbXBvcnQge2NyZWF0ZVN0b3JlfSBmcm9tIFwicmVkdXhcIjtcclxuaW1wb3J0IHJlZHVjZXIgZnJvbSBcIi4vcmVkdWNlcnNcIjtcclxuaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5cclxuY29uc3Qgc3RvcmUgPSBjcmVhdGVTdG9yZShyZWR1Y2VyKTtcclxuXHJcbmNvbnN0IHJlYWRkaXIgPSBwcm9taXNpZnkoZnMucmVhZGRpcik7XHJcbmNvbnN0IHN0YXQgPSBwcm9taXNpZnkoZnMuc3RhdCk7XHJcblxyXG5jb25zdCBmaWxlUmVnZXggPSBcIiouanNcIjtcclxuXHJcbmZ1bmN0aW9uIGNvbXBpbGVyRnJvbUNvbmZpZyhjb25maWcpe1xyXG4gICAgc3dpdGNoKGNvbmZpZyl7XHJcbiAgICAgICAgY2FzZSBcIkVTNSAobm90aGluZylcIjpcclxuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICAgICAgY2FzZSBcIkVTNiAoQmFiZWwgNS44LjM0KVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gXCJiYWJlbC9yZWdpc3RlclwiO1xyXG4gICAgICAgIGNhc2UgXCJDb2ZmZVNjcmlwdCAoY29mZmVlc2NyaXB0IGNvbXBpbGVyIDEuMTAuMClcIjpcclxuICAgICAgICAgICAgcmV0dXJuIFwiY29mZmVlLXNjcmlwdC9yZWdpc3RlclwiO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHJldHVybiBcIlwiO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZUVudmlyb25tZW50VmFyaWFibGVzKHZhcmlhYmxlcyl7XHJcbiAgICBpZighdmFyaWFibGVzKXtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiB2YXJpYWJsZXMuc3BsaXQoXCI7XCIpLnJlZHVjZSgoZW52aXJvbm1lbnRWYXJpYWJsZXMsIGN1cnJlbnRWYXJpYWJsZSkgPT4ge1xyXG4gICAgICAgIHZhciBwYXJ0cyA9IGN1cnJlbnRWYXJpYWJsZS5zcGxpdChcIj1cIikubWFwKCBwYXJ0ID0+IHBhcnQudHJpbSgpKTtcclxuICAgICAgICBlbnZpcm9ubWVudFZhcmlhYmxlc1twYXJ0c1swXV0gPSBwYXJ0c1sxXTtcclxuICAgICAgICByZXR1cm4gZW52aXJvbm1lbnRWYXJpYWJsZXM7XHJcbiAgICB9LCB7fSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzU3JjUGF0aChwYXRoKSB7XHJcbiAgcmV0dXJuIHBhdGguaW5jbHVkZXMoJy9zcmMvJylcclxufVxyXG5cclxuZnVuY3Rpb24gcmVwbGFjZVNyY1BhdGhXaXRoVGVzdFBhdGgocGF0aCkge1xyXG4gIGxldCBuZXdQYXRoID0gcGF0aDtcclxuICBuZXdQYXRoID0gbmV3UGF0aC5yZXBsYWNlKCcvc3JjLycsICcvdGVzdC8nKVxyXG4gIG5ld1BhdGggPSBuZXdQYXRoLnJlcGxhY2UoJy5qcycsICcuc3BlYy5qcycpXHJcbiAgcmV0dXJuIG5ld1BhdGhcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge1xyXG4gIGNvbmZpZyA6IHtcclxuICAgICAgY29tcGlsZXI6IHtcclxuICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgZGVmYXVsdDogXCJFUzYgKEJhYmVsIDUuOC4zNClcIixcclxuICAgICAgICAgIGVudW06IFtcIkVTNSAobm90aGluZylcIiwgXCJFUzYgKEJhYmVsIDUuOC4zNClcIiwgXCJDb2ZmZVNjcmlwdCAoY29mZmVlc2NyaXB0IGNvbXBpbGVyIDEuMTAuMClcIl0sXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbiA6IFwiRGVmaW5lcyB0aGUgY29tcGlsZXIgdG8gYmUgdXNlZCBmb3IgdGhlIHRlc3QgZmlsZXMgYW5kIHRoZSBmaWxlcyByZXF1aXJlZCBpbiB0aGUgdGVzdHNcIlxyXG4gICAgICB9LFxyXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcyA6IHtcclxuICAgICAgICAgIHR5cGUgOiAnc3RyaW5nJyxcclxuICAgICAgICAgIGRlZmF1bHQgOiBcIlwiLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb24gOiBcIkRlZmluZSBhIHNldCBvZiBlbnZpcm1lbnQgdmFyaWFibGVzIGZvciB0aGUgbW9jaGEgcHJvY2Vzcy4gRW52aXJvbWVudCB2YXJpYWJsZXMgc2hvdWxkIGJlIHNwZWNpZmllZCBpbiB0aGUgZm9sbG93aW5nIGZvcm1hdDogVkFSSUFCTEUxX05BTUU9VkFSSUFCTEUxX1ZBTFVFOyBWQVJJQUJMRTJfTkFNRT1WQVJJQUJMRTJfVkFMVUU7XCJcclxuICAgICAgfSxcclxuICAgICAgYWx3YXlzRXhwYW5kVHJlZSA6IHtcclxuICAgICAgICAgIHR5cGUgOiAnYm9vbGVhbicsXHJcbiAgICAgICAgICBkZWZhdWx0IDogZmFsc2UsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbiA6IFwiVGljayBpZiBhbGwgbm9kZXMgaW4gdGhlIHRyZWUgc2hvdWxkIGV4cGFuZCBhZnRlciBhIHRlc3QgaXMgZXhlY3V0ZWQuIFVudGljayBpZiB0cmVlIHNob3VsZCBvbmx5IGV4cGFuZCBmYWlsZWQgdGVzdHNcIlxyXG4gICAgICB9XHJcbiAgfSxcclxuICBhY3RpdmF0ZShzdGF0ZSkge1xyXG4gICAgY29uc3QgdGhhdCA9IHRoaXM7XHJcbiAgICBjb25zdCBsYW5ndWFnZSA9IGF0b20uY29uZmlnLmdldChcImF0b20tbW9jaGEuY29tcGlsZXJcIik7XHJcbiAgICBjb25zdCBlbnZpcm9ubWVudFZhcmlhYmxlcyA9IGF0b20uY29uZmlnLmdldChcImF0b20tbW9jaGEuZW52aXJvbm1lbnRWYXJpYWJsZXNcIik7XHJcbiAgICBjb25zdCBleHBhbmRBbnl3YXkgPSBhdG9tLmNvbmZpZy5nZXQoXCJhdG9tLW1vY2hhLmFsd2F5c0V4cGFuZFRyZWVcIik7XHJcblxyXG4gICAgdGhpcy5ydW50aW1lID0gbmV3IE1vY2hhUnVudGltZShzdG9yZSwge1xyXG4gICAgICAgIGNvbXBpbGVyIDogY29tcGlsZXJGcm9tQ29uZmlnKGxhbmd1YWdlKSxcclxuICAgICAgICBlbnYgOiBwYXJzZUVudmlyb25tZW50VmFyaWFibGVzKGVudmlyb25tZW50VmFyaWFibGVzKSxcclxuICAgICAgICBleHBhbmRBbnl3YXlcclxuICAgIH0pO1xyXG4gICAgdGhpcy5hdG9tTW9jaGFWaWV3ID0gbmV3IEF0b21Nb2NoYVZpZXcoc3RhdGUuYXRvbU1vY2hhVmlld1N0YXRlLCBzdG9yZSwgdGhpcy5ydW50aW1lKTtcclxuICAgIHRoaXMubW9kYWxQYW5lbCA9IGF0b20ud29ya3NwYWNlLmFkZFJpZ2h0UGFuZWwoe1xyXG4gICAgICBpdGVtOiB0aGlzLmF0b21Nb2NoYVZpZXcsXHJcbiAgICAgIHZpc2libGU6IGZhbHNlXHJcbiAgICB9KTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKCk7XHJcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMuYWRkKGF0b20uY29uZmlnLm9ic2VydmUoXCJhdG9tLW1vY2hhXCIsICh2YWx1ZSkgPT4ge1xyXG4gICAgICB0cnl7XHJcbiAgICAgICAgdGhpcy5ydW50aW1lLmNvbXBpbGVyID0gY29tcGlsZXJGcm9tQ29uZmlnKHZhbHVlLmNvbXBpbGVyKTtcclxuICAgICAgICB0aGlzLnJ1bnRpbWUuZW52ID0gcGFyc2VFbnZpcm9ubWVudFZhcmlhYmxlcyh2YWx1ZS5lbnZpcm9ubWVudFZhcmlhYmxlcyk7XHJcbiAgICAgICAgdGhpcy5ydW50aW1lLmV4cGFuZEFueXdheSA9IHZhbHVlLmFsd2F5c0V4cGFuZFRyZWU7XHJcbiAgICAgIH1jYXRjaChlKXt9XHJcbiAgICB9KSk7XHJcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMuYWRkKGF0b20uY29tbWFuZHMuYWRkKCdhdG9tLXdvcmtzcGFjZScsIHtcclxuICAgICAgJ2F0b20tbW9jaGE6dG9nZ2xlJzogKCk9PiB0aGlzLnRvZ2dsZSgpLFxyXG4gICAgICAnYXRvbS1tb2NoYTpyZXJ1blRlc3RzJyA6ICgpPT4gdGhpcy5ydW50aW1lLnN0YXJ0KCksXHJcbiAgICAgICdhdG9tLW1vY2hhOnJ1blRlc3RGaWxlRnJvbUVkaXRvcicgOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVQYW5lSXRlbSA9IGF0b20ud29ya3NwYWNlLmdldEFjdGl2ZVBhbmVJdGVtKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1ZmZlciA9IGFjdGl2ZVBhbmVJdGVtID8gYWN0aXZlUGFuZUl0ZW0uYnVmZmVyIDogbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgZmlsZSA9IGJ1ZmZlciA/IGJ1ZmZlci5maWxlIDogbnVsbDtcclxuICAgICAgICAgICAgbGV0IHBhdGggPSBmaWxlID8gZmlsZS5wYXRoIDogbnVsbDtcclxuICAgICAgICAgICAgaWYoaXNTcmNQYXRoKHBhdGgpKSB7XHJcbiAgICAgICAgICAgICAgcGF0aCA9IHJlcGxhY2VTcmNQYXRoV2l0aFRlc3RQYXRoKHBhdGgpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYocGF0aCl7XHJcbiAgICAgICAgICAgICAgICB0aGF0LnJlc3RhcnRSdW50aW1lV2l0aEZpbGUocGF0aCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9KSk7XHJcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMuYWRkKGF0b20uY29tbWFuZHMuYWRkKCcudHJlZS12aWV3IC5maWxlIC5uYW1lJywge1xyXG4gICAgICAgICdhdG9tLW1vY2hhOnJ1blRlc3RGaWxlJzogZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gdGhpcy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXBhdGhcIik7XHJcbiAgICAgICAgICAgIGlmKGlzU3JjUGF0aChmaWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlcGxhY2VTcmNQYXRoV2l0aFRlc3RQYXRoKGZpbGVQYXRoKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoYXQucmVzdGFydFJ1bnRpbWVXaXRoRmlsZShmaWxlUGF0aCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSkpO1xyXG4gICAgdGhpcy5zdWJzY3JpcHRpb25zLmFkZChhdG9tLmNvbW1hbmRzLmFkZCgnLnRyZWUtdmlldyAuZGlyZWN0b3J5IHNwYW4uaWNvbi1maWxlLWRpcmVjdG9yeScsIHtcclxuICAgICAgICAnYXRvbS1tb2NoYTpydW5UZXN0Rm9sZGVyJyA6IGZ1bmN0aW9uKGUpe1xyXG4gICAgICAgICAgICBjb25zdCBmb2xkZXJQYXRoID0gdGhpcy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXBhdGhcIik7XHJcbiAgICAgICAgICAgIHRoYXQucmVzdGFydFJ1bnRpbWVXaXRoRm9sZGVyKGZvbGRlclBhdGgpO1xyXG4gICAgICAgIH1cclxuICAgIH0pKTtcclxuICB9LFxyXG4gIHJlc3RhcnRSdW50aW1lV2l0aEZvbGRlcihmb2xkZXJQYXRoKXtcclxuICAgICAgdGhpcy5tb2RhbFBhbmVsLnNob3coKTtcclxuICAgICAgdGhpcy5ydW50aW1lLmNsZWFyRmlsZXMoKTtcclxuICAgICAgcmVhZGRpcihmb2xkZXJQYXRoKS50aGVuKChmaWxlcykgPT4ge1xyXG4gICAgICAgICAgUHJvbWlzZS5hbGwoZmlsZXMubWFwKGZpbGUgPT4ge1xyXG4gICAgICAgICAgICAgIGxldCBmaWxlUGF0aCA9cGF0aC5qb2luKGZvbGRlclBhdGgsIGZpbGUpOyBcclxuICAgICAgICAgICAgICBpZihpc1NyY1BhdGgoZmlsZVBhdGgpKSB7XHJcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlcGxhY2VTcmNQYXRoV2l0aFRlc3RQYXRoKGZpbGVQYXRoKVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGRGaWxlT3JGb2xkZXJUb1J1bnRpbWUoZmlsZVBhdGgpO1xyXG4gICAgICAgICAgfSkpLnRoZW4oICgpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnJ1bnRpbWUuc3RhcnQoKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9LFxyXG4gIGFkZEZpbGVPckZvbGRlclRvUnVudGltZShmaWxlKXtcclxuICAgICAgcmV0dXJuIHN0YXQoZmlsZSkudGhlbiggKHJlc3VsdCk9PiB7XHJcbiAgICAgICAgICBpZihyZXN1bHQuaXNEaXJlY3RvcnkoKSl7XHJcbiAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgdGhpcy5ydW50aW1lLmFkZEZpbGUoZmlsZSk7XHJcbiAgICAgIH0pO1xyXG4gIH0sXHJcbiAgcmVzdGFydFJ1bnRpbWVXaXRoRmlsZShmaWxlUGF0aCl7XHJcbiAgICAgIHRoaXMubW9kYWxQYW5lbC5zaG93KCk7XHJcbiAgICAgIHRoaXMucnVudGltZS5jbGVhckZpbGVzKCk7XHJcbiAgICAgIHRoaXMuYWRkRmlsZU9yRm9sZGVyVG9SdW50aW1lKGZpbGVQYXRoKS50aGVuKCgpPT57XHJcbiAgICAgICAgICB0aGlzLnJ1bnRpbWUuc3RhcnQoKTtcclxuICAgICAgfSk7XHJcbiAgfSxcclxuICBkZWFjdGl2YXRlKCkge1xyXG4gICAgdGhpcy5tb2RhbFBhbmVsLmRlc3Ryb3koKTtcclxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5kaXNwb3NlKCk7XHJcbiAgICByZXR1cm4gdGhpcy5hdG9tTW9jaGFWaWV3LmRlc3Ryb3koKTtcclxuICB9LFxyXG4gIHNlcmlhbGl6ZSgpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGF0b21Nb2NoYVZpZXdTdGF0ZTogdGhpcy5hdG9tTW9jaGFWaWV3LnNlcmlhbGl6ZSgpXHJcbiAgICB9O1xyXG4gIH0sXHJcbiAgdG9nZ2xlKCkge1xyXG4gICAgaWYgKHRoaXMubW9kYWxQYW5lbC5pc1Zpc2libGUoKSkge1xyXG4gICAgICByZXR1cm4gdGhpcy5tb2RhbFBhbmVsLmhpZGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiB0aGlzLm1vZGFsUGFuZWwuc2hvdygpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbn07XHJcbiJdfQ==
