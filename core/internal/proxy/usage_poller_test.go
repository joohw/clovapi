package proxy

import (
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/proxyresolve"
	"github.com/clovapi/switcher/internal/usage"
)

func usageRoute(sourceID string) proxyresolve.ForwardRoute {
	return proxyresolve.ForwardRoute{
		ProviderID: "codex",
		SourceType: "subscription",
		SourceID:   sourceID,
		BackendID:  sourceID,
	}
}

func usagePollerWithUtilization(values map[string]float64) *UsagePoller {
	poller := &UsagePoller{
		usages:    map[string]UsageSnapshot{},
		updatedAt: time.Now(),
		interval:  defaultUsagePollInterval,
	}
	for sourceID, utilization := range values {
		snapshot := UsageSnapshot{
			OK:         true,
			ProviderID: "codex",
			SourceType: "subscription",
			SourceID:   sourceID,
			Usage: usage.Result{
				Success: true,
				Tiers:   []usage.Tier{{Name: "five_hour", Utilization: utilization}},
			},
		}
		poller.usages[usageSnapshotKey(snapshot.SourceType, snapshot.SourceID, snapshot.ProviderID, "")] = snapshot
	}
	return poller
}

func routeIDs(routes []proxyresolve.ForwardRoute) []string {
	out := make([]string, 0, len(routes))
	for _, route := range routes {
		out = append(out, route.SourceID)
	}
	return out
}

func TestUsagePollerOrderRoutesPrefersConfiguredOrderBelowThreshold(t *testing.T) {
	poller := usagePollerWithUtilization(map[string]float64{"first": 95, "second": 40, "third": 20})
	routes := []proxyresolve.ForwardRoute{usageRoute("first"), usageRoute("second"), usageRoute("third")}
	got := routeIDs(poller.OrderRoutes(routes))
	want := []string{"second", "third", "first"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("route order = %v, want %v", got, want)
		}
	}
}

func TestUsagePollerOrderRoutesUsesLeastUsageWhenAllAboveThreshold(t *testing.T) {
	poller := usagePollerWithUtilization(map[string]float64{"first": 98, "second": 92, "third": 95})
	routes := []proxyresolve.ForwardRoute{usageRoute("first"), usageRoute("second"), usageRoute("third")}
	got := routeIDs(poller.OrderRoutes(routes))
	want := []string{"second", "third", "first"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("route order = %v, want %v", got, want)
		}
	}
}

func TestUsagePollerOrderRoutesOmitsExhaustedBackends(t *testing.T) {
	poller := usagePollerWithUtilization(map[string]float64{"first": 100, "second": 95})
	routes := []proxyresolve.ForwardRoute{usageRoute("first"), usageRoute("second")}
	got := routeIDs(poller.OrderRoutes(routes))
	if len(got) != 1 || got[0] != "second" {
		t.Fatalf("route order = %v, want [second]", got)
	}

	poller = usagePollerWithUtilization(map[string]float64{"first": 100, "second": 100})
	if got := poller.OrderRoutes(routes); len(got) != 0 {
		t.Fatalf("exhausted routes = %v, want none", routeIDs(got))
	}
}
