/*has been deprectde - don't call make function - expensive! */

angular.module("sampleApp")
    .controller('profilesCtrl',
        function ($rootScope,$scope,GetDataFromServer,appConfigSvc,Utilities,$uibModal,RenderProfileSvc,SaveDataToServer,modalService,$timeout) {

            $scope.input = {param:'hl7',searchParam:'publisher',searchStatus:'all'};

            $scope.$watch('input.searchParam',function(){
               // alert('c')
                delete $scope.profilesArray;
                delete $scope.selectedProfile;
            })
            
            RenderProfileSvc.getAllStandardResourceTypes().then(
                function(lst) {
                    $scope.allResourceTypes = lst;
                    //console.log($scope.allResourceTypes);
                }
            );


            $rootScope.$on('userLoggedIn',function(){
                var userProfile = $rootScope.userProfile;
                console.log(userProfile)
                if (userProfile.extDef && userProfile.extDef.defaultPublisher) {
                    $scope.input = {param:userProfile.extDef.defaultPublisher,searchParam:'publisher',searchStatus:'all'};

                }
            });

            $rootScope.$on('userLoggedOut',function() {
                $scope.input = {param:'hl7',searchParam:'publisher',searchStatus:'all'};
            });

            $rootScope.$on('setDisplayMode',function(ev,mode) {
                if (mode == 'profiles') {
                    delete $scope.profilesArray;
                    delete $scope.selectedProfile;
                }
            });



            $scope.errors = [];
            $scope.appConfigSvc = appConfigSvc;

            //load the new extension page
            $scope.newProfile = function() {
                $uibModal.open({
                    templateUrl: 'modalTemplates/newProfile.html',
                    size: 'lg',
                    controller: ""
                }).result.then(
                    function(result) {
                        console.log(result)
                    })
            };

            $scope.deleteProfile = function(){
                var modalOptions = {
                    closeButtonText: "No, don't Delete",
                    actionButtonText: 'Yes please',
                    headerText: 'Activate ' + $scope.selectedProfile.name,
                    bodyText: 'Are you sure you want to delete this Extension Definition? (It MUST NEVER have been used in a resource instance)'
                };
                modalService.showModal({}, modalOptions).then(
                    function(){
                        SaveDataToServer.deleteResource(appConfigSvc.getCurrentConformanceServer(),$scope.selectedProfile).then(
                            function(data){
                                console.log(data);
                                modalService.showModal({}, {bodyText:'Definition is now deleted.'});

                                $scope.profilesArray.splice($scope.index,1);
                                delete $scope.selectedProfile;
                                delete $scope.index;


                            },
                            function(err) {
                                alert('Error updating definition: '+angular.toJson(err))
                            }
                        )
                    }
                )
            };

            $scope.editProfile = function () {
                modalService.showModal({}, {bodyText : "Sorry, editing is not yet enabled"})
            };

            $scope.retireProfile = function(){
                var modalOptions = {
                    closeButtonText: "No, don't Retire",
                    actionButtonText: 'Yes please',
                    headerText: 'Activate ' + $scope.selectedProfile.name,
                    bodyText: 'Are you sure you want to retire this Extension Definition?'
                };
                modalService.showModal({}, modalOptions).then(
                    function(){
                        $scope.selectedProfile.status = 'retire';
                        SaveDataToServer.updateResource(appConfigSvc.getCurrentConformanceServer(),$scope.selectedProfile).then(
                            function(data){
                                console.log(data);
                                modalService.showModal({}, {bodyText:'Definition is now retired, and should no longer be used. (It needs to remain in the registry for existing usages of course.)'});
                            },
                            function(err) {
                                alert('Error updating definition: '+angular.toJson(err))
                            }
                        )
                    }
                )
            };

            $scope.activateProfile = function(){
                var modalOptions = {
                    closeButtonText: "No, don't Activate",
                    actionButtonText: 'Yes please',
                    headerText: 'Activate ' + $scope.selectedProfile.name,
                    bodyText: 'Are you sure you want to activate this Extension Definition?'
                };
                modalService.showModal({}, modalOptions).then(
                    function(){
                        $scope.selectedProfile.status = 'active';
                        SaveDataToServer.updateResource(appConfigSvc.getCurrentConformanceServer(),$scope.selectedProfile).then(
                            function(data){
                                console.log(data);
                                modalService.showModal({}, {bodyText:'Definition is now active, and can be used by resource instances.'});
                            },
                            function(err) {
                                alert('Error updating definition: '+angular.toJson(err))
                            }
                        )
                    }
                )
            };

            $scope.search = function(param) {
                
                var conformanceServer =  appConfigSvc.getCurrentConformanceServer();
                var query = conformanceServer.url;
                
                //because I have to proxy Grahames server. Don't really like this...
                $scope.conformanceServer = conformanceServer.realUrl || conformanceServer.url;  //for the detail display
                var downLoadName = '';
                switch ($scope.input.searchParam) {

                    case 'publisher' :
                        query += "StructureDefinition?publisher:contains="+param;
                        downLoadName = 'publisher-'+param;
                        break;
                    case 'description' :
                        query += "StructureDefinition?description:contains="+param;
                        downLoadName = 'description-'+param;
                        break;
                    case 'name' :
                        query += "StructureDefinition?name:contains="+param;
                        downLoadName = 'name-'+param;
                        break;
                    case 'identifier' :
                        var id = $scope.input.identifierId;
                        var system = $scope.input.identifierSystem;
                        var ident = id;
                        if (!id) {
                            alert("You need to enter an Id")
                            return;
                        }
                        if (system) {
                            ident = system + "|" + id;
                        }

                        query += "StructureDefinition?identifier="+ident;
                        downLoadName = 'identifier-'+ident;
                        break;
                    case 'resource' :
                        param = $scope.input.resourceType;
                        var t = param.name;
                        //Both '*' and 'Resource' are used for 'any resource'
                        if (t == '*') {
                            t += ",Resource";
                        }
                        downLoadName = 'resource-'+param;

                        query += "StructureDefinition?ext-context:contains="+t;

                        break;
                }

                //if the status is not all...
                if ($scope.input.searchStatus !== 'all') {
                    query += "&status="+$scope.input.searchStatus;
                }

                query += "&type=Extension";     //this is the same for STU-2 & 3...





                getProfiles(query,downLoadName)
            }


            function getProfiles(query,downLoadName) {
                $scope.loading=true;
                delete $scope.profilesArray;
                delete $scope.selectedProfile;
                delete $scope.index;
console.log(query)
                $scope.query = query;

                GetDataFromServer.adHocFHIRQuery(query).then(
                    function(data) {
                        var bundle = data.data;
                        $scope.loading=false;

                        if (bundle && bundle.entry) {
                            $scope.profilesArray = bundle.entry;

                            $scope.profilesArray.sort(function (a, b) {
                                if (a.resource.name && a.resource.name) {
                                    if (a.resource.name.toUpperCase() > b.resource.name.toUpperCase()) {
                                        return 1
                                    } else {
                                        return -1
                                    }
                                } else {
                                    return 0;
                                }


                            });


                            $scope.downloadLinkJsonContent = window.URL.createObjectURL(new Blob([angular.toJson(bundle, true)], {type: "text/text"}));
                            $scope.downloadLinkJsonName = downLoadName;

                        }


                    },
                    function(err) {
                        $scope.loading=false;
                        alert("Error:"+angular.toJson(err));
                    }
                )
            }


            delete $scope.selectedProfile;
            
            $scope.selectProfile = function(entry,inx){

            };


        });