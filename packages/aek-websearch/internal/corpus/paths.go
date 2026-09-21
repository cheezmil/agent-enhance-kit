package corpus

import "path/filepath"

// Paths 表示语料库路径集合。
type Paths struct {
	Root string
}

// DefaultPaths 返回默认路径。
func DefaultPaths(root string) Paths { return Paths{Root: root} }

// DocsCache 返回 docs cache 路径。
func (p Paths) DocsCache() string { return filepath.Join(p.Root, "docs", "cache") }
