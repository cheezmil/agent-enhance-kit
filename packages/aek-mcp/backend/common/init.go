package common

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
)

var (
	Port          = flag.Int("port", 1351, "the listening port")
	PrintVersion  = flag.Bool("version", false, "print version and exit")
	PrintHelpFlag = flag.Bool("help", false, "print help and exit")
	LogDir        = flag.String("log-dir", "", "specify the log directory")
	EnableGzip    = flag.Bool("gzip", true, "enable gzip compression")
)

func PrintHelp() {
	fmt.Println("Copyright (C) 2025 Buru. All rights reserved.")
	fmt.Println("GitHub: https://github.com/burugo/one-mcp")
	fmt.Println("Usage: one-mcp [--port <port>] [--log-dir <log directory>] [--version] [--help]")
}

func init() {
	if err := loadConfigFile(); err != nil {
		log.Fatal(err)
	}

	// Apply system settings from ~/.aek/mcp/settings.jsonc (overrides config.ini)
	if err := ApplySystemSettings(); err != nil {
		log.Fatal(err)
	}

	if *LogDir != "" {
		var err error
		*LogDir, err = filepath.Abs(*LogDir)
		if err != nil {
			log.Fatal(err)
		}
		if _, err := os.Stat(*LogDir); os.IsNotExist(err) {
			err = os.Mkdir(*LogDir, 0777)
			if err != nil {
				log.Fatal(err)
			}
		}
	}
}
