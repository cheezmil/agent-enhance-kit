package main

import (
	"encoding/json"
	"fmt"
	"os"

	"agent-enhance-kit/internal/broker"
	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/persistence"
	"agent-enhance-kit/internal/providers"
	"github.com/spf13/cobra"
)

var (
	version = "0.1.1"
)

var statusDisplay = map[string]string{
	"enabled":                              "OK",
	"disabled_by_config":                   "DISABLED (config)",
	"unavailable_missing_key":              "MISSING KEY",
	"temporarily_disabled_after_failures":  "COOLDOWN",
	"budget_exhausted":                     "BUDGET EXHAUSTED",
	"degraded":                             "DEGRADED",
	"healthy":                              "HEALTHY",
}

var rootCmd = &cobra.Command{
	Use:   "aek",
	Short: "Agent Enhance Kit - standalone search broker",
}

func emitJSON(payload interface{}) {
	data, _ := json.MarshalIndent(payload, "", "  ")
	fmt.Println(string(data))
}

func flagOrArg(cmd *cobra.Command, args []string, flagName string, idx int) string {
	if v, _ := cmd.Flags().GetString(flagName); v != "" {
		return v
	}
	if idx < len(args) {
		return args[idx]
	}
	return ""
}

func registerAllProviders(b *broker.SearchBroker) {
	b.RegisterProvider(providers.NewDuckDuckGoProvider())
	b.RegisterProvider(providers.NewMockProvider())
	b.RegisterProvider(providers.NewYahooProvider())
	b.RegisterProvider(providers.NewSerperProvider())
	b.RegisterProvider(providers.NewTavilyProvider())
	b.RegisterProvider(providers.NewExaProvider())
	b.RegisterProvider(providers.NewLinkupProvider())
	b.RegisterProvider(providers.NewWolframProvider())
	b.RegisterProvider(providers.NewYouProvider())
	b.RegisterProvider(providers.NewParallelProvider())
	b.RegisterProvider(providers.NewContext7Provider())
}

func newBroker() *broker.SearchBroker {
	persist := persistence.NewStore("aek-data.json")
	persist.Load()
	b := broker.NewSearchBrokerWithPersistence(persist)
	registerAllProviders(b)
	return b
}

func runServer() error {
	_ = config.Load()
	return nil
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
