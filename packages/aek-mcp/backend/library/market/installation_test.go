package market

import "testing"

func TestResolvePyPIInstallTarget(t *testing.T) {
	tests := []struct {
		name        string
		packageName string
		version     string
		args        []string
		expected    string
	}{
		{
			name:        "uses package and version for plain pypi install",
			packageName: "black",
			version:     "24.0.0",
			expected:    "black==24.0.0",
		},
		{
			name:        "uses from package spec for pypi source",
			packageName: "ignored",
			args:        []string{"--from", "black", "black"},
			expected:    "black",
		},
		{
			name:        "uses git source from uvx from args",
			packageName: "grok-search",
			args:        []string{"--from", "git+https://github.com/GuDaStudio/GrokSearch@grok-with-tavily", "grok-search"},
			expected:    "git+https://github.com/GuDaStudio/GrokSearch@grok-with-tavily",
		},
		{
			name:        "uses direct reference as install target",
			packageName: "ignored",
			args:        []string{"--from", "mypkg @ git+https://github.com/org/repo", "mypkg"},
			expected:    "mypkg @ git+https://github.com/org/repo",
		},
		{
			name:        "uses local path first arg when no from",
			packageName: "ignored",
			args:        []string{"./local-package", "serve"},
			expected:    "./local-package",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if actual := resolvePyPIInstallTarget(tt.packageName, tt.version, tt.args); actual != tt.expected {
				t.Fatalf("expected %q, got %q", tt.expected, actual)
			}
		})
	}
}
