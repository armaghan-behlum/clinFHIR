

angular.module("sampleApp")

    .service('packageViewerSvc', function($q,$http) {

        let terminologyServer = {url:"https://r4.ontoserver.csiro.au/fhir/"}

        var objColours ={};

        objColours.valueset = '#FFFFCC';
        objColours.profile = '#ff8080';
        objColours.extension = '#ffb3ff';
        objColours.reference = '#8bc9f4'



        //this is the current package that is being viewed
        let currentPackage;
        let hashResources = {}      //a hash of resources based on url (not file name)
        let corePackage;            //the R4 core package
        let corePackageHash = {}    //a hash keyed on kind-url for the core package(where kind = extension, profile etc.
        let currentPackageHash = {} //a hash keyed on kind-url for the current package(where kind = extension, profile etc.

        /* not using this now, but don't delete...
        //load the FHIR core package.
        //todo - after all this, ontoserver already has all the core terminology. sigh.
        //todo - re-write to use loadPackage()
        let url = "/registry/hl7.fhir.r4.core/4.0.1"
        $http.get(url).then(
            function (data) {
                corePackage = data.data
                //console.log("Core package loaded")
                //console.log(corePackage)

                //now generate a hash so we can locate the filename from the url
                angular.forEach(corePackage.grouped,function(v,k){
                    corePackage.grouped[k].forEach(function(item){
                        //item = {display: kind: url: name} - where name is the filename....
                        let key = item.kind + '-' + item.url;
                        if (corePackageHash[key]) {
                            console.log("Collision on key:" + key)
                        } else {
                            corePackageHash[key] = item;
                        }
                    })
                })

            }
        )
*/
        function dropFirstInPath(path) {
            let ar = path.split('.')
            ar.splice(0,1)
            return ar.join('.')
        }


        return {

            downloadPackage : function(name,version) {
                //the actual download from the registry...
                let that = this;
                let deferred = $q.defer()
                //first make sure we don't already have it...
                that.loadPackage(name,version).then(
                    function(packageSummary) {
                        //the package has already been downloaded, so return it...
                        deferred.resolve({wasDownloaded:false, packageSummary:packageSummary});

                        },
                    function (err) {
                        //the package can be downloaded (if it exists in the registry)
                        let url = "/registry/download/" + name + "/" + version;

                        $http.get(url).then(
                            function (data) {
                                //the package was downloaded. Retrieve it and return the summary...
                                that.loadPackage(name,version).then(
                                    function(packageSummary) {
                                        deferred.resolve({wasDownloaded:true, packageSummary:packageSummary});
                                    },
                                    function(){
                                        deferred.reject("The package was downloaded, but could not subsequently be found. Contact support.")
                                    })

                            },
                            function (){
                                //the package couldn't be downloaded
                                deferred.reject("The package "+name+ "#"+ version + " could not be downloaded. Is the name/version correct?")
                            }
                        )

                    }
                )
                return deferred.promise

            },

            makeGraph : function(item,options) {
                if (!item) {
                    return {}
                }
                options = options || {showBindings:true}
                //generate the graph of 'references' from a profile
                // {extensions: bindings: references:
//console.log(item)
                let arNodes = [], arEdges = [];

                let profileNode = {id: "profile", color: objColours['profile'],
                    label: item.url, shape: 'box', item: item};


                arNodes.push(profileNode)

                //add bindings...
                if (options.showBindings) {
                    if (item.bindings) {
                        item.bindings.forEach(function (binding,inx) {
                            let id = "binding"+inx;
                            let bindingNode = {id: id, color: objColours['valueset'],label: binding.binding.valueSet,
                                shape: 'box', item: binding};
                            arNodes.push(bindingNode)

                            //now add connection to profile
                            let edge = {
                                id: 'e' + arEdges.length + 1, from: "profile", to: id,
                                label: binding.path, arrows: {to: true},
                                data : {}

                            };
                            arEdges.push(edge)
                        })
                    }

                }

                //add bindings...
                if (options.showExtensions) {
                    if (item.extensions) {
                        item.extensions.forEach(function (extension,inx) {
                            let id = "extension"+inx;
                            let extensionNode = {id:id , color: objColours['extension'],label: extension.profile,
                                shape: 'box', item: extension};
                            arNodes.push(extensionNode)

                            //now add connection to profile
                            let edge = {
                                id: 'e' + arEdges.length + 1, from: "profile", to: id,
                                label: extension.path, arrows: {to: true},
                                data : {}

                            };
                            arEdges.push(edge)
                        })
                    }

                }

                //add bindings...
                if (options.showReferences) {
                    if (item.references) {
                        item.references.forEach(function (reference,inx) {
                            let id = "reference"+inx;
                            let extensionNode = {id:id , color: objColours['reference'],label: reference.targetProfile,
                                shape: 'box', item: reference};
                            arNodes.push(extensionNode)

                            //now add connection to profile
                            let edge = {
                                id: 'e' + arEdges.length + 1, from: "profile", to: id,
                                label: reference.path, arrows: {to: true},
                                data : {}

                            };
                            arEdges.push(edge)
                        })
                    }

                }


                let nodes = new vis.DataSet(arNodes);
                let edges = new vis.DataSet(arEdges);

                // provide the data in the vis format
                let graphData = {
                    nodes: nodes,
                    edges: edges
                };

                return graphData;


            },

            uploadVS : function(vs) {
                if (vs.id) {
                    let url = terminologyServer.url + "ValueSet" + "/" + vs.id;
                    $http.put(url,vs).then(
                        function (data) {
                            alert("ValueSet: " + vs.url + " has been uploaded")
                        },
                        function (err) {
                            alert(angular.toJSON(err.data))
                        }
                    )
                } else {
                    alert("A ValueSet must have an id to be uploaded")
                }

            },

            loadPackage : function(name,version) {
                //load a package (summary) based on the name and version...
                //return is a summary of the package - files and urls' grouped by type
                //assume already downloaded (won't download if not found atm)
                let deferred = $q.defer()
                currentPackageHash = {}

                let url = "/registry/" + name + "/" + version;

                $http.get(url).then(
                    function (data) {
                        currentPackage = data.data;
                        console.log(currentPackage)

                        //now generate a hash so we can locate the filename from the url
                        angular.forEach(currentPackage.grouped,function(v,k){
                            currentPackage.grouped[k].forEach(function(item){
                                //item = {display: kind: url: name} - where name is the filename....
                                let key = item.kind + '-' + item.url;
                                if (currentPackageHash[key]) {
                                    console.log("Collision on key:" + key)
                                } else {
                                    currentPackageHash[key] = item;
                                }
                            })
                        })

                        deferred.resolve(data.data)

                    },
                    function (err) {
                        deferred.reject()
                    }
                )

                return deferred.promise;
            },


            initFhirCore : function() {
                //retrieve the R4 core package. Used when a profile refers to an artifact (eg VS) from core

            },

            getResourceByUrl : function(url,kind) {
                let deferred = $q.defer()
                //retrieve a specific resource from the server based on the url. We'll need to find the file that
                //has that url from the package hash...

                //if in the local cache, then return it. Otherwise load from the server and update the cache.
                if (hashResources[url]) {
                    deferred.resolve(hashResources[url])

                } else {
                    //OK, we need to find the file with this url
                    let key = kind + '-' + url;
                    let item = currentPackageHash[key];
                    let fileName = "";              //this will be the fileName from the package where this resource is defined
                    if (item) {
                        //this item is in the current package
                        fileName = item.name;
                        getFile(currentPackage.name,currentPackage.version,fileName)    //getFile will resolve / reject the promise
                    }

/*
                    //note that "currentPackage" is defined at the top of the service...
                    let qry = "/registry/" + currentPackage.name + "/" + currentPackage.version + "/" + url;
                    $http.get(qry).then(
                        function (data) {
                            hashResources[url] = data.data;
                            deferred.resolve(data.data)
                        },
                        function (data) {
                            deferred.reject()
                        }
                    )
                    */
                }

                //todo - load from the registry if not defined in the package...

                return deferred.promise;

                function getFile(package,version,fileName) {
                    let qry = "/registry/" + package + "/" + version + "/" + fileName;
                    $http.get(qry).then(
                        function (data) {
                            hashResources[url] = data.data;
                            deferred.resolve(data.data)
                        },
                        function (data) {
                            deferred.reject()
                        }
                    )
                }
            },

            setPackageDEP : function(selectedPackage) {
                //set the package in the service....
                currentPackage = selectedPackage;
            },
            extensionSummary : function(sd) {
                //generate a summary of the extenstion contents
                let summary = {}

                //is this a simple or a complex extension
                let isSimple = true

                if (sd.snapshot.element.length > 8) { isSimple = false};    //slightly arbitrary number...
                summary.isSimple = isSimple

                if (isSimple) {
                    let item = {}
                    sd.snapshot.element.forEach(function (element,ctr){
                        if (ctr == 0) {
                            summary.short = element.short;
                            summary.definition = element.definition;
                        } else if (element.id.indexOf('[x]:') > -1) {

                            item.type = element.type
                            item.binding = element.binding
                            summary.contents = [(item)]
                        }

                      //  console.log(element.id, element.sliceName)
                    })
                } else {
                    let hash = {}, slices = []

                    sd.snapshot.element.forEach(function (element,ctr){
                        hash[element.id] = element
                        if (element.sliceName) {
                            slices.push(element.sliceName)
                        }
                    })

                    console.log(hash)
                    slices.forEach(function (slice){
                        let item = {sliceName : slice}

                        let urlKey = "Extension.extension:" + slice
                        if (hash[urlKey]) {
                            item.name = hash[urlKey].sliceName
                            item.definition = hash[urlKey].definition;
                        }

                        let typeKey = "Extension.extension:" + slice + '.value[x]'
                        if (hash[typeKey]) {
                            item.type = hash[typeKey].type;
                            item.binding = hash[typeKey].binding;
                        }



                        summary.contents = summary.contents || []
                        summary.contents.push(item)

                    })


/*<!--
return summary;

                    sd.snapshot.element.forEach(function (element,ctr){

                        if (element.sliceName) {
                           // hash[]
                        }

                        console.log(element.id, element.sliceName)
                        if (ctr == 0) {
                            summary.short = element.short;
                            summary.definition = element.definition;
                        } else if (element.id.indexOf('[x]:') > -1) {
                            let item = {}
                            item.type = element.type
                            item.binding = element.binding
                            summary.contents = summary.contents || []
                            summary.contents.push(item)
                        }

                        //  console.log(element.id, element.sliceName)
                    })
*/
                }
                return summary;

            },

            createTreeArray : function(sd) {
                var cntExtension = 0;
                let hashPath = {}   //key is path, value is id
                let arTree = [];
                if (sd && sd.snapshot && sd.snapshot.element) {
                    sd.snapshot.element.forEach(function (ed,inx) {
                        hashPath[ed.path] = ed.id
                        var include = true;

                        var path = ed.path;
                        var arPath = path.split('.');
                        var item = {data:{}};
                        item.data.ed = ed;

                        item.id = ed.id;

                        if (arPath.length == 1) {
                            //this is the root node
                            item.parent = '#';
                            item.text = sd.type;  //"Root"
                        } else {
                            //default text
                            let text = arPath[arPath.length - 1];   //the text will be the last entry in the path...
                            //text += "_" + inx;
                            arPath.pop();//
                            let parentId = hashPath[arPath.join('.')]
                            item.parent = parentId; //arPath.join('.');
                            //var text = arPath[arPath.length - 1];   //the text will be the last entry in the path...

                            if (ed.sliceName) {
                                text += ": " + ed.sliceName;
                            }

                            item.text = text ;
                            //item.text += cnt;

                        }

                        item.state = {opened: true};     //default to fully expanded
                        item.data.ed = ed;  //added for profileDiff

                        decorateItem(item)


                       // item.attr class = "extension"

                        //check for extensions...
                        if (item.data && item.data.ed && item.data.ed.type) {
                            item.data.ed.type.forEach(function (typ) {
                                //if there's no profile, then it's a placeholder...
                                if (typ.code == 'Extension' && ! typ.profile) {
                                    include = false;
                                }
                            })
                        }

                        if (include) {
                            arTree.push(item);
                        }

                    })
                }

                return arTree

                function decorateItem(item) {
                    let attr = {class:''}

                    //is this an extension
                    if (item.data && item.data.ed && item.data.ed.type) {
                        item.data.ed.type.forEach(function (typ){
                            if (typ.code == 'Extension') {
                                attr.class += " extension"
                            }
                        })
                    }

                    if (item.data.ed.min > 0) {
                        attr.class += " required"
                    }

                    //to override the 'inheriting' of colours
                    if (attr.class == "") {
                        attr.class = "normal"
                    }

                    item['li_attr'] = attr;//{class:'extension'}
                }


            },

            makeLogicalModel : function(SD,IG) {
                let that = this;
                let deferred = $q.defer();

                let elementsToIgnore = ['id', 'meta', 'implicitRules', 'language', 'contained'];

                let baseType = SD.snapshot.element[0].path;
                let rootName = 'myResource';
                //let vo ={rootName:rootName,baseType:baseType};
                let queries = [];       //these will be extensions to de-compose...
                let excluded = [];      //elements excluded by setting max to 0

                var newElementArray = [];
                SD.snapshot.element.forEach(function (ed) {
                    //let ed = angular.copy(el);      //something is updating the element...
                    let item = {};
                    item.ed = ed;
                    item.path = dropFirstInPath(ed.path)
                    item.description = ed.short || ed.definition ;

                    let include = true;
                    let arPath = ed.path.split('.');

                    if (elementsToIgnore.indexOf(arPath[arPath.length-1]) !== -1) {
                        include = false;
                    }

                    if ( ed.path.indexOf('xtension') > -1) {
                        if (ed.type) {
                            ed.type.forEach(function (typ) {
                                if (typ.profile) {

                                    //stu2/3 difference
                                    let profile = typ.profile
                                    if (angular.isArray(typ.profile)) {
                                        profile = typ.profile[0]
                                    }
                                    item.description = profile;
                                  //temp  queries.push(checkExtensionDef(profile, item));
                                } else {
                                    //no profile, don't include
                                    include = false;
                                }

                            })
                        }
                    } else {
                        //when slicing - not for an extension
                        if (ed.sliceName) {
                            item.description = ed.sliceName + " " + item.description;
                        }
                    }


                    if (ed.slicing) {
                        //don't show the discriminator element
                        include = false;
                    }

                    //if max is 0 (or any of the parents) then don't include
                    if (ed.max == '0') {
                        excluded.push(ed.path)
                        include = false;
                    }

                    //check is any of the parents have
                    excluded.forEach(function(excl){
                        if (ed.path.indexOf(excl)> -1) {
                            include = false;
                        }
                    })


                    if (include) {
                        newElementArray.push(item);
                    }

                });

                $q.all(queries).then(
                    function () {
                        deferred.resolve(newElementArray);
                    },
                    function (err) {
                        console.log('ERROR: ', err)
                        deferred.reject({allElements:newElementArray,err:err});
                    }
                );


                //  SD.snapshot.element = newElementArray;  ?? why did I do thos????

                return deferred.promise;
                //==============================================

                //retrieve the Extension Definition to populate child nodes
                function checkExtensionDef(extUrl, item) {
                    console.log('checking '+ extUrl)

                    item.extUrl = extUrl;
                    var deferred = $q.defer();

                    let qry = confServer + "StructureDefinition?url=" + extUrl;

                    item.children = item.children || []

                    localGetMostRecentResourceByCanUrl(qry,'extension').then(
                        function(vo) {
                            let extensionDef = vo.resource;     //should really only be one...
                            if (! extensionDef) {
                                item.err = "Extension definition not found"
                                deferred.resolve();
                                return;
                            }

                            item.description = extensionDef.description;

                            //console.log(extensionDef)
                            if (extensionDef && extensionDef.snapshot && extensionDef.snapshot.element) {
                                //item.children = item.children || []
                                let isComplex = false;  //will be complex
                                extensionDef.snapshot.element.forEach(function (ed) {
                                    //the path ending in .url has the name in fixedUri
                                    if (ed.path == 'Extension.extension' && ! ed.slicing && ed.sliceName) {
                                        item.children.push(angular.copy(ed))
                                    }


                                })
                            }

                            if (vo.err) {
                                item.err = vo.err
                                //item.children.push({err:vo.err});
                            }

                            deferred.resolve();
                        }
                    );





                    return deferred.promise;
                };



            }
        }
    })
    .filter('dropFirstInPath',function(){
        return function (path) {
            let ar = path.split('.')
            ar.splice(0,1)
            return ar.join('.')
        }
    }).filter('cleanED',function(){
        //remove junk from ElementDefinion
    return function (ED) {
        if (ED) {
            delete ED.mapping
            delete ED.constraint
            return ED
        }


    }
})
