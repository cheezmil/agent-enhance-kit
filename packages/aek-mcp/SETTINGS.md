# AEK-MCP 配置说明

## 配置文件路径

`~/.aek/mcp/settings.jsonc`

- Windows: `C:\Users\<用户名>\.aek\mcp\settings.jsonc`
- Linux/macOS: `~/.aek/mcp/settings.jsonc`

路径通过 `os.UserHomeDir()` 自动获取，跨平台通用。

## 文件格式

JSONC 格式，支持 `//` 行注释和 `/* */` 块注释。

### 结构

```jsonc
{
  "<服务名>": {
    "<服务名>": {
      // MCP 标准配置（command, args, env, type, url, headers）
    },
    "enabled": true,
    "owner": "admin"
  }
}
```

- **顶层 key**：服务名（如 `exa`、`CTM`）
- **内层同名 key**：纯 MCP 标准配置，不允许添加任何非标准字段
- **enabled**：是否启用该服务（可选，默认 true）
- **owner**：服务归属（可选）

### MCP 标准字段

#### stdio 传输（本地命令）

```jsonc
{
  "my-service": {
    "my-service": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "env": {
        "API_KEY": "your-key"
      }
    },
    "enabled": true,
    "owner": "admin"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| command | string | 是 | 执行的命令 |
| args | string[] | 否 | 命令参数 |
| env | object | 否 | 环境变量 |
| type | string | 否 | 可省略，自动推断为 `stdio` |

#### http 传输（远程 HTTP）

```jsonc
{
  "remote-service": {
    "remote-service": {
      "type": "http",
      "url": "https://mcp.example.com/api",
      "headers": {
        "Authorization": "Bearer token"
      }
    },
    "enabled": true,
    "owner": "admin"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | `"http"` |
| url | string | 是 | HTTP 端点 URL |
| headers | object | 否 | HTTP 请求头 |
| env | object | 否 | 环境变量 |

#### sse 传输（Server-Sent Events，已弃用）

```jsonc
{
  "sse-service": {
    "sse-service": {
      "type": "sse",
      "url": "http://localhost:8080/sse"
    },
    "enabled": false
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | `"sse"` |
| url | string | 是 | SSE 端点 URL |
| headers | object | 否 | HTTP 请求头 |
| env | object | 否 | 环境变量 |

## 完整示例

```jsonc
{
  // 本地 stdio 服务
  "exa": {
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server", "tools=get_code_context_exa,web_search_exa"],
      "env": {
        "EXA_API_KEY": "your-api-key"
      }
    },
    "enabled": true,
    "owner": "admin"
  },

  // 远程 streamable-http 服务
  "CTM": {
    "CTM": {
      "type": "streamable-http",
      "url": "http://localhost:1112/mcp"
    },
    "enabled": true,
    "owner": "admin"
  },

  // 禁用的服务
  "playwright": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": {}
    },
    "enabled": false,
    "owner": "admin"
  }
}
```

## 注意事项

- `enabled` 和 `owner` 是 aek-mcp 独有字段，不属于 MCP 官方标准
- MCP 标准配置对象内禁止添加 `enabled`、`owner` 等非标准字段
- 服务名（顶层 key）和内层 key 必须一致
- 修改配置后需要重启服务或通过 Web 界面重新加载
