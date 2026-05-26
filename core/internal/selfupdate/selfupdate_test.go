package selfupdate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	cfgpkg "github.com/clovapi/switcher/internal/config"
)

func TestUpdateInstallsIntoConfigBin(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("tar.gz release test skipped on windows")
	}
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	binary := []byte("#!/bin/sh\necho ok\n")
	osName, archName, err := platformArch()
	if err != nil {
		t.Fatal(err)
	}
	archiveName := fmt.Sprintf("clovapi_0.1.99_%s_%s.tar.gz", osName, archName)
	archiveBytes := tarGzWithFile(t, "clovapi", binary)
	sum := sha256.Sum256(archiveBytes)
	checksums := hex.EncodeToString(sum[:]) + "  " + archiveName + "\n"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/latest.txt":
			_, _ = w.Write([]byte("v0.1.99"))
		case "/checksums.txt":
			_, _ = w.Write([]byte(checksums))
		case "/" + archiveName:
			_, _ = w.Write(archiveBytes)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	t.Setenv("CLOVAPI_CLI_LATEST_URL", srv.URL+"/latest.txt")
	t.Setenv("CLOVAPI_CLI_BASE_URL", srv.URL)

	res, err := Update(context.Background(), "", Options{})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Updated {
		t.Fatalf("expected update, got %+v", res)
	}
	target, err := cfgpkg.CliBinPath()
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, binary) {
		t.Fatalf("installed binary mismatch")
	}
}

func TestUpdateCheckOnly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("v9.9.9"))
	}))
	defer srv.Close()
	t.Setenv("CLOVAPI_CLI_LATEST_URL", srv.URL)

	res, err := Update(context.Background(), "", Options{CheckOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.LatestVersion != "9.9.9" {
		t.Fatalf("latest = %q", res.LatestVersion)
	}
}

func tarGzWithFile(t *testing.T, name string, content []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)
	if err := tw.WriteHeader(&tar.Header{
		Name: name,
		Mode: 0o755,
		Size: int64(len(content)),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestResolveTargetPathInPlaceRejectedOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows-only")
	}
	_, err := ResolveTargetPath(`C:\bin\clovapi.exe`, true)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestResolveTargetPathDefaultUsesConfigBin(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	got, err := ResolveTargetPath("/tmp/clovapi", false)
	if err != nil {
		t.Fatal(err)
	}
	want, err := cfgpkg.CliBinPath()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Clean(got) != filepath.Clean(want) {
		t.Fatalf("got %q want %q", got, want)
	}
}
