package subscriptionauth

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestPrepareCallbackPortAllowsReuseAfterClose(t *testing.T) {
	ln, err := net.Listen("tcp", callbackHost+":0")
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
	ln, err := net.Listen("tcp", callbackHost+":0")
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
	ln, err := net.Listen("tcp", callbackHost+":0")
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
		_, _ = http.Get("http://" + callbackHost + ":" + strconv.Itoa(port) + "/done")
	}()
	if _, err := server.Wait(ctx); err != nil {
		t.Fatalf("wait: %v", err)
	}
	server.Close()
	if err := tryListenCallbackPort(port); err != nil {
		t.Fatalf("expected port released after close: %v", err)
	}
}

func TestOAuthSuccessHTMLIsEnglishAndAutoCloses(t *testing.T) {
	rec := httptest.NewRecorder()
	writeOAuthHTML(rec, http.StatusOK, "success", "Authorization complete. You can return to ClovAPI.", "")
	body := rec.Body.String()
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	for _, want := range []string{`<html lang="en">`, "Login successful", "window.close()", "This window will close automatically"} {
		if !strings.Contains(body, want) {
			t.Fatalf("success HTML missing %q: %s", want, body)
		}
	}
	if strings.Contains(body, "登录") || strings.Contains(body, "授权") {
		t.Fatalf("success HTML should be English: %s", body)
	}
}
