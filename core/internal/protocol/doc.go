/*
Package protocol bridges client ingress payloads to upstream provider wire
shapes via a shared intermediate representation (request + response IR).

Proxy route resolution, upstream URL construction, credentials, and
subscription source policy live outside this package. Streaming downstream
responses are SSE-shaped; non-streaming responses are returned as the ingress
JSON shape. Upstream JSON and text/event-stream bodies can both be transcoded.
*/

package protocol
