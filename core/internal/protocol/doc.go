/*
Package protocol bridges client ingress payloads to upstream provider wire
shapes via a shared intermediate representation (request + response IR).

Proxy route resolution, upstream URL construction, credentials, and
subscription source policy live outside this package. Downstream responses are
SSE-shaped; upstream text/event-stream is relayed or transcoded, and buffered
JSON upstream bodies are materialized into ingress SSE.
*/

package protocol
