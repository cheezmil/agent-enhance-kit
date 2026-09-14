// Package diag 提供 aek-websearch 的诊断/日志能力。
//
// 目标：让 aek 自己就能告诉用户「问题在哪」，而不是靠手动 printf/echo。
// 设计原则：
//   - 所有日志写 stderr，绝不污染 stdout（stdout 留给结构化输出 / 结果）。
//   - 日志中绝不出现明文 API key —— 一律经 maskKey 处理。
//   - 通过 --verbose / -v 或 AEK_WEBSEARCH_VERBOSE=1 开启。
//   - 提供 Snapshot() 一键打印当前进程的环境自检信息（goos/goarch、
//     UserHomeDir、$HOME、配置文件路径、key 文件路径与命中数量）。
package diag

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
)

var verbose atomic.Bool

func init() {
	// 环境变量开启（用于不便加 flag 的子命令场景，如 mcp/serve）。
	v := strings.ToLower(os.Getenv("AEK_WEBSEARCH_VERBOSE"))
	if v == "1" || v == "true" || v == "yes" || v == "on" {
		verbose.Store(true)
	}
}

// SetVerbose 由 CLI flag 调用开启。
func SetVerbose(v bool) { verbose.Store(v) }

// Verbose 报告当前是否开启 verbose。
func Verbose() bool { return verbose.Load() }

// Logf 在 verbose 开启时向 stderr 打日志。生产路径静默。
// 调用方必须保证 message 中不包含明文 API key（用 maskKey 处理后再传）。
func Logf(format string, args ...interface{}) {
	if !verbose.Load() {
		return
	}
	fmt.Fprintf(os.Stderr, "[aek-diag] "+format+"\n", args...)
}

// MaskKey 把敏感 key 掩码成可安全打印的形式。
// 规则与 providers.maskKey 一致：<=8 字符全掩码，否则保留前 4 后 4。
// 单独放在 diag 包是因为 keypool 与配置/日志两处都要用，避免循环依赖。
func MaskKey(key string) string {
	if len(key) <= 8 {
		return "***"
	}
	return key[:4] + "..." + key[len(key)-4:]
}

// HomeSnapshot 返回当前进程的 home 解析快照，便于诊断跨平台路径问题。
// 包含三类候选（os.UserHomeDir / $HOME / $USERPROFILE），调用方自行展示。
func HomeSnapshot() map[string]string {
	out := map[string]string{
		"goos":              runtime.GOOS,
		"goarch":            runtime.GOARCH,
		"env_HOME":          os.Getenv("HOME"),
		"env_USERPROFILE":   os.Getenv("USERPROFILE"),
		"env_HOMEDRIVE":     os.Getenv("HOMEDRIVE"),
		"env_HOMEPATH":      os.Getenv("HOMEPATH"),
		"env_WSL_DISTRO":    os.Getenv("WSL_DISTRO_NAME"),
		"process_workdir":   mustCwd(),
	}
	if h, err := os.UserHomeDir(); err == nil {
		out["os_UserHomeDir"] = h
	} else {
		out["os_UserHomeDir_err"] = err.Error()
	}
	return out
}

func mustCwd() string {
	if c, err := os.Getwd(); err == nil {
		return c
	}
	return ""
}

// PrintSnapshot 打印环境自检快照到 stderr（不受 verbose 开关影响，
// 因为调用方通常是 doctor/自检场景，明确要求看）。
func PrintSnapshot(keysDir string, settingsPath string) {
	writeSnapshot(keysDir, settingsPath)
}

// LogEnvironment 在 verbose 模式下打印环境自检快照（同 PrintSnapshot 内容）。
// 用于 --verbose 触发的即开即用诊断。
func LogEnvironment(keysDir string, settingsPath string) {
	if !verbose.Load() {
		return
	}
	writeSnapshot(keysDir, settingsPath)
}

func writeSnapshot(keysDir string, settingsPath string) {
	s := HomeSnapshot()
	fmt.Fprintln(os.Stderr, "[aek-diag] environment snapshot:")
	fmt.Fprintf(os.Stderr, "  goos/goarch        : %s/%s\n", s["goos"], s["goarch"])
	fmt.Fprintf(os.Stderr, "  os.UserHomeDir()   : %s\n", orNA(s["os_UserHomeDir"], s["os_UserHomeDir_err"]))
	fmt.Fprintf(os.Stderr, "  $HOME              : %s\n", orNA(s["env_HOME"], ""))
	fmt.Fprintf(os.Stderr, "  $USERPROFILE       : %s\n", orNA(s["env_USERPROFILE"], ""))
	fmt.Fprintf(os.Stderr, "  $HOMEDRIVE$HOMEPATH: %s%s\n", s["env_HOMEDRIVE"], s["env_HOMEPATH"])
	if s["env_WSL_DISTRO"] != "" {
		fmt.Fprintf(os.Stderr, "  WSL_DISTRO_NAME    : %s\n", s["env_WSL_DISTRO"])
	}
	fmt.Fprintf(os.Stderr, "  cwd                : %s\n", s["process_workdir"])
	fmt.Fprintf(os.Stderr, "  settings path      : %s\n", settingsPath)
	fmt.Fprintf(os.Stderr, "  keys dir           : %s\n", keysDir)
	fmt.Fprintf(os.Stderr, "  settings exists    : %v\n", fileExists(settingsPath))
	fmt.Fprintf(os.Stderr, "  keys dir exists    : %v\n", dirExists(keysDir))
}

func orNA(v, alt string) string {
	if v != "" {
		return v
	}
	if alt != "" {
		return "<err: " + alt + ">"
	}
	return "<empty>"
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// JoinForLog 仅用于日志展示，避免在日志里手工拼路径。
func JoinForLog(elem ...string) string { return filepath.Join(elem...) }
