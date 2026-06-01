package subscriptionauth

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"testing"
	"time"
)

func TestPrepareCallbackPortAllowsReuseAfterClose(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	if err := prepareCallbackPort(port); err == nil {
		t.Fatal("expected occupied port to fail prepare")
	}
	if err := ln.Close(); err != nil {
		t.Fatal(err)
	}
	if err := prepareCallbackPort(port); err != nil {
		t.Fatalf("expected port to be free after close: %v", err)
	}
}

func TestCallbackServerReleasesPortOnCancel(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	ctx, cancel := context.WithCancel(context.Background())
	server, err := startCallbackServer(ctx, callbackOptions{
		Port: port,
		Path: "/callback",
		Validate: func(values url.Values) (callbackData, callbackError) {
			return callbackData{Code: values.Get("code")}, callbackError{}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	cancel()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if err := tryListenCallbackPort(port); err == nil {
			server.Close()
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	server.Close()
	t.Fatalf("callback port %d still occupied after cancel", port)
}

func TestCallbackServerReleasesPortAfterSuccess(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	ctx := context.Background()
	server, err := startCallbackServer(ctx, callbackOptions{
		Port: port,
		Path: "/done",
		Validate: func(values url.Values) (callbackData, callbackError) {
			return callbackData{Code: "ok"}, callbackError{}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()

	go func() {
		time.Sleep(100 * time.Millisecond)
		_, _ = http.Get("http://127.0.0.1:" + strconv.Itoa(port) + "/done")
	}()
	if _, err := server.Wait(ctx); err != nil {
		t.Fatalf("wait: %v", err)
	}
	server.Close()
	if err := tryListenCallbackPort(port); err != nil {
		t.Fatalf("expected port released after close: %v", err)
	}
}
