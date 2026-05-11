package profile

import (
	"strings"
)

// EffectiveCurrent returns one fallback profile for compatibility:
// first active binding, otherwise a single saved profile.
func (s *Store) EffectiveCurrent() (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	for _, name := range s.Active {
		if p, ok := s.Get(name); ok {
			p = normalizeStoredProfileCopy(p)
			if p.BaseURL != "" && p.APIStyle != "" {
				return p, true
			}
		}
	}
	if len(s.List) == 1 {
		p := normalizeStoredProfileCopy(s.List[0])
		if p.BaseURL != "" && p.APIStyle != "" {
			return p, true
		}
	}
	return Profile{}, false
}

func normalizeStoredProfileCopy(p Profile) Profile {
	return p
}

// ActiveForCLI resolves active profile for a CLI.
func (s *Store) ActiveForCLI(cli string) (Profile, bool) {
	if s == nil || s.Active == nil {
		return Profile{}, false
	}
	name := strings.TrimSpace(s.Active[cli])
	if name == "" {
		return Profile{}, false
	}
	return s.Get(name)
}

// FirstProfileForCLI picks the first profile dedicated to this CLI.
func (s *Store) FirstProfileForCLI(cli string) (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	for _, p := range s.List {
		if string(p.CLI) == cli {
			return p, true
		}
	}
	return Profile{}, false
}
