/*
Package protocol implements the Desktop local proxy pipeline bridging client ingress payloads to upstream provider wire shapes via a shared intermediate representation (request + response IR).

All relayed upstream calls use stream:true. Downstream responses are SSE-shaped; upstream text/event-stream is relayed or transcoded, and buffered JSON upstream bodies are materialized into ingress SSE.
*/

package protocol
