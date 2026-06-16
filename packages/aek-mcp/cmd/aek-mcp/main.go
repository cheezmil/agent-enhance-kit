package main

import (
	"fmt"
	"os"

	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/handlers"
	"github.com/cheezmil/aek-mcp/internal/services"
)

func main() {
	config.Load()
	services.InitStore()

	r := handlers.SetupRouter()

	addr := config.AppConfig.Host + ":" + config.AppConfig.Port
	fmt.Printf("Server is running on %s\n", addr)
	fmt.Printf("API available at http://localhost:%s/api\n", config.AppConfig.Port)

	if err := r.Run(addr); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start server: %v\n", err)
		os.Exit(1)
	}
}
