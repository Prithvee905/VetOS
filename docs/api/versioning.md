# API versioning

The public prefix is `/api/v1`. Breaking changes ship under `/api/v2` or as a compatible addition to v1. Compatible changes are new optional fields, new endpoints, and new enum values the client can ignore.

The web application and the API are released together during the foundation period. Once an external client depends on v1, a field is not removed or renamed inside v1.

OpenAPI is the contract. Controllers that exist must match the implemented paths. Planned paths stay in the document with `x-status: planned` and are not advertised as available.
