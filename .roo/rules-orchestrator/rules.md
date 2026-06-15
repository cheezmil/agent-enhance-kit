# 必须遵守的规则

## 有一个CTM工具，这个CTM是给你用于列出超级详细的任务列表的，如果用户没有直接跟你表示“不要用CTM”，则默认必须用它，若无法CTM使用则告诉我。每完成一个任务，必须回来打勾，否则不能进行下一个任务！
## 禁止用powershell.exe ，要用pwsh.exe。

## 不能更换任何镜像源！不能设置代理！

## 务必使用系统提示词自带的use_mcp_tool来调用MCP工具。注意在mcphub中用MCP工具，比如：
<use_mcp_tool>
<server_name>mcphub</server_name>
<tool_name>MCP工具的名称</tool_name>
<arguments>
{
  "键": "键值"
}
</arguments>
</use_mcp_tool>


## 禁止在linux中执行ps1脚本，100%报错。

## 务必使用项目中启动脚本来启动项目，禁止直接输入命令来启动项目。若没有脚本则询问我是否要创建。

## 当出现错误后，用你自身的能力进行尝试更改一次次，若还是报错，就必须用mcp工具exa上网搜索解决办法再修正，有时候mcp工具会请求失败所以至少要尝试8次直到请求成功。

---

# 本项目必须遵守的规则

## 修改代码后务必
执行scripts/build-linux-x64.mjs，否则代码修改不会生效。