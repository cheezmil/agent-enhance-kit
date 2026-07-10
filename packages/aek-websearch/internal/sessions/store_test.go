package sessions

import "testing"

func TestStoreCreateAndAddQuery(t *testing.T) {
	store := NewStore()
	sess := store.CreateSession("")
	if sess == nil || sess.ID == "" {
		t.Fatal("expected session id")
	}
	if _, err := store.AddQuery(sess.ID, "hello", "discovery", 3); err != nil {
		t.Fatalf("add query failed: %v", err)
	}
	got, ok := store.GetSession(sess.ID)
	if !ok {
		t.Fatal("expected session to exist")
	}
	if len(got.Queries) != 1 {
		t.Fatalf("expected 1 query, got %d", len(got.Queries))
	}
}
