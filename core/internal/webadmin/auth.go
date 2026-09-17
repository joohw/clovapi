package webadmin

import (
	"context"
	"fmt"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/subscriptionauth"
	"github.com/google/uuid"
	"path/filepath"
	"strings"
	"time"
)

type loginJob struct {
	ID       string                       `json:"id"`
	Provider string                       `json:"provider"`
	URL      string                       `json:"authorizeUrl,omitempty"`
	Done     bool                         `json:"done"`
	Result   subscriptionauth.LoginResult `json:"result"`
	cancel   context.CancelFunc
	created  time.Time
}

func (s *Server) startLogin(provider, ref string) (any, error) {
	if provider != "codex" && provider != "claude-code" {
		return nil, fmt.Errorf("unsupported subscription provider")
	}
	var credentialPath string
	if ref != "" {
		if !filepath.IsLocal(ref) {
			return nil, fmt.Errorf("credential path must be config-relative")
		}
		dir, err := config.Dir()
		if err != nil {
			return nil, err
		}
		credentialPath = filepath.Join(dir, ref)
		if !strings.HasPrefix(credentialPath, filepath.Join(dir, "subscription")+string(filepath.Separator)) {
			return nil, fmt.Errorf("credential path must be inside subscription/")
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.jobs == nil {
		s.jobs = make(map[string]*loginJob)
	}
	for id, job := range s.jobs {
		if job.Done && time.Since(job.created) > 5*time.Minute {
			delete(s.jobs, id)
			continue
		}
		if !job.Done {
			return nil, fmt.Errorf("a subscription login is already in progress")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	job := &loginJob{ID: uuid.NewString(), Provider: provider, cancel: cancel, created: time.Now()}
	s.jobs[job.ID] = job
	go func() {
		defer cancel()
		result := subscriptionauth.LoginToPath(ctx, provider, credentialPath, func(url string) {
			s.mu.Lock()
			job.URL = url
			s.mu.Unlock()
		})
		s.mu.Lock()
		job.Result = result
		job.Done = true
		s.mu.Unlock()
	}()
	return map[string]any{"ok": true, "id": job.ID}, nil
}

func (s *Server) pollLogin(id string) (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	job := s.jobs[id]
	if job == nil {
		return nil, fmt.Errorf("login session expired")
	}
	return map[string]any{"ok": true, "id": job.ID, "authorizeUrl": job.URL, "done": job.Done, "result": job.Result}, nil
}
func (s *Server) cancelLogin(provider string) (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, job := range s.jobs {
		if job.Provider == provider && !job.Done {
			job.cancel()
		}
	}
	return map[string]any{"ok": true}, nil
}
func (s *Server) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, job := range s.jobs {
		job.cancel()
	}
}
