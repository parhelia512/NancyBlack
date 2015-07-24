﻿(function () {

    if (!window.location.origin) {
        window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
    }

    var mobileService = WindowsAzure.MobileServiceClient;
    var path = window.location.origin;
    var emittedEvents = {
        refreshed: "refreshed",
        updated: "updated",
        inserted: "inserted",
        deleted: "deleted"
    };

    if (window.databasepath) {
        path = path + "/" + window.databasepath;

    } else {

        if (window.location.pathname.indexOf("/SuperAdmin") == 0) {
            path = path + "/system";
        }
    }

    var client = new mobileService(
                    path,
                    '-');

    var ncb = angular.module("ncb-datacontext", []);

    var dataContext = function link($scope, element, attrs) {

        if (attrs.table == null) {

            throw "DataContext requries table attribute"
        }

        var $me = this;

        $scope.emittedEvents = emittedEvents;

        $scope.data = {};

        if ($scope.object == undefined) {
            $scope.object = null;
        } else {

            $scope.originalObject = JSON.parse(JSON.stringify($scope.object));
        }

        $scope.isBusy = false;
        $scope.alerts = [];
        $scope.list = [];
        $scope.timestamp = (new Date()).getTime();
        $scope.table = client.getTable(attrs.table);
        $scope.paging = {

            page: 1,
            size: 10,
            total: 20,
        };

        //#region Shared Function

        $me.handleError = function (err) {

            $scope.$apply(function () {

                var detail;
                try {
                    detail = JSON.parse(err.request.response);
                    detail.type = "danger";
                    detail.msg = detail.Message;
                } catch (e) {

                    detail = {
                        type: 'danger',
                        msg: err
                    };
                }

                $scope.alerts.push(detail);

                $scope.isBusy = false;
            });
        };

        //#endregion

        $me.processServerObject = function (item) {

            if (item.Id != null) {

                item.id = item.Id;
                delete item.Id;
            }

            return item;
        };

        $scope.data.refresh = function () {

            var source = $scope.table;
            source = source.orderByDescending("Id")

            if ($scope.paging.page > 0) {

                source = source.skip(($scope.paging.page - 1) * $scope.paging.size);
            }

            if ($scope.paging.size > 0) {

                source = source.take($scope.paging.size);
            }

            source.read().done(function (results) {

                $scope.$apply(function () {

                    $scope.isBusy = false;

                    $scope.list = results;
                    $scope.list.forEach($me.processServerObject);

                    if (results.length < $scope.paging.size) {

                        $scope.paging.total = $scope.paging.page * $scope.paging.size;

                    } else {

                        $scope.paging.total = ($scope.paging.page * $scope.paging.size) + 1;
                    }

                    $scope.$emit(emittedEvents.refreshed, { sender: $scope, args: results });
                });

            }, $me.handleError);

        };

        // reload is 
        $scope.data.reload = function () {

            throw "Reload is not available unless model is specified";
        };

        // Insert is, unlike save, always create new object in the backend
        $scope.data.insert = function (object, callback) {

            delete object.id;
            delete object.Id;

            $scope.data.save(object, function () {

                // clears the object after inserted
                for (var k in object) {
                    object[k] = null;
                }

                if (callback != null) {

                    callback();
                }

            });

        };

        $scope.data.save = function (object, callback) {

            if (object == null) {

                throw "object cannot be null";
            }

            // create a copy of object to save
            var toSave = JSON.parse(JSON.stringify(object));

            $scope.isBusy = true;
            $scope.timestamp = (new Date()).getTime();

            // fix the 'id' casing
            if (toSave.id == null) {

                toSave.id = toSave.Id;
                delete toSave.Id;
            }

            // delete extra info
            delete toSave.$type;
            delete toSave.$$hashKey;

            if (toSave.id != null) {

                $scope.table.update(toSave).done(
                    function (result) {

                        object = $me.processServerObject(result);
                        $scope.$emit(emittedEvents.updated, { sender: $scope, args: object });

                        if (callback != null) {

                            try {
                                callback();
                            } catch (e) {

                            }
                        }

                        $scope.$apply(function () {

                            $scope.isBusy = false;
                            $scope.alerts.push({

                                type: 'success',
                                msg: 'Item was saved.'
                            });
                        });

                    }, $me.handleError
                );

            } else {

                $scope.table.insert(toSave).done(
                    function (result) {

                        object = $me.processServerObject(result);

                        if (callback != null) {

                            try {
                                callback();
                            } catch (e) {

                            }
                        }

                        $scope.$emit(emittedEvents.inserted, { sender: $scope, args: object });

                        $scope.$apply(function () {

                            $scope.data.refresh();
                            $scope.alerts.push({

                                type: 'success',
                                msg: 'Item was created.'
                            });
                        });

                    }, $me.handleError
                );

            }

        };

        $scope.data.copy = function (object, callback) {
            
            if (confirm("Copy?") == false) {

                return;
            }

            // create a copy of object and remove key properties
            var toSave = JSON.parse(JSON.stringify(object));
            delete toSave.Id;
            delete toSave.id;
            delete toSave.__createdAt;
            delete toSave.__updatedAt;

            $scope.data.save(toSave, callback);
        };

        // query the database using odata
        $scope.data.query = function (oDataQuery, callback) {

            $scope.isBusy = true;

            $scope.table.read(oDataQuery).done(function (results) {

                results.forEach($me.processServerObject);
                if (callback != null) {

                    callback(results);
                }

                $scope.$apply(function () {

                    $scope.isBusy = false;
                });

            }, $me.handleError);
        };

        $scope.data.delete = function (object, callback) {

            if ($scope.object != null) {

                // use model if specified
                object = $scope.object;
            }

            if (object.id == null) {
                object.id = object.Id;
            }

            if (confirm("are you completely sure about this?") == false) {
                return;
            }

            $scope.table.del(object)
                .done(function () {

                    $scope.$apply(function () {

                        $scope.isBusy = false;

                        if ($scope.list != null) {

                            var index = $scope.list.indexOf(object);
                            $scope.list.splice(index, 1);
                        }

                        $scope.$emit(emittedEvents.deleted, { sender: $scope, args: object });

                        if ($scope.object != null) {

                            $scope.isModelDeleted = true;
                            $scope.object = null;
                        }

                        if (callback != null) {

                            callback(object);
                        }

                        $scope.alerts.push({

                            type: 'success',
                            msg: 'Delete Successful.'
                        });
                    });


                }, $me.handleError);
        };

        $scope.closeAlert = function (index) {
            $scope.alerts.splice(index, 1);
        };

        // file upload
        $scope.data.uploadProgress = 0;
        $scope.data.uploading = false;
        $scope.data.upload = function (file, callback) {

            var id = $scope.object.id;
            if (id == null) {
    
                id = $scope.object.Id;
            }

            var targetUrl = String.format("/tables/{0}/{1}/files", attrs.table, id);

            var fd = new FormData();
            fd.append("fileToUpload", file);

            $scope.data.uploadProgress = 0;
            $scope.data.uploadStatus = "uploading";

            var req = $.ajax({
                url: targetUrl,
                type: "POST",
                data: fd,
                processData: false,
                contentType: false,
                xhr: function () {
                    var req = $.ajaxSettings.xhr();
                    if (req) {
                        req.upload.addEventListener('progress', function (event) {
                            if (event.lengthComputable) {
                                var percent = event.loaded / event.total * 100;
                                if (percent % 10 > 5) {

                                    $scope.$apply(function () {
                                        $scope.data.uploadProgress = percent;
                                        $scope.data.uploading = true;
                                    });
                                }
                            }
                        }, false);
                    }
                    return req;
                },
            });

            req.done(function (result) {

                if (callback != null) {

                    callback();
                }

                $scope.$apply(function () {

                    $scope.object = result;
                    $scope.data.uploadProgress = 100;
                    $scope.data.uploadStatus = "success";
                });
            });

            req.fail(function (jqXHR, jqXHR, textStatus) {

                if (callback != null) {

                    callback();
                }

                $scope.$apply(function () {
                    $scope.data.uploadProgress = 0;
                    $scope.data.uploadStatus = "fail";
                    $scope.alerts.push({

                        type: 'danger',
                        msg: 'Upload failed:' + textStatus

                    });
                });
            });
        };

    };

    // Data Context provides neccessary functions  to access nancyblack database
    // by leveraging azure mobile service api
    ncb.directive('ncbDatacontext', ['$http', function ($http) {

        return {
            restrict: 'A',
            link: dataContext,
            priority: 9999, // make sure we got compiled first
            scope: true,
        };
    }]);

    // DataContext which integrated into current scope instead of creating new
    // child sopce
    ncb.directive('ncbDatacontextIntegrated', ['$http', function ($http) {

        return {
            restrict: 'A',
            link: dataContext,
            priority: 9999, // make sure we got compiled first
            scope: false // integrate into current scope
        };
    }]);

    // Data table is designed to be attached to list or table
    ncb.directive('ncbDatatable', ['$http', function ($http) {

        function link($scope, element, attrs) {

            var $me = this;

            var stopWatch = $scope.$watch("data", function () {

                $me.initialize();
            });

            $me.initialize = function () {

                stopWatch();

                if ($scope.data != null) {

                    $scope.data.refresh();

                    // focus on the given object
                    $scope.data.view = function (item) {
                        $scope.object = item;
                    };
                }
            };
        }

        return {
            restrict: 'A',
            link: link
        };
    }]);

    ncb.directive('ncbSavebutton', ['$compile', function ($compile) {

        function link($scope, element, attrs) {

            var $me = this;

            element.attr("ng-disabled", "isBusy");

            var parentForm = element.parents("form");
            if (parentForm.length == 0) {

                // not in a form, find a form in data context
                var ctx = element.parents("[ncb-datacontext]");
                parentForm = ctx.find("form");
            }

            if (parentForm.length == 0) {
                console.log("save button: No form found, cannot bind to validation.");
            }

            if (parentForm.length > 1) {
                console.log("save button: Multiple form found, cannot bind to validation.");
            }

            if (parentForm.length == 1) {

                element.attr("ng-disabled", parentForm.attr("name") + ".$valid == false || isBusy");
            }

            element.prepend('<i class="fa fa-spin fa-circle-o-notch" ng-show="isBusy"></i>')
            element.removeAttr("ncb-savebutton"); // prevent infinite loop

            var template = $compile(element);
            template($scope);

            // element.on('click' does not work
            element[0].onclick = function () {

                if (attrs.beforesave != null) {

                    var result = $scope.$eval(attrs.beforesave);
                    if (result == false) {

                        return;
                    }
                }

                $scope.$eval("data.save(object)");
            };
        }

        return {
            restrict: 'A',
            link: link,
            scope: true,
            terminal: true, // we will use $compile - so we want to stop all other directives
            priority: 9999, // make sure we got compiled first
        };
    }]);
    
    ncb.directive('ncbInsertbutton', ['$compile', function ($compile) {

        function link($scope, element, attrs) {

            var $me = this;

            element.attr("ng-disabled", "isBusy");
            element.attr("ng-click", "data.insert(object)");

            element.prepend('<i class="fa fa-spin fa-circle-o-notch" ng-show="isBusy"></i>')
            element.removeAttr("ncb-insertbutton"); // prevent infinite loop

            var template = $compile(element);
            template($scope);
        }

        return {
            restrict: 'A',
            link: link,
            terminal: true, // we will use $compile - so we want to stop all other directives
            priority: 9999, // make sure we got compiled first
        };
    }]);

    ncb.directive('ncbListeditor', ['$compile', function ($compile) {

        function link($scope, element, attrs) {

            var $me = this;

            $scope.newItem = {};
            $scope.target = $scope.$parent.$eval(attrs.target);

            $scope.$watch(attrs.target, function () {

                $scope.target = $scope.$parent.$eval(attrs.target);
            });

            $scope.remove = function (item) {

                var target = $scope.$parent.$eval(attrs.target);

                if (target == null) {

                    return;
                }

                var index = target.indexOf(item);
                if (index < 0) {

                    $scope.$parent.alerts.push({
                        msg: "Item not found: " + item
                    });
                    return;
                }

                target.splice(index, 1);
                $scope.newItem = item;
            };

            $scope.add = function () {

                var target = $scope.$parent.$eval(attrs.target);

                if (target == null) {

                    $scope.$parent.$eval(attrs.target + "=[]");
                    target = $scope.$parent.$eval(attrs.target);
                }

                if (target.indexOf( $scope.newItem ) >= 0 ) {

                    $scope.$parent.alerts.push({
                        msg: "Duplicate Item: " + $scope.newItem
                    });
                    return;
                }

                target.push($scope.newItem);
                $scope.target = target;

                $scope.newItem = {};
            };
        }

        return {
            restrict: 'A',
            link: link,
            scope: true
        };
    }]);

    ncb.directive('ncbLookupscope', ['$compile', function ($compile) {

        function link($scope, element, attrs) {

            var $me = this;
            $me.handleError = function (err) {

                $scope.$apply(function () {

                    $scope.isBusy = false;
                });
            };

            $scope.table = client.getTable(attrs.table);
            $scope.lookup = [];
            $scope.isBusy = false;

            $scope.refreshLookup = function (key) {

                var oDataQuery = attrs.filter.replace(/\$key/g, key);

                if (key == null || key == '') {

                    oDataQuery = "";
                } else {

                    oDataQuery += "&";
                }

                oDataQuery += "$top=10";

                $scope.isBusy = true;
                $scope.table.read(oDataQuery).done(function (results) {

                    $scope.$apply(function () {

                        $scope.isBusy = false;

                        if (attrs.labelpath != null) {

                            results.forEach(function (item) {
                                item.label = item[attrs.labelpath];
                            });
                        }

                        $scope.lookup = results;
                    });

                }, $me.handleError);

            };

        }

        return {
            restrict: 'A',
            link: link,
            scope: true,
        };
    }]);

    ncb.directive('ncbLookup', ['$compile', function ($compile) {

        function link($scope, element, attrs) {

            var $me = this;
        }

        return {
            restrict: 'E',
            replace: true,
            link: link,
            templateUrl: '/Modules/DatabaseSystem/template/ncbLookupbox.html'
        };
    }]);
    
})();