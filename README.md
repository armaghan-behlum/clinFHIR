# FHIR Query Viewer

This project is a fork of [clinFHIR](https://github.com/armaghan-behlum/clinFHIR) with the purpose of trimming down the project just to the Query Viewer functionality

# Installation

1.  Clone (or download) the repository
2.  run `python -m http.server`
3.  In a browser, navigate to _http://localhost:8000/query.html_

# Usage

As described above, this app is really targetted to 2 distinct sets of users.

### Working with Redox endpoints

Redox query support is available through a lightweight adapter that provides
synthetic capability metadata. Select **Redox Sandbox (REST)** from the server
drop-down to load the bundled configuration from
`artifacts/redox-endpoints.json`. The query builder shows the available Redox
data models and generates the JSON payload required for each request. You can
edit the generated payload before executing the call and inspect the raw JSON
response in the results panel. To add additional Redox endpoints, copy the
structure used in `artifacts/redox-endpoints.json` and include the new server in
`config.allKnownServers` (see `js/appConfigSvc.js`).

Redox calls require a valid access token and optional custom headers. Enter the
token in the **Access token** field before executing the query. When running the
app locally you can proxy requests through the built-in `/proxyfhir` endpoint to
avoid CORS restrictions.

### Run with Docker

Use the provided `Makefile` to build an image and start the application in a
container:

```bash
make redox-up
```

The command builds an image named `clinfhir-redox` and launches a container with
port `8000` exposed locally. Open <http://localhost:8000> to access the query
viewer. Stop the container when you are finished:

```bash
make redox-down
```

## Developers

There is a need in the FHIR community for a component that can generate sample fhir resources from profiles (StructureDefinition resources). These are useful for educational purposes, to help a profile designer understand what the conformant instances will look like, and to generate examples that are really helpful for other developers.

The current app goes some way towards meeting this need, but suffers from a number of bugs with the more complex resource types and doesn't manage extensions at all well. The hope is that a small community of developers will add their expertise to enhancing the component - effectively moving it from the current 'single developer' project to one supported by a community.

## artifacts

Configuration files such as _options.json_ which contains options for the sample generation (eg resources to use, sample codesets etc)

## css

Style sheerts and image files

## fonts

Fonts

## includes

HTML files that are 'included' in the main html file

## js

JavaScript files used by the sample creator (not the resource builder ).

- _appConfigSvc.js_ - returns the configuration object - noteably the servers to use. Also used by the resource builder
- _services.js_ - services used by the resource creator.
