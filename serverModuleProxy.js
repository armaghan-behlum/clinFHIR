//========= proxy endpoints=======

const request = require('request');

function setup(app) {
    app.get('/proxyfhir/*', function (req, res) {
        const fhirQuery = req.originalUrl.substr(11); //strip off /proxyfhir
        console.log('proxying: ' + fhirQuery);

        const options = {
            method: 'GET',
            uri: fhirQuery,
            encoding: null,
        };

        const headers = Object.assign({}, req.headers);
        delete headers.host;
        delete headers['content-length'];
        if (!headers.accept) {
            headers.accept = 'application/fhir+json, application/json';
        }

        options.headers = headers;

        request(options, function (error, response, body) {
            if (error) {
                console.log('error:', error);
                const err = error || body;
                res.send(err, 500);
            } else if (response && response.statusCode !== 200) {
                console.log(response.statusCode);
                res.send(body, response.statusCode); //,'binary')
            } else {
                res.send(body); //,'binary')
            }
        });
    });

    app.post('/proxyfhir/*', function (req, res) {
        const fhirQuery = req.originalUrl.substr(11); //strip off /proxyfhir
        console.log('proxying: ' + fhirQuery);

        let payload = '';
        req.on('data', function (data) {
            payload += data;
        });

        req.on('end', function () {
            const options = {
                method: 'POST',
                uri: fhirQuery,
                body: payload,
                encoding: null,
            };

            const headers = Object.assign({}, req.headers);
            delete headers.host;
            delete headers['content-length'];
            if (!headers['content-type']) {
                headers['content-type'] = 'application/json';
            }
            if (!headers.accept) {
                headers.accept = 'application/fhir+json, application/json';
            }

            options.headers = headers;

            request(options, function (error, response, body) {
                if (error) {
                    console.log('error:', error);
                    const err = error || body;
                    res.send(err, 500);
                } else if (response && response.statusCode !== 200) {
                    console.log('---------------');
                    console.log(response.statusCode);
                    console.log(body.toString());
                    console.log('---------------');
                    res.send(body, response.statusCode); //,'binary')
                } else {
                    res.send(body); //,'binary')
                }
            });
        });
    });
}

module.exports = {
    setup: setup,
};
