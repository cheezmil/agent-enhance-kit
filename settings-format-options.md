# settings.jsonc 结构方案（修订版）

核心约束：MCP 标准字段对象内禁止添加任何 aek 字段。

---

## 方案 1：顶层 mcpServers + aekMeta 两个并列对象

```jsonc
{
  "exa": {
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": { "EXA_API_KEY": "..." }
    },
    "enabled": true,
    "owner": "admin"
  }

}
```

---

## 方案 2：两个独立文件

`~/.aek/mcp/settings.jsonc`（纯 MCP）：
```jsonc
{
  "exa": {
    "command": "npx",
    "args": ["-y", "exa-mcp-server"],
    "env": { "EXA_API_KEY": "..." }
  }
}
```

`~/.aek/mcp/aek.jsonc`（aek 独有）：
```jsonc
{
  "exa": {
    "enabled": true,
    "owner": "admin"
  }
}
```

---

## 方案 3：服务名 + __meta 后缀并列

```jsonc
{
  "exa": {
    "command": "npx",
    "args": ["-y", "exa-mcp-server"],
    "env": { "EXA_API_KEY": "..." }
  },
  "exa__meta": {
    "enabled": true,
    "owner": "admin"
  }
}
```

---

## 方案 4：数组，name 标识，aek 独立字段

```jsonc
[
  {
    "name": "exa",
    "command": "npx",
    "args": ["-y", "exa-mcp-server"],
    "env": { "EXA_API_KEY": "..." },
    "enabled": true,
    "owner": "admin"
  }
]
```
注：enabled/owner 和 MCP 字段同层但属于数组元素的扩展属性。

---

## 方案 5：数组，mcp 对象纯隔离

```jsonc
[
  {
    "name": "exa",
    "mcp": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": { "EXA_API_KEY": "..." }
    },
    "enabled": true,
    "owner": "admin"
  }
]
```

---

## 方案 6：顶层 sections 分区

```jsonc
{
  "exa": [
    {
      "name": "exa",
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": { "EXA_API_KEY": "..." }
    }
  ],
  "aek": [
    {
      "name": "exa",
      "enabled": true,
      "owner": "admin"
    }
  ]
}
```
