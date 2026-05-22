/*
Package protocol implements the Desktop local proxy pipeline bridging client ingress payloads to upstream provider wire shapes via a shared intermediate representation (request + response IR).

Non-stream responses may pass through gzip/deflate/br-decoded plaintext as JSON identity when ingress==egress, or transcribe between styles. Streaming relays decode upstream text/event-stream in the egress shape, optionally through a streaming decompressor, and re-encode to the ingress SSE wire shape expected by that client.
*/

package protocol
