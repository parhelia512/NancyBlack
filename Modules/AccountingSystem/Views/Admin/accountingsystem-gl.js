(function () {

    var module = angular.module('AccountingGlModule', ['ui.bootstrap', 'angular.filter', 'chart.js']);

    module.controller("AccountingTransactionEditor", function ($scope, $rootScope, $http) {

        $me = this;
        $me.$scope = $scope;

        $scope.object = {};
        
        $me.refreshAutoComplete = function () {

            $http.get("/admin/tables/accountingentry/__autocompletes").success(function (data) {

                $scope.autocomplete = data;

            });
        };
        
        $me.validate = function (object) {

            var valid = false;

            valid = object.TransactionDate != null;

            if (object.TransactionType == "newaccount") {

                valid &= object.IncreaseAccount != "" &&
                    object.IncreaseAccount != null
            }

            if (object.TransactionType == "newap") {

                valid &= object.DecreaseAccount != "" &&
                    object.DecreaseAccount != null &&
                    object.DebtorLoanerName != null &&
                    object.DecreaseAmount < 0
            }

            if (object.TransactionType == "newar") {

                valid &= object.IncreaseAccount != "" &&
                    object.IncreaseAccount != null &&
                    object.DebtorLoanerName != null &&
                    object.IncreaseAmount > 0
            }

            if (object.TransactionType == "income") {

                valid &= object.IncreaseAccount != "" &&
                    object.IncreaseAccount != null &&
                    object.DebtorLoanerName != null &&
                    object.IncreaseAmount > 0
            }

            if (object.TransactionType == "transfer") {

                valid &= object.IncreaseAccount != "" &&
                    object.IncreaseAccount != null &&
                    object.DecreaseAccount != "" &&
                    object.DecreaseAccount != null &&
                    object.IncreaseAmount > 0 &&
                    object.DecreaseAmount == object.IncreaseAmount * -1
            }

            if (object.TransactionType == "appayment") {

                valid &= object.IncreaseAccount == "Payable" 
                    object.DecreaseAccount != "" &&
                    object.DecreaseAccount != null &&
                    object.IncreaseAmount > 0 &&
                    object.DecreaseAmount == object.IncreaseAmount * -1
            }

            if (object.TransactionType == "arpayment") {

                valid &= object.DecreaseAccount == "Receivable"
                        object.IncreaseAccount != "" &&
                        object.IncreaseAccount != null &&
                        object.IncreaseAmount > 0 &&
                        object.DecreaseAmount == object.IncreaseAmount * -1
            }
            
            if (object.TransactionType == "buy" ) {

                valid &= object.IncreaseAccount != null &&
                        object.DecreaseAccount != "" &&
                        object.DecreaseAccount != null &&
                        object.IncreaseAmount > 0 &&
                        object.DecreaseAmount == object.IncreaseAmount * -1
                        object.DocumentNumber != null &&
                        object.DocumentNumber != "" &&
                        object.DebtorLoanerName != null &&
                        object.DebtorLoanerName != ""
            }

            if (object.TransactionType == "buystock") {

                valid &= object.IncreaseAccount == "Inventory" &&
                    object.DecreaseAccount != "" &&
                    object.DecreaseAccount != null &&
                    object.IncreaseAmount > 0 &&
                    object.DecreaseAmount == object.IncreaseAmount * -1
                    object.DocumentNumber != null &&
                    object.DocumentNumber != "" &&
                    object.DebtorLoanerName != null &&
                    object.DebtorLoanerName != "";
            }

            if (object.TransactionType == "taxcredit") {

                valid &= object.IncreaseAccount == "Tax Credit" &&
                    object.DecreaseAccount != "" &&
                    object.DecreaseAccount != null &&
                    object.IncreaseAmount > 0 &&
                    object.DecreaseAmount == object.IncreaseAmount * -1
                    object.DocumentNumber != null &&
                    object.DocumentNumber != "" &&
                    object.DebtorLoanerName == "Tax";
            }

            if (object.TransactionType == "buystock") {
                value = false;
            }
            
            return valid == false;
        };

        $me.changeMode = function (object) {

            console.log(object);

            object.DecreaseAccount = null;
            object.IncreaseAccount = null;
            object.IncreaseAmount = 0;
            object.DecreaseAmount = 0;
            object.DebtorLoanerName = null;
            
            if (object.TransactionType == "newar") {
                
                object.IncreaseAccount = "Receivable";
            }

            if (object.TransactionType == "newap") {
                
                object.DecreaseAccount = "Payable";
            }

            if (object.TransactionType == "newap_stock") {
                
                object.DecreaseAccount = "Payable";
                object.IncreaseAccount = "Inventory";
            }

            if (object.TransactionType == "newaccount") {

                object.Notes = "New Account";
            }
            
            if (object.TransactionType == "appayment") {

                object.IncreaseAccount = "Payable";
            }

            if (object.TransactionType == "arpayment") {

                object.DecreaseAccount = "Receivable";
            }

            if (object.TransactionType == "buy") {
                
            }

            if (object.TransactionType == "buystock") {

                object.IncreaseAccount = "Inventory";
            }

            if (object.TransactionType == "taxcredit") {

                object.IncreaseAccount = "Tax Credit";
                object.DebtorLoanerName = "Tax";
            }

        };

        $me.save = function (object) {
            
            $scope.data.save(object, function () {
                
                $me.refreshAutoComplete();
            });
            $("#AccountingEntryModal").modal("hide");
        };

        $me.refreshAutoComplete();
    });

    module.controller("AccountingDashboard", function ($scope, $rootScope, $http) {

        $me = this;
        $scope.data = window.data;

        $scope.data.Cash = [];
        $scope.data.Asset = [];
        $scope.data.Expense = [];
        $scope.data.Receivable = [];

        $scope.totalHidden = 0;

        window.accountSettings.forEach(function (item) {

            window.accountSettings[item.Name] = item.Type;

        });
        
        $scope.data.Accounts.forEach(function (item) {

            if (window.accountSettings[item.Account] == "Cash") {
                $scope.data.Cash.push(item);
                return;
            }

            if (window.accountSettings[item.Account] == "Expense") {
                $scope.data.Expense.push(item);
                return;
            }

            if (window.accountSettings[item.Account] == "Asset") {
                $scope.data.AssetSummary.push({
                    Name: item.Account,
                    TotalAmount: item.TotalIncrease + item.TotalDecrease,
                    LastUpdated: item.LastUpdated
                });
                return;
            } 

            if (window.accountSettings[item.Account] == "Receivable") {
                $scope.data.Receivable.push(item);
                return;
            }

            if (window.accountSettings[item.Account] == "Payable") {

                $scope.data.PayableSummary.push({
                    DebtorLoanerName: 'Tax',
                    DocumentNumber: 'Projection',
                    Amount: item.TotalIncrease + item.TotalDecrease,
                });
                $scope.data.Receivable.push(item);
                return;
            }

            $scope.totalHidden++;
        });

        $me.getTotal = function (type, prop) {

            var total = 0;
            $scope.data[type].forEach(function (item) {

                if (item[prop] != null) {

                    total += item[prop];
                }
            });

            return total;

        };


    });


    module.controller("ViewByAccountController", function ($scope, $rootScope, $http) {

        $me = this;
        $scope.accountToView = null;
        $scope.accountData = {};
        $scope.accounts = [];
        
        $http.get("/admin/tables/accountingentry/__autocompletes").success(function (data) {

            $scope.accounts = data.account;

        });

        $me.viewaccount = function (account) {

            $http.get("/admin/tables/accountingentry/accounts/" + account  ).success(function (data) {

                $scope.accountData = data;

            });

        };

    });

})();