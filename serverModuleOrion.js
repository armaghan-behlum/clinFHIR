
var fs = require('fs');
var JSONPath = require('JSONPath');
var mongoDb;
var ObjectID = require('mongodb').ObjectID;

function setup(app,db) {
    mongoDb = db;

    app.get('/orionTest/test',function(req,res){
        res.json({OK:"OK"})
    });

    app.get('/orionTest/getSamples',function(req,res){
        if (mongoDb) {
            var ar = []
            var cursor = mongoDb.collection('orionSample').find().toArray(function(err,doc){
                res.json(doc)
            });
        }
    });


    app.get('/orionTest/performAnalysis',function(req,res){
        var hl7Id = req.query.hl7;
        console.log(req.query)
        //var
        getSample(hl7Id,function(hl7Message){
            var content;
            if (hl7Message) {
                content = hl7Message.content;       //this is actually an array representation of the message
                if (! content.length) {
                    res.statusCode = 400;
                    res.json({err:'HL7 sample should be an array...'})
                }
            }
            var result =  performAnalysis(content);
            res.json(result)
        })

    });

    //retrieve a single sample from the Db...
    function getSample(id,cb) {
        var objectId = new ObjectID(id);
        var cursor = mongoDb.collection('orionSample').find({"_id": objectId}).toArray(function(err,doc){
            console.log(err,doc)
            cb(doc[0])
        });

    }

    //upload either an hl7 or a fhir document...
    app.post('/orionTest/uploadFile',function(req,res){
        var body = "";

        req.on('data', function (data) {
            var segment = data.toString('utf8');
            var plainText = new Buffer(segment, 'base64').toString()
            body += plainText;
        });

        req.on('end', function (data) {
           // body += data;
            console.log(body);

            var insert = {};

            //we separate the description from the actual sample by a '%' symbol //todo ?? move to a more robust method
            var g = body.indexOf('%');      //separator...
            var firstChar = body.substr(g+1,1);
           // console.log(g,firstChar)

            insert.content = JSON.parse(body.substr(g+1));      //actually an array...
            insert.description = body.substr(0,g);

            var messageType = 'hl7';

            //console.log(body.substring(0,1))
            //if the sample starts with a { assume it is a fhir resource    //todo ?? move to a more robust method...
            if (firstChar == '{') {
                messageType = 'fhir'
            }

            insert.type = messageType;

            if (mongoDb) {
                mongoDb.collection('orionSample').insertOne(insert,function(err,result){
                    if (err) {
                        console.log('error inserting into Db: ',err)
                        res.statusCode = 404;
                        res.json(err)

                    } else {
                        res.statusCode = 201;
                        res.json({})
                    }
                })
            } else {
                res.statusCode = 500;
                res.json({msg:"Can't load database"})
            }

        });





    })


}

//load the v2
/*
var pathToFile = "/Users/davidha/clinfhir/FHIRSampleCreator/artifacts/ADT-sample.hl7"
var hl7Str = fs.readFileSync(pathToFile,{encoding:'utf8'})

//console.log(hl7)
var vo = convertV2ToObject(hl7Str);
var hl7Hash = vo.hash;
var hl7Msg = vo.msg;
*/
//load the FHIR resource
/*
pathToFile = "/Users/davidha/clinfhir/FHIRSampleCreator/artifacts/encounter-fhir.json"
var FHIR = JSON.parse(fs.readFileSync(pathToFile,{encoding:'utf8'}));

 */
//load the mapfile
pathToFile = "./artifacts/encounterV2Mappings.json"
var Map = JSON.parse(fs.readFileSync(pathToFile,{encoding:'utf8'}));


//console.log(JSONPath({path:'class',json:FHIR}))

function performAnalysis(arHl7) {

   // if (!hl7Str ) {
      //  var pathToFile = "/Users/davidha/clinfhir/FHIRSampleCreator/artifacts/ADT-sample.hl7"
      //  hl7Str = fs.readFileSync(pathToFile,{encoding:'utf8'})
  //  }

    var vo = convertV2ToObject(arHl7);
    var hl7Hash = vo.hash;
    var hl7Msg = vo.msg;




    var response = {line:[]};


    response.v2Message = hl7Msg;
    response.v2String = arHl7;
    response.map = Map;

    var arResult = [];
    Map.forEach(function (item) {
        var result = {description: item.description};
        result.v2 = {key: item.v2, value: getFieldValue(hl7Hash,item.v2)};

        //we need to remove the first segment in the path as it isn't present in the actual resource...
        var fhirKey = item.fhir;
        var ar = fhirKey.split('.');
        ar.splice(0,1);

        result.fhir = {key: item.fhir, value:JSONPath({path:ar.join('.'),json:FHIR})}
        response.line.push(result)
    });
    return response;
}







//console.log(hl7Hash);
//var val = getFieldValue(hl7Hash,'PID-5');
//console.log('HL7 val -  ' + val)

//var fVal = JSONPath({path:'patient',json:FHIR})

//var fVal = getFHIRValue('patient.reference',FHIR)

//console.log('fhir val -  ' , fVal)




//return the value of this field. - field name is like PV1-7.9.2
function getFieldValue(hl7Hash,fieldName) {

    var response = {values:[]}

    var ar = fieldName.split('-');
    var segmentCode = ar[0];                //eg PV1
    var fieldNumberAsString = ar[1];         //eg 7.9.2
    var fieldNumber = parseInt(ar[1],10);   //eg 7

    var segments = hl7Hash[segmentCode]     //each segment is a full seg,ent - eg a PV1...
    if (! segments) {
        return
    }
    //var arValues = [];      //there can be more than one...
    segments.forEach(function(seg){
        //seg is a single segment...
        var fieldValue = seg[fieldNumber];       //the field value as a string
        response.fullValue = fieldValue;
        var ar1 = fieldNumberAsString.split('.');
        switch (ar1.length) {
            case 1 :                        //full field
                response.values.push(fieldValue)
                break;
            case 2 :                        //sub value - eg 7.9
                if (fieldValue) {
                    var arSubvalue = fieldValue.split('^');
                    if (arSubvalue.length >= ar1[1]) {

                        response.values.push(arSubvalue[ar1[1]])
                    }
                }
                break;
            case 3 :                        //sub-sub value - eg 7.9.2
                if (fieldValue) {
                    var arSubvalue = fieldValue.split('^');
                    if (arSubvalue.length >= ar1[1]) {
                        var subSubValue = ar1[1];
                        var arSS = subSubValue.split('&');
                        if (arSS.length >= ar1[2]) {
                            response.values.push(arSS[ar1[2]])
                        }



                    }
                }


                break;
        }



    })
    return response;
}

//convert an hl7 message  hash[segmentCode] = array of segments with that code
function convertV2ToObject(arHl7) {
    var hash = {}
    var arMessage = [];
    arHl7.forEach(function(line){
        var arLine = line.split('|');
        var segmentName = arLine[0];
        hash[segmentName] = hash[segmentName] || []
        hash[segmentName].push(arLine);


        arMessage.push(arLine)

    })

    //console.log(hash);
    return {hash:hash,msg:arMessage};


}

module.exports= {
    setup : setup
}

//---------  just for posterity...

//not used - but left it in there to remind me how it should work...
function getFHIRValue(path,resource) {


    var getLeafValue = function(path,resource) {
        var ar = path.split('.')
        console.log('path: ' +path)
        if (ar.length == 1) {
            //this is the node on which the target is a direct child so return it
            console.log('==>',resource[path])

            return resource[path];
        } else {
            //need to drop down a level
            var nextLevelElement = resource[ar[0]];
            console.log('nl:',nextLevelElement);
            ar.splice(0,1);     //remove the current parent
            var newPath = ar.join('.')
            return getLeafValue(newPath,nextLevelElement)
        }
    };

    var v=""
    v = getLeafValue(path,resource)

    //console.log('----===' ,resource['patient']['reference'])

    console.log('--> ',v)
    //return getLeafValue(path,resource);
}
