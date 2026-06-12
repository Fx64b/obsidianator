package vault

import "strings"

// IsPublished reports whether a note opts into publishing via frontmatter.
// Following the Obsidian Publish convention, a note is published when its
// frontmatter contains `publish: true` (boolean) — the string forms "true"
// and "yes" are accepted as well since YAML authors often quote values.
func IsPublished(n *Note) bool {
	v, ok := n.Frontmatter["publish"]
	if !ok {
		return false
	}
	switch t := v.(type) {
	case bool:
		return t
	case string:
		s := strings.ToLower(strings.TrimSpace(t))
		return s == "true" || s == "yes"
	}
	return false
}

// FilterPublished returns a new VaultData containing only notes with
// `publish: true` frontmatter. Links, backlinks, edges, folders and tags
// referencing unpublished notes are stripped, and only attachments referenced
// from published note content are kept, so no unpublished content leaks into
// the exported vault-data.json.
func FilterPublished(data *VaultData) *VaultData {
	var published []Note
	for _, note := range data.Notes {
		if IsPublished(&note) {
			published = append(published, note)
		}
	}

	// Keep only attachments referenced by published content. Attachment keys
	// are lowercase basenames; content references always contain the basename
	// (with any casing), so a case-insensitive substring check is sufficient.
	attachments := map[string]string{}
	for key, relPath := range data.Attachments {
		for i := range published {
			if strings.Contains(strings.ToLower(published[i].Content), key) {
				attachments[key] = relPath
				break
			}
		}
	}

	out := rebuildVaultData(data, published, attachments)
	out.AppVersion = data.AppVersion
	return out
}
