import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
if (!ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY 未设置");
}
class MCPClient {
  private mcp: Client;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }
  // 连接MCP服务器
  async connectToServer(serverScriptPath: string) {
    console.log("打印服务器脚本路径:", serverScriptPath);
    try {
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("服务器脚本必须是 .js 或 .py 文件");
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;

      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      console.log(
        "已连接到服务器，工具包括：",
        this.tools.map(({ name }) => name)
      );
    } catch (e) {
      console.log("无法连接到 MCP 服务器: ", e);
      throw e;
    }
  }
  //断开连接
  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      console.log("已断开与 MCP 服务器的连接");
    }
  }
}

async function main() {
  // 判断脚本参数数量
  if (process.argv.length < 3) {
    // 至少提供3个参数
    /**
     * 第一个参数: node 可执行文件路径
     * 第二个参数: 脚本文件路径
     * 第三个参数: MCP 服务器脚本路径
     */
    console.log("使用方法: node index.ts <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();

  /**
   * 清理资源并退出程序
   * @param code 退出代码
   */
  async function cleanupAndExit(code: number) {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    await mcpClient.disconnect();
    process.exit(code);
  }

  /**
   * 处理终止信号
   */
  function handleSignal() {
    cleanupAndExit(0).catch((err) => {
      console.error("退出时发生错误:", err);
      process.exit(1);
    });
  }

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    await mcpClient.connectToServer(process.argv[2]);
    await new Promise(() => {});
  } catch (error) {
    console.error("发生错误:", error);
    await cleanupAndExit(1);
  }
}

main();
