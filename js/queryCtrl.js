angular
  .module("sampleApp")
  .controller(
    "queryCtrl",
    function (
      $scope,
      $uibModal,
      $localStorage,
      appConfigSvc,
      resourceCreatorSvc,
      ResourceUtilsSvc,
      $http,
      modalService,
      commonSvc,
      $location,
      v2ToFhirSvc,
      $timeout,
    ) {
      //profileCreatorSvc  RenderProfileSvc  SaveDataToServer  $rootScope

      $scope.config = $localStorage.config;
      $scope.input = { serverType: "known" }; //serverType allows select from known servers or enter ad-hoc
      $scope.result = { selectedEntry: {} };
      $scope.ResourceUtilsSvc = ResourceUtilsSvc;
      $scope.fhirBasePath = "http://hl7.org/fhir/";

      $scope.bvUrl =
        $location.protocol() +
        "://" +
        $location.host() +
        ":" +
        $location.port() +
        "/bundleVisualizer.html";
      console.log($scope.bvUrl);
      //anonQuery

      $scope.input.showQuery = true; //if true, the query builder can be shown
      $scope.input.showResults = false; //show the resoult of a query

      function resetRedoxState() {
        $scope.redoxMode = false;
        $scope.redoxCatalog = null;
        $scope.redoxRequest = null;
        $scope.redoxRequestHeaders = {};
        $scope.redoxRequestBody = "";
        $scope.redoxResponse = null;
        $scope.redoxBodyManualOverride = false;
      }

      function combineUrl(base, path) {
        if (!base) {
          return path || "";
        }
        if (!path) {
          return base;
        }
        if (base.slice(-1) === "/" && path.charAt(0) === "/") {
          return base + path.substring(1);
        }
        if (base.slice(-1) !== "/" && path.charAt(0) !== "/") {
          return base + "/" + path;
        }
        return base + path;
      }

      function assignRedoxValue(target, path, value) {
        if (!path) {
          return;
        }
        const segments = path.split(".");
        let current = target;
        segments.forEach(function (segment, index) {
          const match = segment.match(/(.+)\[(\d+)\]$/);
          if (match) {
            const key = match[1];
            const arrayIndex = parseInt(match[2], 10);
            current[key] = current[key] || [];
            while (current[key].length <= arrayIndex) {
              current[key].push({});
            }
            if (index === segments.length - 1) {
              current[key][arrayIndex] = value;
            } else {
              if (
                typeof current[key][arrayIndex] !== "object" ||
                current[key][arrayIndex] === null
              ) {
                current[key][arrayIndex] = {};
              }
              current = current[key][arrayIndex];
            }
          } else {
            if (index === segments.length - 1) {
              current[segment] = value;
            } else {
              current[segment] = current[segment] || {};
              current = current[segment];
            }
          }
        });
      }

      resetRedoxState();

      $scope.markRedoxBodyEdited = function () {
        $scope.redoxBodyManualOverride = true;
      };

      $scope.resetRedoxRequestTemplate = function () {
        $scope.redoxBodyManualOverride = false;
        $scope.buildQuery({ forceRedoxRebuild: true });
      };

      //note that functions to check the $location # for a server & setuo initial one are below $scope.selectServer & $scope.buildQuery

      //select a server. If 'server' is populated then we've selected a known server. If url is populated then an ad-hoc url has been entered
      //has to be at the top as called at startup
      //the 'server' is a pre-defined server, 'url' is used when entering an ad-hoc server
      $scope.selectServer = function (server, url) {
        if (url) {
          if (url.substring(url.length - 1) !== "/") {
            url += "/";
          }
          server = { name: "Ad Hoc server", url: url };
        }
        $scope.server = server;
        $scope.input.parameters = "";

        delete $scope.filteredProfile;
        delete $scope.response;
        delete $scope.err;
        delete $scope.conformance;
        delete $scope.input.selectedType;
        delete $scope.standardResourceTypes;
        delete $scope.searchParamList;
        delete $scope.includeList;

        $scope.input.showQuery = true;
        $scope.input.showResults = false;

        resetRedoxState();

        if (!$scope.server) {
          return;
        }

        $scope.waiting = true;

        if ($scope.server.isRedox) {
          const configPath =
            ($scope.config && $scope.config.redoxConfigPath) ||
            "artifacts/redox-endpoints.json";
          const configId = $scope.server.redoxConfigId || "default";
          $http
            .get(configPath)
            .then(
              function (response) {
                const catalog = response.data || {};
                const serverConfig =
                  catalog[configId] || catalog.default || {};

                if (
                  !serverConfig.resources ||
                  !Array.isArray(serverConfig.resources) ||
                  serverConfig.resources.length === 0
                ) {
                  alert(
                    "No Redox resources defined for configuration id '" +
                      configId +
                      "'.",
                  );
                  return;
                }

                $scope.redoxMode = true;
                $scope.redoxCatalog = serverConfig;
                $localStorage.serverQueryServer = server;

                $scope.conformance = {
                  description: serverConfig.description,
                  rest: [
                    {
                      mode: "server",
                      documentation: serverConfig.documentation,
                      resource: serverConfig.resources.map(function (res) {
                        return {
                          type: res.type,
                          documentation: res.documentation,
                          searchParam: res.searchParam || [],
                        };
                      }),
                    },
                  ],
                };

                $scope.hashResource = {};
                $scope.standardResourceTypes = serverConfig.resources.map(
                  function (res) {
                    const clone = angular.copy(res);
                    clone.type = res.type;
                    clone.searchParam = clone.searchParam || [];
                    $scope.hashResource[res.type] = clone;
                    return { name: res.type, display: res.display || res.type };
                  },
                );

                if ($scope.standardResourceTypes.length > 0) {
                  $scope.typeSelected($scope.standardResourceTypes[0]);
                }
              },
              function (err) {
                alert(
                  "Error loading Redox configuration from:" +
                    configPath +
                    "\n" +
                    err,
                );
              },
            )
            .finally(function () {
              $scope.waiting = false;
            });

          return;
        }

        let accessToken = $scope.input.accessToken;
        let config = { headers: {} };
        if (accessToken) {
          config.headers.Authorization = "Bearer " + accessToken;
        }

        let qry = $scope.server.url + "metadata";
        if ($scope.input.useProxy) {
          console.log("Using proxy");
          qry = "/proxyfhir/" + qry;
        }
        $http
          .get(qry, config)
          .then(
            function (data) {
              $localStorage.serverQueryServer = server;
              $scope.conformance = data.data; //the CapabilityStatement (Conformance) resource
              $scope.hashResource = {}; //has of capstmt resource entry by type...
              $scope.standardResourceTypes = [];

              if (
                data.data &&
                data.data.rest &&
                data.data.rest.length > 0 &&
                data.data.rest[0].resource
              ) {
                data.data.rest[0].resource.forEach(function (res) {
                  //include a type if there is a 'read' interaction
                  if (res.interaction) {
                    if (
                      res.interaction.filter(
                        (item) => item.code == "search-type",
                      ).length > 0
                    ) {
                      $scope.standardResourceTypes.push({ name: res.type });
                    }
                  }

                  //sort the search parameters alphabetically...
                  if (res.searchParam) {
                    res.searchParam.sort(function (a, b) {
                      if (a.name > b.name) {
                        return 1;
                      } else {
                        return -1;
                      }
                    });
                  }

                  //todo ?? should this be added if there is no type query??
                  $scope.hashResource[res.type] = res;
                });
              } else {
                alert("CapabilityStatement not valid");
              }
            },
            function (err) {
              alert(
                "Error loading conformance resource from:" +
                  qry +
                  " Is the server available, and does it support CORS? \n" +
                  err,
              );
            },
          )
          .finally(function () {
            $scope.waiting = false;
          });

        $scope.buildQuery(); //builds the query from the params on screen
      };

      //create the list of 'common' types - from teh library
      $localStorage.queryHistory = $localStorage.queryHistory || [];

      //Get rid of any junk prior to this upgrade. These have the 'anonQuery' element set
      if ($localStorage.queryHistory.length > 0) {
        if ($localStorage.queryHistory[0].anonQuery) {
          $localStorage.queryHistory.length = 0;
        }
      }

      $scope.queryHistory = $localStorage.queryHistory;
      $scope.commonTypes = [];

      //get all the unique types in the history for the parameters selection
      $localStorage.queryHistory.forEach(function (hx) {
        if (hx.type && $scope.commonTypes.indexOf(hx.type) == -1) {
          $scope.commonTypes.push(hx.type);
        }
      });

      $scope.getOperationDefinition = function (url) {
        $scope.selectedOpDefUrl = url;
        let qry = $scope.server.url + "OperationDefinition?url=" + url;

        let config = {};
        if ($scope.server.apiKey) {
          config.headers = config.headers || {};
          config.headers["x-api-key"] = $scope.server.apiKey;
        }

        $http.get(qry, config).then(
          function (data) {
            if (data.data.entry && data.data.entry.length >= 0) {
              $scope.operationDefinition = data.data.entry[0].resource;
            }
          },
          function (err) {
            console.log("Can't find OpDef " + url);
          },
        );
      };

      //builds the query from the user entered data
      $scope.buildQuery = function (options) {
        options = options || {};
        delete $scope.anonQuery;
        delete $scope.query;
        delete $scope.response;
        var qry = ""; //$scope.server.url;

        if (!$scope.input.selectedType) {
          return;
        }

        if ($scope.redoxMode) {
          const resourceConfig =
            $scope.hashResource &&
            $scope.hashResource[$scope.input.selectedType.name];
          if (!resourceConfig) {
            return;
          }

          const requestDef = resourceConfig.request || {};
          const url = combineUrl($scope.server.url, requestDef.path);
          $scope.redoxRequest = {
            method: (requestDef.method || "POST").toUpperCase(),
            url: url,
            headers: angular.copy(requestDef.headers || {}),
          };
          $scope.redoxRequestHeaders = $scope.redoxRequest.headers;

          if (!$scope.redoxBodyManualOverride || options.forceRedoxRebuild) {
            const bodyTemplate = angular.copy(requestDef.bodyTemplate || {});
            if (
              $scope.input.selectedSearchParam &&
              $scope.input.selectedSearchParamValue
            ) {
              (resourceConfig.searchParam || []).forEach(function (param) {
                if (
                  $scope.input.selectedSearchParam[param.name] &&
                  $scope.input.selectedSearchParamValue[param.name] !==
                    undefined &&
                  param.redox &&
                  param.redox.path
                ) {
                  assignRedoxValue(
                    bodyTemplate,
                    param.redox.path,
                    $scope.input.selectedSearchParamValue[param.name],
                  );
                }
              });
            }
            $scope.redoxRequestBody = angular.toJson(bodyTemplate, 2);
          }

          $scope.query = $scope.redoxRequest.method + " " + url;
          $scope.anonQuery = $scope.query;
          return;
        }

        if ($scope.input.selectedType) {
          qry += $scope.input.selectedType.name;
        }

        let prefix = "?";

        if ($scope.searchParamList) {
          $scope.searchParamList.forEach(function (param) {
            let name = param.name;

            if (
              $scope.input.selectedSearchParam &&
              $scope.input.selectedSearchParamValue
            ) {
              //only set when an include is selected
              if (
                $scope.input.selectedSearchParam[name] &&
                $scope.input.selectedSearchParamValue[name]
              ) {
                let value = $scope.input.selectedSearchParamValue[name];

                qry += prefix + name + "=" + value;
                prefix = "&";
              }
            }
          });
        }

        //add any chained queries -  input.selectedChain is a hash of possible chain values, input.selectedChainValue{}
        if ($scope.input.selectedChain && $scope.input.selectedChainValue) {
          Object.keys($scope.input.selectedChain).forEach(function (key) {
            let cbValue = $scope.input.selectedChain[key]; //the value of the checkbox
            let chainValue = $scope.input.selectedChainValue[key]; //the value entered by the user
            if (cbValue && chainValue) {
              qry += prefix + key + "." + chainValue;
              prefix = "&";
            }
          });
        }

        //add any includes input.selectedInclude is a hash of possible includes
        if ($scope.input.selectedInclude) {
          Object.keys($scope.input.selectedInclude).forEach(function (key) {
            let value = $scope.input.selectedInclude[key];
            if (value) {
              qry +=
                prefix +
                "_include=" +
                $scope.input.selectedType.name +
                ":" +
                key;
              prefix = "&";
            }
          });
        }

        qry += prefix + "_count=100";

        $scope.anonQuery = qry; //the query, irrespective of the server...
        $scope.query = $scope.server.url + qry; //the query againts the current server...

        $scope.adHocQry = qry; //$scope.query;     //to allow the user to manually change
      };

      //------------- determine the server when launched-----------------------
      // the most recently selected server
      $scope.server =
        $localStorage.serverQueryServer || appConfigSvc.getCurrentDataServer();

      $scope.input.server = $scope.server; //set the drop down
      $scope.input.serverType = "known";

      var hash = $location.hash();
      if (hash) {
        console.log("server passed in: " + hash);
        $scope.fromHash = true;
        $scope.input.serverType = "adhoc";
        $scope.input.adHocServer = hash;

        if (hash.substring(hash.length - 1) !== "/") {
          hash += "/";
        }
        $scope.server = { name: "Ad Hoc server", url: hash };
      }

      $scope.selectServer($scope.server); //either one passed in, or the previous one...

      $scope.makeUrlDEP = function (type) {
        return $scope.config.baseSpecUrl + type;
      };

      function clear() {
        delete $scope.operationDefinition;
        delete $scope.selectedOpDefUrl;
      }

      //these are the definitions for the base elements in R4. Copied from gb2...
      $http.get("./artifacts/resourceElements.json").then(function (data) {
        //console.log(data.data);
        $scope.resourceElements = data.data;
      });

      $http.get("artifacts/fhirHelp.json").then(
        function (data) {
          $scope.fhirHelp = data.data;
          console.log($scope.fhirHelp);
        },
        function (err) {
          console.log(err);
        },
      );

      //register that app started...
      $http.post("/stats/login", { module: "query", servers: {} });

      $scope.treeNodeSelectedDEP = function (item) {
        delete $scope.edFromTreeNode;
        if (item.node && item.node.data && item.node.data.ed) {
          $scope.edFromTreeNode = item.node.data.ed;
          $scope.$digest(); //the event originated outside of angular...
        }
      };

      //when a resource tye is selected in the builder
      $scope.typeSelected = function (type) {
        $scope.type = type;
        delete $scope.query; //remove the current query
        $scope.input.selectedType = type;
        $scope.input.selectedSearchParam = {}; //clear the list of selected parameters
        $scope.input.selectedSearchParamValue = {}; //... and the parameter values

        delete $scope.searchParamList;
        delete $scope.includeList;

        if ($scope.redoxMode) {
          $scope.redoxBodyManualOverride = false;
        }

        if ($scope.hashResource[type.name]) {
          $scope.searchParamList = $scope.hashResource[type.name].searchParam;

          //locate all the potential _includes
          let ar = $scope.hashResource[type.name].searchParam;
          if (ar) {
            $scope.includeList = ar.filter((item) => item.type == "reference"); // paramList;
          }
        } else {
          console.log("No hashResource for " + type.name);
        }

        $scope.buildQuery();
      };

      $scope.removeFromHistory = function (inx) {
        $localStorage.queryHistory.splice(inx, 1);
      };

      $scope.executeFromHistory = function (hx) {
        if ($scope.redoxMode) {
          alert(
            "History replay is not available for Redox servers. Please re-run the query from the builder.",
          );
          return;
        }
        //use the current server for the query - may not be the same as in the history...
        let qry = $scope.server.url + hx.query;
        $scope.query = qry;
        executeQuery(qry, hx.type, true);
      };

      //when a resource type is selected in the list
      $scope.showType = function (type) {
        if ($scope.redoxMode) {
          $scope.selectedType = type;
          return;
        }
        clear();
        delete $scope.selectedProfile;
        $scope.selectedType = type;
        //type.type is the actual type - tyep is an instance ot rest[x].resource...

        let pseudoProfile = {
          resourceElements: $scope.resourceElements[type.type],
        };
        pseudoProfile.header = { name: type.type };
        let treeData = commonSvc.makeTree(pseudoProfile);

        var id = "#pfTreeViewConf";

        $(id).jstree("destroy");
        $(id)
          .jstree({
            core: {
              multiple: false,
              data: treeData,
              themes: { name: "proton", responsive: true },
            },
          })
          .on("select_node.jstree", function (e, data) {
            if (data.node.data) {
              $scope.edFromTreeNode = data.node.data;
            }
            $scope.$digest();
          });
      };

      $scope.executeAdHoc = function (qry) {
        if ($scope.redoxMode) {
          alert(
            "Ad-hoc queries are not supported for Redox servers. Use the Query Builder instead.",
          );
          return;
        }
        let ar = qry.split("?");
        let type = { name: ar[0] };
        executeQuery($scope.server.url + qry, type);
      };

      //---------------- support for operations. todo - read from capability statement
      $scope.serverOperations = [];
      let summaryOp = { name: "Summary", params: [] };
      summaryOp.params.push({ display: "Identifier", type: "identifier" });

      $scope.selectServerOperation = function (item) {
        $scope.selectedServerOperation = item;
      };

      $scope.executeServerOperation = function () { };

      //------------------

      $scope.doit = function () {
        $scope.buildQuery();

        if ($scope.redoxMode) {
          let payload = {};
          if ($scope.redoxRequestBody && $scope.redoxRequestBody.trim().length) {
            try {
              payload = JSON.parse($scope.redoxRequestBody);
            } catch (ex) {
              alert(
                "The Redox request body is not valid JSON. Please correct the body before executing.\n" +
                  ex,
              );
              return;
            }
          }

          const requestUrl =
            ($scope.redoxRequest && $scope.redoxRequest.url) || $scope.query;
          const typeName =
            ($scope.input.selectedType && $scope.input.selectedType.name) || "";
          executeQuery(requestUrl, typeName, false, payload);
          return;
        }

        let type = $scope.input.selectedType.name;
        executeQuery($scope.query, type);
      };

      let executeQuery = function (qry, type, executeFromHistory, redoxPayload) {
        // $scope.buildQuery();        //always make sure the query is correct;
        delete $scope.response;
        //delete $scope.sortedResponse;
        delete $scope.err;
        delete $scope.result.selectedEntry;
        delete $scope.validateResult;

        delete $scope.xmlResource;
        delete $scope.selectedResource;
        delete $scope.selectedResourceVersions;
        delete $scope.redoxResponse;
        $("#queryResourceTree").jstree("destroy");

        delete $scope.isBundle;

        if ($scope.redoxMode) {
          const requestConfig = angular.copy($scope.redoxRequest || {});
          const targetUrl = requestConfig.url || qry;
          const method = (requestConfig.method || "POST").toUpperCase();
          const headers = angular.copy(requestConfig.headers || {});

          if (!headers.Accept) {
            headers.Accept = "application/json";
          }
          if (method !== "GET" && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
          }

          let accessToken = $scope.input.accessToken;
          if (accessToken) {
            headers.Authorization = "Bearer " + accessToken;
          }

          if ($scope.server.apiKey) {
            headers["x-api-key"] = $scope.server.apiKey;
          }

          const httpConfig = {
            method: method,
            url: targetUrl,
            headers: headers,
          };

          if (method !== "GET") {
            let payload = redoxPayload;
            if (payload === undefined) {
              payload = {};
            }
            httpConfig.data = payload;
          }

          $scope.query = method + " " + targetUrl;
          $scope.waiting = true;

          if ($scope.input.useProxy) {
            httpConfig.url = "/proxyfhir/" + targetUrl;
          }

          $http(httpConfig)
            .then(
              function (data) {
                $scope.redoxResponse = data.data;
                $scope.response = { data: data.data };
                $scope.input.showQuery = false; //hide the query builder tab contents
                $scope.input.showResults = true; //show the results
              },
              function (err) {
                $scope.err = err;
                $scope.response = { data: {} };
                $scope.input.showQuery = false; //hide the query builder tab contents
                $scope.input.showResults = true; //show the results
              },
            )
            .finally(function () {
              $scope.waiting = false;
            });

          return;
        }

        let config = { headers: { Accept: "application/fhir+json" } };
        let accessToken = $scope.input.accessToken;
        if (accessToken) {
          config.headers.Authorization = "Bearer " + accessToken;
        }

        if ($scope.server.apiKey) {
          config.headers["x-api-key"] = $scope.server.apiKey;
        }

        $scope.query = qry;
        $scope.waiting = true;

        //if using the CF proxy
        if ($scope.input.useProxy) {
          qry = "/proxyfhir/" + qry;
        }

        $http
          .get(qry, config)
          .then(
            function (data) {
              $scope.response = data;

              if (data.data && data.data.resourceType == "Bundle") {
                $scope.isBundle = true;
              } else {
                //this is a single resource - set the selected resource representatons (json, xml, tree etc.)
                $scope.selectEntry({ resource: data.data });
              }

              $scope.input.showQuery = false; //hide the query builder tab contents
              $scope.input.showResults = true; //show the results

              //if this is query that hasn't been performed before - add it to the history...
              if (!executeFromHistory) {
                let anonQuery = qry.replace($scope.server.url, ""); //remove the server...

                let ar = $localStorage.queryHistory.filter(
                  (item) =>
                    item.query == anonQuery && item.server == $scope.server.url,
                );

                //todo need a better solution for ad hoc queries
                let typeName = "";
                if ($scope.type) {
                  typeName = $scope.type.name;
                }

                if (ar.length == 0) {
                  let hx = {
                    type: typeName,
                    server: $scope.server.url,
                    query: anonQuery,
                  };

                  $localStorage.queryHistory.splice(0, 0, hx);

                  if (
                    $scope.commonTypes.filter((item) => item == typeName).length ==
                    0
                  ) {
                    $scope.commonTypes.push(typeName);
                    $scope.commonTypes.sort();
                  }
                }
              }

              $scope.input.parameters = "";

              let options = {
                bundle: data.data,
                hashErrors: {},
                serverRoot: $scope.server.url,
              };
              drawGraph(options);
            },
            function (err) {
              $scope.err = err;
              $scope.response = { resourceType: "Bundle", entry: [] };
              $scope.input.showQuery = false; //hide the query builder tab contents
              $scope.input.showResults = true; //show the results
            },
          )
          .finally(function () {
            $scope.waiting = false;
          });
      };

      //display the bundle in the results pane
      $scope.showBundleDEP = function (bundle) {
        delete $scope.result.selectedEntry;
        delete xmlResource;
        $scope.bundle = bundle;

        //$scope.result.selectedEntry = bundle;
        $("#queryResourceTree").jstree("destroy"); //don't render the tree (todo though might look into this later)
      };

      $scope.validate = function (resource) {
        delete $scope.validateResult;
        let config = {},
          qry = {};
        if ($scope.input.useHapi) {
          qry =
            "http://hapi.fhir.org/baseR4/" +
            resource.resourceType +
            "/$validate";
        } else {
          if ($scope.server.apiKey) {
            config.headers = config.headers || {};
            config.headers["x-api-key"] = $scope.server.apiKey;
          }
          qry = $scope.server.url + resource.resourceType + "/$validate";
        }
        /* tmp

*/
        //let qry = $scope.server.url + resource.resourceType + "/$validate"

        //console.log(qry)
        $http.post(qry, resource, config).then(
          function (data) {
            $scope.validateResult = data.data;
          },
          function (err) {
            $scope.validateResult = err.data;
          },
        );
      };

      //one of the versions of a resource with history is shown
      $scope.selectVersion = function (resource) {
        $scope.showResource(resource);
      };

      //select an entry from the query result
      $scope.selectEntry = function (entry) {
        delete $scope.bundle;
        delete $scope.xmlResource;
        delete $scope.selectedResource;
        delete $scope.selectedResourceVersions;
        delete $scope.validateResult;

        if (!entry) {
          return;
        }

        $scope.showResource(entry.resource);

        //get the versions = todo - check if supported in CS
        let qryVersion =
          $scope.server.url +
          entry.resource.resourceType +
          "/" +
          entry.resource.id +
          "/_history";
        let config = {};
        if ($scope.input.accessToken) {
          config.headers = {
            Authorization: "Bearer " + $scope.input.accessToken,
          };
        }

        if ($scope.server.apiKey) {
          config.headers = config.headers || {};
          config.headers["x-api-key"] = $scope.server.apiKey;
        }

        $http.get(qryVersion, config).then(
          function (data) {
            //only if tthere is more than one version
            if (data.data && data.data.entry && data.data.entry.length > 1) {
              $scope.selectedResourceVersions = data.data;
            }
          },
          function (err) {
            console.log(err);
          },
        );
      };

      //display the details of a single resource
      $scope.showResource = function (resource) {
        if (!resource) {
          return;
        }

        $scope.selectedResource = resource;

        //Otherwise the json shown in the resource graph is the last one chosen - looks weird
        $scope.input.selectedResourceFromSingleGraph = resource;

        var r = angular.copy(resource);
        var newResource = angular.fromJson(angular.toJson(r));

        //draw the graph
        getGraphOneResource(r);

        //get the fsh
        getFSH(r);

        //show the tree
        var treeData = resourceCreatorSvc.buildResourceTree(newResource);
        //convert json to  XML on the server - utilizes the lantana library...
        let qry = "transformXML";
        $http.post(qry, resource).then(
          function (data) {
            $scope.xmlResource = vkbeautify.xml(data.data);
          },
          function (err) {
            $scope.xmlResource =
              "<error>Sorry, Unable to load Xml version</error>";
          },
        );

        //show the tree of this version
        $("#queryResourceTree").jstree("destroy");
        $("#queryResourceTree").jstree({
          core: {
            multiple: false,
            data: treeData,
            themes: { name: "proton", responsive: true },
          },
        });
      };

      let getFSH = function (resource) {
        delete $scope.selectedFshFromSingleGraph;
        $http.post("./fsh/transformJsonToFsh", resource).then(
          function (data) {
            //console.log(data.data)
            try {
              let response = data.data;
              $scope.selectedFshFromSingleGraph =
                response.fsh.instances[resource.id];

              if (response.fsh.aliases) {
                $scope.selectedFshFromSingleGraph =
                  response.fsh.aliases +
                  "\n\n" +
                  $scope.selectedFshFromSingleGraph;
              }
            } catch (ex) {
              $scope.selectedFshFromSingleGraph =
                "Unable to transform into FSH";
            }
          },
          function (err) {
            console.log("FSH Transform error");
          },
        );
      };

      //create the graph of a single resource with connections...
      let getGraphOneResource = function (resource) {
        delete $scope.tooLargeForGraphSingle;
        if (!resource) {
          return;
        }

        console.log("Graphing " + resource.resourceType + "/" + resource.id);

        let options = {
          bundle: $scope.response.data,
          hashErrors: {},
          serverRoot: $scope.server.url,
        };
        options.centralResourceId =
          $scope.server.url + resource.resourceType + "/" + resource.id;
        options.showInRef = true;
        options.showOutRef = true;
        options.recursiveRef = true;
        options.hidePatient = $scope.input.showHidePatient;

        let vo = v2ToFhirSvc.makeGraph(options);
        //let vo = v2ToFhirSvc.makeGraph($scope.fhir,$scope.hashErrors,$scope.serverRoot,false,id)
        //console.log(vo);

        if (vo.nodes.length > 100) {
          $scope.tooLargeForGraphSingle = true;
          return;
        }

        let container = document.getElementById("singleResourceGraph");
        let graphOptions = {
          physics: {
            enabled: true,
            barnesHut: {
              gravitationalConstant: -10000,
            },
          },
        };
        $scope.singleResourceGraph = new vis.Network(
          container,
          vo.graphData,
          graphOptions,
        );

        $scope.singleResourceGraph.on("click", function (obj) {
          delete $scope.input.selectedResourceFromSingleGraph;
          var nodeId = obj.nodes[0]; //get the first node
          var node = vo.graphData.nodes.get(nodeId);
          $scope.input.selectedResourceFromSingleGraph = node.resource;

          $scope.$digest();
        });
      };

      //fits the graph of a single resource
      $scope.fitSingleResourceGraph = function () {
        $timeout(function () {
          if ($scope.singleResourceGraph) {
            $scope.singleResourceGraph.fit();
          }
        }, 1000);
      };

      //fits the entire graph (if shown - must be < 100 nodes)
      $scope.fitGraph = function () {
        $timeout(function () {
          if ($scope.chart) {
            $scope.chart.fit();
          }
        }, 1000);
      };

      function drawGraph(options) {
        delete $scope.tooLargeForGraph;
        let start = new Date();
        let vo = v2ToFhirSvc.makeGraph(options);

        if (vo.nodes.length > 100) {
          $scope.tooLargeForGraph = true;
          return;
        }

        console.log("Time to make graph data ", moment().diff(start));
        start = new Date();

        var container = document.getElementById("bundleGraph");
        var graphOptions = {
          physics: {
            enabled: true, //big gratph take ages
            barnesHut: {
              gravitationalConstant: -10000,
            },
            stabilization: {
              iterations: 1000,
            },
          },
          layout: {
            improvedLayout: false,
          },
        };

        $scope.chart = new vis.Network(container, vo.graphData, graphOptions);

        $scope.chart.on("stabilizationIterationsDone", function () {
          console.log("Time to complete graph draw", moment().diff(start));
        });

        $scope.chart.on("click", function (obj) {
          var nodeId = obj.nodes[0]; //get the first node
          var node = vo.graphData.nodes.get(nodeId);
          $scope.selectedNode = node;

          //this is the entry that is selected from the 'bundle entries' tab...
          //$scope.selectedBundleEntry = node.entry;

          $scope.selectEntry(node.entry);

          $scope.$digest();
        });
      }
    },
  );
