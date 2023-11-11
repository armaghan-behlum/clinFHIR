//========= proxy endpoints=======

const request = require('request');

function setup(app) {
    app.get('/proxyfhir/*', function (req, res) {
        var fhirQuery = req.originalUrl.substr(11); //strip off /proxyfhir
        let bearerToken = null
        if (req.headers.authorization) {
            bearerToken = req.headers.authorization.split(' ')[1];
        }
        console.log('proxying: '+ fhirQuery)
        var options = {
            method: 'GET',
            uri: fhirQuery,
            encoding: null
        };

        options.headers = {accept: 'application/fhir+json, application/json','content-type':'application/json}'};
        request(options, function (error, response, body) {
            if (error) {
                console.log('error:', error)
                var err = error || body;
                res.send(err, 500)
            } else if (response && response.statusCode !== 200) {
                console.log(response.statusCode)
                // res.status(response.statusCode).body(body)
                res.send(body, response.statusCode);//,'binary')
            } else {
                res.send(body);//,'binary')
            }
        }).auth(null, null, true, bearerToken)
    });

    app.post('/proxyfhir/*', function (req, res) {
        var fhirQuery = req.originalUrl.substr(11); //strip off /proxyfhir
        console.log('proxying: '+ fhirQuery)
        debugger;


        let payload= "";
        req.on('data', function (data) {
            payload += data;
        });

        req.on('end', function () {


        //console.log('payload',payload)
            let options = {
                method: 'POST',
                uri: fhirQuery,
                body: payload,
                headers: {'content-type': 'application/json'},
                encoding: null
            };

            request(options, function (error, response, body) {
                if (error) {
                    console.log('error:', error)
                    var err = error || body;
                    res.send(err, 500)
                } else if (response && response.statusCode !== 200) {
                    console.log('---------------');
                    console.log(response.statusCode);
                    console.log(body.toString());
                    console.log('---------------');
                    res.send(body, response.statusCode);//,'binary')
                } else {

                    res.send(body);//,'binary')

                }
            })

        })

    });
}

module.exports= {
    setup : setup
}