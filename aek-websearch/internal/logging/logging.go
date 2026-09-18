package logging

import (
	"log"
	"os"
)

// Setup 初始化简单日志器。
func Setup() *log.Logger {
	return log.New(os.Stderr, "aek ", log.LstdFlags)
}
